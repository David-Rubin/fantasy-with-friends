import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './Button'
import { ContestantGrid } from './ContestantGrid'
import { DraftLobby } from './DraftLobby'
import { DraftPickToasts } from './DraftPickToasts'
import { TimerBanner } from './TimerBanner'
import { useAuth } from '../contexts/AuthContext'
import { draftLobbyVisible, teamCapacity } from '../lib/draft'
import { entryByKey, entryKeyFor, isTeamMode, seasonEntries } from '../lib/entries'
import { draftedOwners, mergeDraftToasts, newDraftToasts, type DraftToast } from '../lib/draftToast'
import { clockOffsetMs, recordClockSample, serverNow } from '../lib/serverClock'
import { teamColorFor } from '../lib/teamColor'
import { accentLeftBorder } from './accentStyles'
import { PlayerAvatars, playerNames } from './PlayerAvatars'
import {
  submitPick,
  resolveExpiredTurn,
  assignFromBench,
  closeDraft,
  setTimerPaused,
} from '../lib/draftApi'
import { useSeasonDraft } from '../lib/useSeasonCollections'
import type { Contestant, ScoringRule, SeasonDoc, SeasonMember, SeasonTeam } from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'

/**
 * The draft itself: the wait, the board, and the settling up afterwards.
 *
 * This used to be a page of its own at /draft, one level below the season. It
 * is a section of the season page now, because once the lobby grew the cast and
 * the scoring rules there was nothing left on the season page that the room did
 * not already show — the season page during a draft was a signpost pointing at
 * a room that had everything, and the breadcrumb between them separated a
 * reader from the thing they had come for.
 *
 * So the season and its draft are one page in three phases, and which phase is
 * showing is decided by the draft document rather than by the URL. Everything
 * it needs about the season is passed in, because the page above already holds
 * it: the roster, the cast, the rules, and who is an admin.
 *
 * The completion banner is deliberately NOT here. The last pick moves the
 * season to `active` in the same transaction that completes the draft, and at
 * `active` this component is no longer mounted — so the banner lives on the
 * season page, which stays. See SeasonDetailPage.
 */
