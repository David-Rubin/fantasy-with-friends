import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, collection, updateDoc, addDoc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenDoc, listenQuery, guarded } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { ContestantCard } from '../components/ContestantCard'
import { TimerBanner } from '../components/TimerBanner'
import type {
  SeasonDoc,
  DraftDoc,
  ContestantDoc,
  SeasonMemberDoc,
  MemberRole,
  Contestant,
} from '../lib/types'
import { resolvePickOrder } from '../lib/draft'
import { submitPick, resolveExpiredTurn, assignFromBench, closeDraft } from '../lib/draftApi'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'

interface MemberInfo extends SeasonMemberDoc {
  uid: string
  displayName: string
}

export function DraftRoomPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [season, setSeason] = useState<SeasonDoc | null>(null)
  const [draft, setDraft] = useState<DraftDoc | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [teamName, setTeamName] = useState('')
  const [savingTeamName, setSavingTeamName] = useState(false)
  const [startingDraft, setStartingDraft] = useState(false)
  const [picking, setPicking] = useState(false)
  const [pickError, setPickError] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  useEffect(() => {
    if (!seasonId) return
    return listenDoc(doc(db, 'seasons', seasonId), 'draft season', (snap) => {
      if (snap.exists()) setSeason(snap.data() as SeasonDoc)
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId || !user) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'members'),
      'draft members',
      guarded('draft members', async (snap) => {
        const list: MemberInfo[] = snap.docs.map((d) => {
          const data = d.data() as SeasonMemberDoc
          if (d.id === user.uid) setTeamName(data.teamName)
          // See LeagueMemberDoc.displayName — cross-user reads are denied.
          return { ...data, uid: d.id, displayName: data.displayName || d.id }
        })
        setMembers(list)
        if (leagueId) {
          const roleSnap = await getDoc(doc(db, 'leagues', leagueId, 'members', user.uid))
          if (roleSnap.exists()) setMyRole((roleSnap.data() as { role: MemberRole }).role)
        }
      })
    )
  }, [seasonId, user, leagueId])

  useEffect(() => {
    if (!seasonId) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'contestants'),
      'draft contestants',
      (snap) => {
        setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
      }
    )
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return listenQuery(collection(db, 'seasons', seasonId, 'draft'), 'draft state', (snap) => {
      if (!snap.empty) {
        setDraft(snap.docs[0].data() as DraftDoc)
      }
    })
  }, [seasonId])

  const isAdmin = myRole === 'owner' || myRole === 'admin'
  const isPaused = draft?.status === 'paused'
  // While paused the turn still belongs to whoever missed it — they may still
  // pick if they reappear, and an admin may pick for them.
  const isMyTurn = (draft?.status === 'active' || isPaused) && draft?.currentPickerUid === user?.uid

  /**
   * Nudge the server when the clock runs out. Purely a prompt — the server
   * re-checks its own clock and the turn identity, so a stale or duplicated
   * call does nothing. Every client runs this, which is deliberate: it means
   * the draft still moves when the member whose turn expired has disconnected.
   */
  useEffect(() => {
    if (!seasonId || !draft || draft.status !== 'active' || !draft.timerExpiresAt) return

    const fire = () => {
      resolveExpiredTurn({
        seasonId,
        round: draft.currentRound,
        pickNumber: draft.currentPickNumber,
      }).catch((error) => console.error('Could not resolve expired turn', error))
    }

    const msLeft = draft.timerExpiresAt - Date.now()
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

  // Bench settlement: the picking rounds are over, but somebody finished short
  // and contestants are going spare. An admin tops up and confirms the close.
  const isAwaitingClose = draft?.status === 'awaiting-close'
  const haltedForSkips = draft?.haltedReason === 'skips'
  const rosterSizes = members.map((m) => contestants.filter((c) => c.draftedByUid === m.uid).length)
  const largestRoster = rosterSizes.length ? Math.max(...rosterSizes) : 0
  const teamsWithSlots = members
    .map((m, i) => ({ member: m, openSlots: largestRoster - rosterSizes[i] }))
    .filter((t) => t.openSlots > 0)

  async function handleAssignFromBench(contestantId: string, toUid: string) {
    if (!seasonId || assigning) return
    setAssigning(true)
    setPickError('')
    try {
      await assignFromBench({ seasonId, contestantId, toUid })
    } catch (error) {
      setPickError((error as { message?: string }).message ?? 'Could not assign that contestant.')
      console.error('Bench assignment rejected', error)
    } finally {
      setAssigning(false)
    }
  }

  async function handleCloseDraft() {
    if (!seasonId || assigning) return
    setAssigning(true)
    setPickError('')
    try {
      await closeDraft({ seasonId })
      setConfirmClose(false)
    } catch (error) {
      setPickError((error as { message?: string }).message ?? 'Could not close the draft.')
      console.error('Close draft rejected', error)
    } finally {
      setAssigning(false)
    }
  }

  async function handleStartDraft() {
    if (!seasonId || !season || !user) return
    setStartingDraft(true)
    try {
      const memberUids = members.map((m) => m.uid)
      const pickOrder = resolvePickOrder(season.pickOrderMethod, memberUids)

      await addDoc(collection(db, 'seasons', seasonId, 'draft'), {
        status: 'active',
        currentPickerUid: pickOrder[0],
        currentRound: 1,
        currentPickNumber: 1,
        pickOrder,
        timerExpiresAt: Date.now() + season.timerSeconds * 1000,
        consecutiveSkips: 0,
        haltedReason: null,
      } satisfies DraftDoc)

      // Assign pick positions to members
      for (let i = 0; i < pickOrder.length; i++) {
        await updateDoc(doc(db, 'seasons', seasonId, 'members', pickOrder[i]), {
          pickPosition: i + 1,
        })
      }

      await updateDoc(doc(db, 'seasons', seasonId), { state: 'draft' })
      trackEvent('draft_started', { season_id: seasonId, player_count: memberUids.length })
    } finally {
      setStartingDraft(false)
    }
  }

  /**
   * A pick is one server call. Writing it from here meant four writes across
   * documents an ordinary member cannot touch, so a member's pick stalled the
   * draft halfway through. The function validates turn and availability in a
   * transaction and performs every write with the Admin SDK.
   */
  async function handlePick(contestantId: string, onBehalfOf?: string) {
    if (!seasonId || !draft || !user || picking) return

    setPicking(true)
    setPickError('')
    try {
      const { data } = await submitPick({ seasonId, contestantId, onBehalfOf })

      trackEvent('draft_pick_made', {
        round: draft.currentRound,
        pick_number: draft.currentPickNumber,
      })
      if (data.status === 'complete') {
        trackEvent('draft_completed', { season_id: seasonId, total_picks: contestants.length })
      }
      // The draft listener applies the new state — nothing to set here.
    } catch (error) {
      const message =
        (error as { message?: string }).message ?? 'Could not submit that pick. Try again.'
      setPickError(message)
      console.error('Pick rejected', error)
    } finally {
      setPicking(false)
    }
  }

  async function handleSaveTeamName() {
    if (!seasonId || !user) return
    setSavingTeamName(true)
    try {
      await updateDoc(doc(db, 'seasons', seasonId, 'members', user.uid), { teamName })
      await logAuditEvent({ action: 'team_renamed', seasonId })
    } finally {
      setSavingTeamName(false)
    }
  }

  const currentPickerName = draft?.currentPickerUid
    ? (members.find((m) => m.uid === draft.currentPickerUid)?.displayName ?? 'Unknown')
    : ''

  const myMember = members.find((m) => m.uid === user?.uid)

  if (!season) {
    return (
      <Layout>
        <p className="text-gray-400">{t('common.loading')}</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          {season.showName} — {t('dashboard.joinDraft')}
        </h1>
      </div>

      {/* Draft complete */}
      {draft?.status === 'complete' && (
        <div className="mb-6 rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">
            {t('draft.complete.banner', { teamName: myMember?.teamName ?? '' })}
          </p>
          <Button
            className="mt-4"
            onClick={() => navigate(`/leagues/${leagueId}/seasons/${seasonId}`)}
          >
            {t('draft.complete.viewSeason')}
          </Button>
        </div>
      )}

      {/* Lobby */}
      {(!draft || draft.status === 'lobby') && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-gray-500 mb-4">{t('draft.lobby.waitingForAdmin')}</p>
          <div className="flex flex-col gap-2 mb-4">
            {members.map((m) => (
              <div key={m.uid} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{m.displayName}</span>
                {m.pickPosition && (
                  <span className="text-gray-400">
                    {t('draft.lobby.yourPosition', { n: m.pickPosition })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <Button onClick={handleStartDraft} loading={startingDraft}>
              {t('draft.lobby.startDraft')}
            </Button>
          )}
        </div>
      )}

      {/* Bench settlement — picking is over, or the room went quiet */}
      {isAwaitingClose && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h2 className="text-lg font-semibold text-blue-900">
            {haltedForSkips ? 'Draft paused — nobody is picking' : 'Draft picking is finished'}
          </h2>
          <p className="mt-1 text-sm text-blue-800">
            {haltedForSkips ? (
              <>
                Every player&rsquo;s turn passed without a pick, so the draft stopped rather than
                cycling.{' '}
              </>
            ) : null}
            {available.length} {available.length === 1 ? 'contestant is' : 'contestants are'} still
            on the bench, and{' '}
            {teamsWithSlots.length === 1
              ? '1 team has an open slot'
              : `${teamsWithSlots.length} teams have open slots`}
            . {isAdmin ? 'Fill them from the bench, or close as is.' : 'An admin is settling up.'}
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
                    <span className="text-sm text-gray-500">No open slots</span>
                  ) : (
                    <>
                      <label className="sr-only" htmlFor={`assign-${c.id}`}>
                        Assign {c.name} to a team
                      </label>
                      <select
                        id={`assign-${c.id}`}
                        defaultValue=""
                        disabled={assigning}
                        onChange={(e) => {
                          if (e.target.value) handleAssignFromBench(c.id, e.target.value)
                        }}
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Assign to…</option>
                        {teamsWithSlots.map(({ member, openSlots }) => (
                          <option key={member.uid} value={member.uid}>
                            {member.displayName} ({openSlots} open)
                          </option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              ))}

              <div className="mt-2">
                {confirmClose ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-blue-900">
                      Close the draft
                      {available.length > 0
                        ? ` with ${available.length} still on the bench?`
                        : '?'}{' '}
                      This cannot be undone.
                    </p>
                    <Button onClick={handleCloseDraft} loading={assigning}>
                      Yes, close it
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmClose(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => setConfirmClose(true)}>Close draft</Button>
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
                  {currentPickerName} ran out of time — an admin is picking for them
                </p>
                <p className="text-sm text-amber-700">
                  The draft is paused. No one else can pick until this is done.
                </p>
              </div>
            </div>
          ) : (
            <TimerBanner
              pickerName={currentPickerName}
              timerExpiresAt={draft.timerExpiresAt}
              durationSeconds={season.timerSeconds}
              isYourTurn={isMyTurn}
            />
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
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Available ({available.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                {available.map((c) => (
                  <ContestantCard
                    key={c.id}
                    contestant={c}
                    canPick={isMyTurn}
                    canPickFor={
                      isAdmin && !isMyTurn && draft.currentPickerUid
                        ? members.find((m) => m.uid === draft.currentPickerUid)?.displayName
                        : undefined
                    }
                    onPick={() => handlePick(c.id)}
                    onPickFor={() => handlePick(c.id, draft.currentPickerUid ?? undefined)}
                  />
                ))}
              </div>

              {drafted.length > 0 && (
                <>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Drafted ({drafted.length})
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {drafted.map((c) => {
                      const owner = members.find((m) => m.uid === c.draftedByUid)
                      return (
                        <ContestantCard key={c.id} contestant={c} ownerName={owner?.displayName} />
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Team rosters */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Teams
              </h2>
              <div className="flex flex-col gap-4">
                {members
                  .sort((a, b) => (a.pickPosition ?? 99) - (b.pickPosition ?? 99))
                  .map((member) => {
                    const teamContestants = contestants.filter((c) => c.draftedByUid === member.uid)
                    const isCurrentPicker = draft.currentPickerUid === member.uid
                    return (
                      <div
                        key={member.uid}
                        className={`rounded-xl border p-4 ${isCurrentPicker ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                      >
                        {member.uid === user?.uid ? (
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={teamName}
                              onChange={(e) => setTeamName(e.target.value)}
                              className="flex-1 text-sm font-semibold border-b border-gray-300 bg-transparent focus:outline-none focus:border-blue-500"
                              aria-label={t('draft.active.teamName')}
                            />
                            <button
                              type="button"
                              onClick={handleSaveTeamName}
                              disabled={savingTeamName}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-gray-800 mb-2">
                            {member.teamName}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mb-2">{member.displayName}</p>
                        {teamContestants.length === 0 ? (
                          <p className="text-xs text-gray-300 italic">No picks yet</p>
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
    </Layout>
  )
}