export function DraftRoom({
  seasonId,
  leagueId,
  season,
  members,
  teams,
  contestants,
  rules,
  isAdmin,
}: {
  seasonId: string
  leagueId: string
  season: SeasonDoc
  members: SeasonMember[]
  teams: SeasonTeam[]
  contestants: Contestant[]
  rules: ScoringRule[]
  isAdmin: boolean
}) {
  const { user } = useAuth()
  // `true` because this is rendered inside the season page's membership gate:
  // anyone who can see a draft at all can read its document.
  const { draft, draftLoaded } = useSeasonDraft(seasonId, true)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [togglingTimer, setTogglingTimer] = useState(false)
  const [toasts, setToasts] = useState<DraftToast[]>([])
  /**
   * Bumped whenever a clock measurement lands, and part of the banner's key.
   *
   * The banner is seeded from the deadline on its first paint and has nothing
   * to animate from — an invariant worth keeping, since the bar used to sweep
   * across on every resume. A measurement arriving after it mounted would have
   * broken it in a new way: the seed would be the uncorrected number, and the
   * first tick 250ms later would animate the correction. Remounting on a new
   * measurement re-seeds it instead, and a fresh element has no previous width
   * to transition from.
   */
  const [clockSyncs, setClockSyncs] = useState(0)

  const isPaused = draft?.status === 'paused'
  // An admin stopped the clock. Distinct from `status: 'paused'` above, which is
  // a turn that expired and is waiting on a proxy pick.
  const timerPaused =
    draft?.timerPausedRemainingMs !== null && draft?.timerPausedRemainingMs !== undefined

  async function handleToggleTimer() {
    if (togglingTimer) return
    setTogglingTimer(true)
    setPickError('')
    try {
      await setTimerPaused({ seasonId, paused: !timerPaused })
    } catch (error) {
      setPickError((error as { message?: string }).message ?? t('draft.error.toggleTimer'))
      console.error('Timer toggle rejected', error)
    } finally {
      setTogglingTimer(false)
    }
  }

  // What the draft is between: members, or teams in team mode. Every key the
  // draft document carries is one of these — see src/lib/entries.ts.
  const teamMode = isTeamMode(season)
  // Memoised because the toast effect below takes it as a dependency: a fresh
  // array every render would re-run that effect on every tick of the clock.
  const entries = useMemo(() => seasonEntries(season, members, teams), [season, members, teams])
  const myKey = entryKeyFor(
    season,
    members.find((m) => m.uid === user?.uid)
  )

  // While paused the turn still belongs to whoever missed it — they may still
  // pick if they reappear, and an admin may pick for them. In team mode the
  // turn is the team's, and any of its members may take it.
  const isMyTurn =
    (draft?.status === 'active' || isPaused) && !!myKey && draft?.currentPickerUid === myKey

  /**
   * Wake the draft's server functions on the way into the room.
   *
   * They are cold when nobody has drafted for a while, and a cold callable has
   * to boot a container and load the whole functions module before it does
   * anything — which is why the first press of Pause took the best part of ten
   * seconds while every press after it was instant. An instance stays warm for
   * a while once called, and this room is open for minutes before anyone
   * touches the clock or takes a pick.
   *
   * `warm` is an explicit flag that returns before the function reads or writes
   * anything, so this cannot collide with a real pause or a real pick. Warming
   * by asking for the state the client believes is already set would: that
   * belief can be stale by the time the server acts on it, and the moment it is
   * most likely to be stale is this one.
   *
   * It doubles as the draft's clock check. Both calls answer with the server's
   * own `Date.now()`, which is the clock a turn's deadline is written from and
   * the clock the server judges an expiry by — so comparing it with this
   * device's is what stops a phone with a wandering clock showing a countdown
   * the draft does not agree with. Two samples because the better of them
   * wins, and the first pays a cold start the second does not.
   *
   * Failure is ignored on purpose. Nothing depends on it — the only thing lost
   * is the head start, and a clock reading nobody has yet been misled by.
   *
   * Mounted with the draft rather than with the page, which is tighter than it
   * used to be: the season page is also the page for a season in setup and a
   * season being read months later, and neither is about to touch the clock.
   */
  /**
   * One reading of the server's clock, from a call that has just come back.
   *
   * Shared by the warm-up below and by a real pick, because those two differ
   * in the one way that matters to a measurement: the warm-up may be paying a
   * cold start, which is minutes of nothing followed by a slow round trip,
   * while a pick is a call to an instance that is already up. Only the fastest
   * sample is kept (see serverClock), so a pick's reading supersedes a cold
   * warm-up's without anything here having to know which was which.
   */
  const noteServerClock = useCallback((sentAt: number, serverTime?: number) => {
    if (!serverTime) return
    const before = clockOffsetMs()
    recordClockSample(sentAt, serverTime, Date.now())
    // Only a measurement that actually moved the estimate re-seeds the banner.
    if (clockOffsetMs() !== before) setClockSyncs((n) => n + 1)
  }, [])

  useEffect(() => {
    const warm = async (call: Promise<{ data: { serverNow?: number } }>) => {
      const sentAt = Date.now()
      noteServerClock(sentAt, (await call).data.serverNow)
    }
    warm(setTimerPaused({ seasonId, paused: false, warm: true })).catch(() => {})
    warm(submitPick({ seasonId, warm: true })).catch(() => {})
  }, [seasonId, noteServerClock])

  /**
   * Announce a pick on every screen in the room.
   *
   * The trigger is the contestant listener this page already has: a pick sets
   * `draftedByUid`, so every client sees it land without a listener of its own
   * and without the picker having to tell anyone. What counts as new is
   * decided in src/lib/draftToast.ts; `seenOwners` is what the previous
   * snapshot said, and starting it at null is what stops a page opened
   * mid-draft announcing every pick taken before its reader arrived.
   *
   * Deliberately outside the timer's path. The countdown is the draft
   * document's deadline and the expiry nudge above is scheduled from it, so a
   * toast appearing, sitting there or being dismissed neither restarts the
   * clock nor delays the turn — which is also why the toast owns no focus and
   * is not a modal.
   */
  const seenOwners = useRef<ReturnType<typeof draftedOwners> | null>(null)

  useEffect(() => {
    const fresh = newDraftToasts(seenOwners.current, contestants, entries, myKey)
    // Not recorded until the cast has actually arrived: the first snapshot of
    // a query can be empty, and priming from it would make the whole drafted
    // board look like it had just happened. See newDraftToasts.
    if (contestants.length > 0) seenOwners.current = draftedOwners(contestants)
    if (fresh.length === 0) return
    setToasts((current) => mergeDraftToasts(current, fresh))
    // `entries` and `myKey` are here because the wording depends on them, but
    // a change to either alone announces nothing: the snapshot recorded below
    // is already current, so every drafted contestant is one this client has
    // already seen drafted.
  }, [contestants, entries, myKey])

  // Stable, because each card holds it in an effect keyed on its own id — a
  // new function every render would restart every toast's five seconds
  // whenever anything else on the board moved.
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  /**
   * Nudge the server when the clock runs out. Purely a prompt — the server
   * re-checks its own clock and the turn identity, so a stale or duplicated
   * call does nothing. Every client runs this, which is deliberate: it means
   * the draft still moves when the member whose turn expired has disconnected.
   */
  useEffect(() => {
    if (!draft || draft.status !== 'active' || !draft.timerExpiresAt) return

    const fire = () => {
      resolveExpiredTurn({
        seasonId,
        round: draft.currentRound,
        pickNumber: draft.currentPickNumber,
      }).catch((error) => console.error('Could not resolve expired turn', error))
    }

    // On the server's clock, like the deadline itself: a device running fast
    // would otherwise nudge the server early, every turn, and be told nothing
    // had expired.
    const msLeft = draft.timerExpiresAt - serverNow()
    if (msLeft <= 0) {
      fire()
      return
    }
    // Small cushion so clients do not all fire on the exact same millisecond.
    const timer = setTimeout(fire, msLeft + 250 + Math.random() * 500)
    return () => clearTimeout(timer)
  }, [seasonId, draft])

  const available = contestants.filter((c) => !c.draftedByUid && c.eliminatedEpisode === null)
  const drafted = contestants.filter((c) => c.draftedByUid)

  // Bench settlement: a whole round went by with nobody picking, so the draft
  // halted with contestants going spare. An admin tops up and confirms
  // the close. Open slots are measured against the same capacity the server
  // enforces in assignFromBench.
  const isAwaitingClose = draft?.status === 'awaiting-close'
  const haltedForSkips = draft?.haltedReason === 'skips'
  const draftable = contestants.filter((c) => c.eliminatedEpisode === null).length
  const capacity = teamCapacity(draftable, entries.length)
  const teamsWithSlots = entries
    .map((entry) => ({
      entry,
      openSlots: Math.max(
        0,
        capacity - contestants.filter((c) => c.draftedByUid === entry.key).length
      ),
    }))
    .filter((t) => t.openSlots > 0)

  async function handleAssignFromBench(contestantId: string, toUid: string) {
    if (assigning) return
    setAssigning(true)
    setPickError('')
    try {
      await assignFromBench({ seasonId, contestantId, toUid })
    } catch (error) {
      setPickError((error as { message?: string }).message ?? t('draft.settle.assignFailed'))
      console.error('Bench assignment rejected', error)
    } finally {
      setAssigning(false)
    }
  }

  async function handleCloseDraft() {
    if (assigning) return
    setAssigning(true)
    setPickError('')
    try {
      await closeDraft({ seasonId })
      setConfirmClose(false)
    } catch (error) {
      setPickError((error as { message?: string }).message ?? t('draft.settle.closeFailed'))
      console.error('Close draft rejected', error)
    } finally {
      setAssigning(false)
    }
  }

  /**
   * A pick is one server call. Writing it from here meant four writes across
   * documents an ordinary member cannot touch, so a member's pick stalled the
   * draft halfway through. The function validates turn and availability in a
   * transaction and performs every write with the Admin SDK.
   */
  async function handlePick(contestantId: string, onBehalfOf?: string) {
    if (!draft || !user || picking) return

    setPicking(true)
    setPickError('')
    const sentAt = Date.now()
    try {
      const { data } = await submitPick({ seasonId, contestantId, onBehalfOf })
      noteServerClock(sentAt, data.serverNow)

      trackEvent('draft_pick_made', {
        round: draft.currentRound,
        pick_number: draft.currentPickNumber,
      })
      if (data.status === 'complete') {
        trackEvent('draft_completed', { season_id: seasonId, total_picks: contestants.length })
      }
      // The draft listener applies the new state — nothing to set here.
    } catch (error) {
      const message = (error as { message?: string }).message ?? t('draft.error.pick')
      setPickError(message)
      console.error('Pick rejected', error)
    } finally {
      setPicking(false)
    }
  }

  const currentPickerName = draft?.currentPickerUid
    ? (entryByKey(entries, draft.currentPickerUid)?.label ?? t('draft.unknownPicker'))
    : ''

  return (
    <>
      {/* Every pick, announced on every screen in the room. Rendered outside
          the draft's phase blocks because it is a fixed overlay: what decides
          whether anything is showing is the toast list, not the layout. */}
      <DraftPickToasts toasts={toasts} onDismiss={dismissToast} />

      {/* Lobby — the wait before the draft opens, and what there is to read
          during it. Gated on the draft listener having answered as well as on
          what it said: see draftLobbyVisible. */}
      {draftLobbyVisible(draftLoaded, draft?.status ?? null) && (
        <DraftLobby
          entries={entries}
          teamMode={teamMode}
          contestants={contestants}
          rules={rules}
          seasonId={seasonId}
          leagueId={leagueId}
          episodeCount={season.episodeCount}
          isAdmin={isAdmin}
        />
      )}

      {/* Bench settlement — picking is over, or the room went quiet */}
      {isAwaitingClose && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-blue-900">
            {haltedForSkips ? t('draft.settle.titleStalled') : t('draft.settle.titleFinished')}
          </h2>
          <p className="mt-1 text-sm text-blue-800">
            {t('draft.settle.summary', {
              bench:
                available.length === 1
                  ? t('draft.settle.benchCountOne')
                  : t('draft.settle.benchCount', { n: available.length }),
              teams:
                teamsWithSlots.length === 1
                  ? t('draft.settle.openTeamsOne')
                  : t('draft.settle.openTeams', { n: teamsWithSlots.length }),
            })}{' '}
            {isAdmin
              ? teamsWithSlots.length > 0 && t('draft.settle.adminPrompt')
              : t('draft.settle.memberPrompt')}
          </p>

          {pickError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {pickError}
            </p>
          )}

          {isAdmin && (
            <div className="mt-4 flex flex-col gap-3">
              {available.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-white px-4 py-3"
                >
                  <span className="font-medium text-gray-900 flex-1 min-w-0">{c.name}</span>
                  {teamsWithSlots.length === 0 ? (
                    <span className="text-sm text-gray-500">{t('draft.settle.noOpenSlots')}</span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`assign-${c.id}`}>
                        {t('draft.settle.assignLabel', { name: c.name })}
                      </label>
                      <select
                        id={`assign-${c.id}`}
                        defaultValue=""
                        disabled={assigning}
                        onChange={(e) => {
                          if (e.target.value) handleAssignFromBench(c.id, e.target.value)
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">{t('draft.settle.assignPlaceholder')}</option>
                        {teamsWithSlots.map(({ entry, openSlots }) => (
                          <option key={entry.key} value={entry.key}>
                            {t('draft.settle.assignOption', {
                              name: entry.label,
                              n: openSlots,
                            })}
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              ))}

              {/* Closing is confirmed only while there is a choice to make —
                  contestants still on the bench and a team that could take one.
                  With every team full, closing is the only thing left to do. */}
              <div className="mt-2">
                {confirmClose && teamsWithSlots.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-blue-900">
                      {available.length > 0
                        ? t('draft.settle.confirmWithBench', { n: available.length })
                        : t('draft.settle.confirm')}
                    </p>
                    <Button onClick={handleCloseDraft} loading={assigning}>
                      {t('draft.settle.confirmYes')}
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmClose(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() =>
                      teamsWithSlots.length > 0 ? setConfirmClose(true) : handleCloseDraft()
                    }
                    loading={assigning}
                  >
                    {t('draft.settle.close')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active draft — `paused` is still a live draft, awaiting an admin pick */}
      {(draft?.status === 'active' || isPaused) && (
        <>
          {isPaused ? (
            <div
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 flex items-center gap-3"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-amber-500 motion-safe:animate-pulse"
              />
              <div>
                <p className="font-semibold text-amber-900">
                  {t('draft.adminPicking.title', { name: currentPickerName })}
                </p>
                <p className="text-sm text-amber-700">{t('draft.adminPicking.body')}</p>
              </div>
            </div>
          ) : timerPaused ? (
            <div
              role="status"
              className="rounded-xl border border-gray-300 bg-white px-5 py-4 flex flex-wrap items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">
                  {t('draft.clockPaused.title', { name: currentPickerName })}
                </p>
                <p className="text-sm text-gray-500">
                  {t('draft.clockPaused.body', {
                    n: Math.ceil((draft.timerPausedRemainingMs ?? 0) / 1000),
                  })}
                </p>
              </div>
              {isAdmin && (
                <Button onClick={handleToggleTimer} loading={togglingTimer}>
                  {t('draft.resumeTimer')}
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Keyed on the deadline so a new one — a pick taken, the clock
                  restarted — starts a fresh countdown seeded from it, rather
                  than showing the previous turn's width for a frame and
                  animating across. */}
              <TimerBanner
                key={`${draft.timerExpiresAt}-${clockSyncs}`}
                pickerName={currentPickerName}
                timerExpiresAt={draft.timerExpiresAt}
                durationSeconds={season.timerSeconds}
                isYourTurn={isMyTurn}
              />
              {isAdmin && (
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" onClick={handleToggleTimer} loading={togglingTimer}>
                    {t('draft.pauseTimer')}
                  </Button>
                </div>
              )}
            </>
          )}

          {pickError && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {pickError}
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Contestant list */}
            <div className="lg:col-span-2">
              <ContestantGrid
                heading={t('draft.active.available', { n: available.length })}
                className="mb-6"
                contestants={available}
                cardProps={(c) => ({
                  canPick: isMyTurn,
                  canPickFor:
                    isAdmin && !isMyTurn && draft.currentPickerUid
                      ? entryByKey(entries, draft.currentPickerUid)?.label
                      : undefined,
                  onPick: () => handlePick(c.id),
                  onPickFor: () => handlePick(c.id, draft.currentPickerUid ?? undefined),
                })}
              />

              {drafted.length > 0 && (
                <ContestantGrid
                  heading={t('draft.active.drafted', { n: drafted.length })}
                  contestants={drafted}
                  cardProps={(c) => ({
                    ownerName: entryByKey(entries, c.draftedByUid)?.label,
                  })}
                />
              )}
            </div>

            {/* Team rosters */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                {t('draft.teamsHeading')}
              </h2>
              <div className="flex flex-col gap-4">
                {/* Copied before sorting: Array.sort works in place, and sorting
                    the derived array is harmless, but the habit is kept from
                    when this sorted the members state directly. */}
                {[...entries]
                  .sort((a, b) => (a.pickPosition ?? 99) - (b.pickPosition ?? 99))
                  .map((entry) => {
                    const teamContestants = contestants.filter((c) => c.draftedByUid === entry.key)
                    const isCurrentPicker = draft.currentPickerUid === entry.key
                    return (
                      <div
                        key={entry.key}
                        className={`rounded-xl border border-l-4 p-4 ${accentLeftBorder[teamColorFor(entry)]} ${isCurrentPicker ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                      >
                        <p className="text-sm font-semibold text-gray-800 mb-2">{entry.teamName}</p>
                        <p className="mb-2 flex items-center gap-2 text-xs text-gray-400">
                          <PlayerAvatars players={entry.players} />
                          <span className="min-w-0 truncate">{playerNames(entry.players)}</span>
                        </p>
                        {teamContestants.length === 0 ? (
                          <p className="text-xs text-gray-300 italic">{t('draft.noPicksYet')}</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {teamContestants.map((c) => (
                              <li key={c.id} className="text-xs text-gray-700">
                                • {c.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
