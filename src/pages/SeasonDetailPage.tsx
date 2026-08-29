import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { doc, getDoc, collection, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenDoc, listenQuery, guarded } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { NotASeasonMember, useSeasonMembership } from '../components/SeasonMemberGate'
import { seasonTrail } from '../lib/breadcrumbs'
import { useTrailNames } from '../lib/useTrailNames'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { LeaderboardRow } from '../components/LeaderboardRow'
import type {
  SeasonDoc,
  ContestantDoc,
  SeasonMemberDoc,
  ScoringRuleDoc,
  EpisodeScoreDoc,
  MemberRole,
  Contestant,
  ScoringRule,
  AccentColor,
} from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { AccentColorPicker } from '../components/AccentColorPicker'
import { ScoringRulesPanel } from '../components/ScoringRulesPanel'
import { ScoringRulesDisclosure } from '../components/ScoringRulesDisclosure'
import { rulesAreEditable } from '../lib/scoringRules'
import {
  clampTimerSeconds,
  episodeCountProblem,
  highestScoredEpisode,
  TIMER_SECONDS_MAX,
  TIMER_SECONDS_MIN,
} from '../lib/seasonDetails'
import { updateSeasonDetails } from '../lib/seasonApi'

type Tab = 'leaderboard' | 'roster' | 'freeAgents' | 'episodes'

interface MemberDoc extends SeasonMemberDoc {
  uid: string
  displayName: string
}

export function SeasonDetailPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  const { user, isSuperadmin } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('leaderboard')
  const [season, setSeason] = useState<(SeasonDoc & { id: string }) | null>(null)
  const [members, setMembers] = useState<MemberDoc[]>([])
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const { canView, blocked } = useSeasonMembership(seasonId)
  const { leagueName, showName } = useTrailNames(leagueId)
  const [episodeStatuses, setEpisodeStatuses] = useState<Record<string, boolean>>({}) // episodeNumber -> locked
  // Setup form state
  const [contestantForm, setContestantForm] = useState({ name: '', photoUrl: '', bio: '' })
  const [addingContestant, setAddingContestant] = useState(false)
  const [savingSetup, setSavingSetup] = useState(false)
  const [openingDraft, setOpeningDraft] = useState(false)
  const [assignFreeAgentOpen, setAssignFreeAgentOpen] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    label: '',
    episodeCount: '',
    accentColor: 'blue' as AccentColor,
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  // Draft settings form. `timerSeconds` is text, not a number, for the same
  // reason a rule's points are: an emptied field is a legitimate step on the
  // way from "5" to "400", and a number cannot hold it. It is read back as a
  // number only when the field is left, and again when the form is written.
  const [draftSettings, setDraftSettings] = useState({
    pickOrderMethod: 'randomized' as SeasonDoc['pickOrderMethod'],
    timerSeconds: '60',
    timerExpiry: 'auto-pick' as SeasonDoc['timerExpiry'],
  })

  // What the form actually writes: whatever is in the timer field, brought
  // inside its bounds. Nothing downstream should ever see the raw text.
  const draftSettingsToSave = {
    pickOrderMethod: draftSettings.pickOrderMethod,
    timerSeconds: clampTimerSeconds(parseInt(draftSettings.timerSeconds, 10)),
    timerExpiry: draftSettings.timerExpiry,
  }

  useEffect(() => {
    if (!seasonId) return
    const unsub = listenDoc(doc(db, 'seasons', seasonId), 'season', (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...(snap.data() as SeasonDoc) }
        setSeason(data)
        setDraftSettings({
          pickOrderMethod: data.pickOrderMethod,
          timerSeconds: String(data.timerSeconds),
          timerExpiry: data.timerExpiry,
        })
      }
    })
    return unsub
  }, [seasonId])

  useEffect(() => {
    if (!seasonId || !user || !canView) return
    const unsub = listenQuery(
      collection(db, 'seasons', seasonId, 'members'),
      'season members',
      guarded('season members', async (snap) => {
        const list: MemberDoc[] = snap.docs.map((d) => {
          const data = d.data() as SeasonMemberDoc
          // See LeagueMemberDoc.displayName — cross-user reads are denied.
          return { ...data, uid: d.id, displayName: data.displayName || d.id }
        })
        setMembers(list)

        // Determine my role in the league
        if (leagueId && user) {
          const roleSnap = await getDoc(doc(db, 'leagues', leagueId, 'members', user.uid))
          if (roleSnap.exists()) setMyRole((roleSnap.data() as { role: MemberRole }).role)
        }
      })
    )
    return unsub
  }, [seasonId, user, leagueId, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    const unsub = listenQuery(
      collection(db, 'seasons', seasonId, 'contestants'),
      'season contestants',
      (snap) => {
        setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
      }
    )
    return unsub
  }, [seasonId, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    const unsub = listenQuery(
      collection(db, 'seasons', seasonId, 'scoringRules'),
      'season rules',
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ScoringRuleDoc) })))
      }
    )
    return unsub
  }, [seasonId, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    const unsub = listenQuery(
      collection(db, 'seasons', seasonId, 'episodeScores'),
      'episode statuses',
      (snap) => {
        const statuses: Record<string, boolean> = {}
        snap.docs.forEach((d) => {
          statuses[d.id] = (d.data() as EpisodeScoreDoc).locked
        })
        setEpisodeStatuses(statuses)
      }
    )
    return unsub
  }, [seasonId, canView])

  // Superadmins are folded in here because the security rules already treat
  // them as an admin of every season (isSeasonAdmin resolves through
  // isLeagueAdmin, which is true for them). Leaving them out only meant the
  // client hid controls the server would have accepted.
  const isAdmin = myRole === 'owner' || myRole === 'admin' || isSuperadmin

  async function handleAddContestant(e: React.FormEvent) {
    e.preventDefault()
    if (!seasonId) return
    setAddingContestant(true)
    try {
      await addDoc(collection(db, 'seasons', seasonId, 'contestants'), {
        name: contestantForm.name.trim(),
        photoUrl: contestantForm.photoUrl.trim(),
        bio: contestantForm.bio.trim(),
        draftedByUid: null,
        draftedRound: null,
        eliminatedEpisode: null,
      } satisfies ContestantDoc)
      setContestantForm({ name: '', photoUrl: '', bio: '' })
    } finally {
      setAddingContestant(false)
    }
  }

  async function handleSaveSetup() {
    if (!seasonId) return
    setSavingSetup(true)
    try {
      await updateDoc(doc(db, 'seasons', seasonId), draftSettingsToSave)
    } finally {
      setSavingSetup(false)
    }
  }

  async function handleOpenDraft() {
    if (!seasonId) return
    setOpeningDraft(true)
    try {
      // The settings go with the state change, in one write. Opening the draft
      // used to save the state alone, so a timer typed into the field and never
      // committed with Save draft setup was silently dropped — the lobby then
      // started the clock on whatever was last persisted, which reads as the
      // edit not taking effect.
      await updateDoc(doc(db, 'seasons', seasonId), { ...draftSettingsToSave, state: 'draft' })
      navigate(`/leagues/${leagueId}/seasons/${seasonId}/draft`)
    } finally {
      setOpeningDraft(false)
    }
  }

  async function handleAssignFreeAgent(contestantId: string, memberUid: string) {
    if (!seasonId || !user) return
    await updateDoc(doc(db, 'seasons', seasonId, 'contestants', contestantId), {
      draftedByUid: memberUid,
      draftedRound: null,
    })
    await logAuditEvent({
      action: 'free_agent_assigned',
      seasonId,
      contestantId,
      targetUid: memberUid,
    })
    setAssignFreeAgentOpen(null)
  }

  const canOpenDraft = contestants.length >= 2 && rules.length >= 1
  const freeAgents = contestants.filter((c) => !c.draftedByUid)
  const memberUidMap = Object.fromEntries(members.map((m) => [m.uid, m]))
  const episodeNumbers = Array.from({ length: season?.episodeCount ?? 0 }, (_, i) => i + 1)
  // Episode numbers that already have a scores document, whatever the season's
  // state — the one thing that constrains an edit.
  const scoredEpisodeNumbers = Object.keys(episodeStatuses)

  function openEditSeason() {
    if (!season) return
    setEditForm({
      label: season.label,
      episodeCount: String(season.episodeCount),
      accentColor: season.accentColor,
    })
    setEditError('')
    setEditOpen(true)
  }

  async function handleSaveSeasonDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!season || !seasonId || !leagueId) return

    const episodeCount = parseInt(editForm.episodeCount, 10)
    const problem = episodeCountProblem(episodeCount, scoredEpisodeNumbers)
    if (problem) {
      setEditError(
        problem === 'below-scored'
          ? t('season.episodeCountBelowScored', {
              n: highestScoredEpisode(scoredEpisodeNumbers),
            })
          : problem === 'too-few'
            ? t('season.episodeCountTooFew')
            : t('season.episodeCountInvalid')
      )
      return
    }

    setSavingEdit(true)
    setEditError('')
    try {
      await updateSeasonDetails(
        seasonId,
        leagueId,
        {
          label: season.label,
          episodeCount: season.episodeCount,
          accentColor: season.accentColor,
        },
        {
          label: editForm.label.trim(),
          episodeCount,
          accentColor: editForm.accentColor,
        }
      )
      setEditOpen(false)
    } catch (error) {
      console.error('Failed to update season details', error)
      setEditError(t('common.error'))
    } finally {
      setSavingEdit(false)
    }
  }

  if (blocked) return <NotASeasonMember leagueId={leagueId} />

  if (!season) {
    return (
      <Layout breadcrumbs={seasonTrail(leagueId, leagueName, undefined)}>
        <p className="text-gray-400">{t('common.loading')}</p>
      </Layout>
    )
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'leaderboard', label: t('season.tabs.leaderboard') },
    { key: 'roster', label: t('season.tabs.roster') },
    { key: 'freeAgents', label: t('season.tabs.freeAgents') },
    { key: 'episodes', label: t('season.tabs.episodes') },
  ]

  return (
    <Layout breadcrumbs={seasonTrail(leagueId, leagueName, season.label)}>
      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{season.label}</h1>
          <p className="text-gray-500">{showName}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge accent={season.accentColor}>{t(`season.states.${season.state}`)}</Badge>
          {/* Deliberately not gated on season.state — a name or episode count
              can need correcting long after the draft has opened. */}
          {isAdmin && (
            <Button variant="secondary" onClick={openEditSeason}>
              {t('season.editDetails')}
            </Button>
          )}
        </div>
      </div>

      {/* Setup panel */}
      {season.state === 'setup' && isAdmin && (
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Season Setup</h2>

          {/* Contestants */}
          <section className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">Contestants ({contestants.length})</h3>
            {contestants.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1">
                {contestants.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span>{c.name}</span>
                    {c.bio && <span className="text-gray-400">— {c.bio.slice(0, 40)}…</span>}
                  </li>
                ))}
              </ul>
            )}
            <form onSubmit={handleAddContestant} className="flex flex-col sm:flex-row gap-2">
              <Input
                label={t('contestant.name')}
                value={contestantForm.name}
                onChange={(e) => setContestantForm((f) => ({ ...f, name: e.target.value }))}
                required
                className="flex-1"
              />
              <Input
                label={t('contestant.photo')}
                value={contestantForm.photoUrl}
                onChange={(e) => setContestantForm((f) => ({ ...f, photoUrl: e.target.value }))}
                placeholder="https://…"
                className="flex-1"
              />
              <div className="flex items-end">
                <Button type="submit" loading={addingContestant} variant="secondary">
                  {t('contestant.add')}
                </Button>
              </div>
            </form>
          </section>

          {/* Scoring rules — here rather than behind the edit dialog because
              adding them is setup work: `canOpenDraft` needs at least one, so
              this sits beside the contestant list that gates the draft too.
              Unlike in the dialog there is no nested-form hazard, since nothing
              else in this panel is a form. */}
          <section className="mb-6">
            <ScoringRulesPanel seasonId={seasonId!} leagueId={leagueId!} rules={rules} />
          </section>

          {/* Draft settings */}
          <section className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">{t('draft.settings')}</h3>
            <div className="flex flex-wrap gap-4">
              {/* Read-only on purpose: `draftFormat` is 'snake' and nothing else
                  yet, and a select with one option would imply a choice that is
                  not there. Shown rather than hidden because how the order runs
                  is the thing people most want to know before a draft. */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">{t('draft.format')}</span>
                <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {t('draft.format.snake')}
                </p>
                <span className="text-xs text-gray-400">{t('draft.formatComingSoon')}</span>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">{t('draft.pickOrder')}</span>
                <select
                  value={draftSettings.pickOrderMethod}
                  onChange={(e) =>
                    setDraftSettings((s) => ({
                      ...s,
                      pickOrderMethod: e.target.value as SeasonDoc['pickOrderMethod'],
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="randomized">{t('draft.pickOrder.randomized')}</option>
                  <option value="admin-set">{t('draft.pickOrder.adminSet')}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">
                  {t('draft.timerDuration')}
                </span>
                <input
                  type="number"
                  min={TIMER_SECONDS_MIN}
                  max={TIMER_SECONDS_MAX}
                  value={draftSettings.timerSeconds}
                  // Takes whatever is typed, empty included — clearing the field
                  // is how you replace 5 with 400 without fighting it.
                  onChange={(e) =>
                    setDraftSettings((s) => ({ ...s, timerSeconds: e.target.value }))
                  }
                  // Settled only once the field is left: an emptied or
                  // out-of-range box becomes the nearest allowed value, and a
                  // half-typed one is left alone until then.
                  onBlur={() =>
                    setDraftSettings((s) => ({
                      ...s,
                      timerSeconds: String(clampTimerSeconds(parseInt(s.timerSeconds, 10))),
                    }))
                  }
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600">{t('draft.timerExpiry')}</span>
                <select
                  value={draftSettings.timerExpiry}
                  onChange={(e) =>
                    setDraftSettings((s) => ({
                      ...s,
                      timerExpiry: e.target.value as SeasonDoc['timerExpiry'],
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="auto-pick">{t('draft.timerExpiry.autoPick')}</option>
                  <option value="admin-picks">{t('draft.timerExpiry.adminPicks')}</option>
                  <option value="skip">{t('draft.timerExpiry.skip')}</option>
                </select>
              </label>
            </div>
          </section>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={handleSaveSetup} loading={savingSetup}>
              {t('season.saveSetup')}
            </Button>
            <Button
              onClick={handleOpenDraft}
              loading={openingDraft}
              disabled={!canOpenDraft}
              title={!canOpenDraft ? t('season.openDraftDisabled') : undefined}
            >
              {t('season.openDraft')}
            </Button>
          </div>
          {!canOpenDraft && (
            <p className="mt-2 text-xs text-gray-400">{t('season.openDraftDisabled')}</p>
          )}
        </div>
      )}

      {/* Only once the draft has closed. Before that the rules are still being
          written, and a half-finished list read as settled is worse than none;
          the admin has the editable panel above instead. */}
      {['active', 'complete'].includes(season.state) && <ScoringRulesDisclosure rules={rules} />}

      {/* A member who arrives before the season is ready — from a bookmark, or
          a link shared before the draft opened. The admin panel above is not
          theirs to see, and everything else on this page only exists once the
          season is scoring, so without this the page is simply blank. */}
      {season.state === 'setup' && !isAdmin && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="font-medium text-gray-700">{t('season.setupNoticeTitle')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            {t('season.setupNoticeBody')}
          </p>
        </div>
      )}

      {/* Draft lobby link */}
      {season.state === 'draft' && (
        <div className="mb-6">
          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/draft`}>
            <Button>{t('dashboard.joinDraft')}</Button>
          </Link>
        </div>
      )}

      {/* Tabs (active/complete seasons) */}
      {['active', 'complete'].includes(season.state) && (
        <>
          <nav className="flex border-b border-gray-200 mb-6 overflow-x-auto" role="tablist">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => {
                  setTab(key)
                  if (key === 'leaderboard')
                    trackEvent('leaderboard_viewed', { season_id: seasonId ?? '' })
                }}
                className={[
                  'px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                  tab === key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Leaderboard tab */}
          {tab === 'leaderboard' && (
            <div className="flex flex-col gap-3">
              {members.length === 0 ? (
                <p className="text-gray-400">{t('leaderboard.noScoresYet')}</p>
              ) : (
                [...members]
                  .sort((a, b) => (season.teamTotals[b.uid] ?? 0) - (season.teamTotals[a.uid] ?? 0))
                  .map((member, idx) => {
                    const scoredEpisodes = Object.keys(season.teamEpisodeTotals[member.uid] ?? {})
                      .map(Number)
                      .sort((a, b) => a - b)
                    const lastEp = scoredEpisodes[scoredEpisodes.length - 1]
                    const prevEp = scoredEpisodes[scoredEpisodes.length - 2]
                    const delta =
                      lastEp !== undefined
                        ? (season.teamEpisodeTotals[member.uid]?.[lastEp] ?? 0) -
                          (prevEp !== undefined
                            ? (season.teamEpisodeTotals[member.uid]?.[prevEp] ?? 0)
                            : 0)
                        : null

                    const teamContestants = contestants.filter((c) => c.draftedByUid === member.uid)

                    return (
                      <LeaderboardRow
                        key={member.uid}
                        rank={idx + 1}
                        teamName={member.teamName}
                        playerName={member.displayName}
                        totalPoints={season.teamTotals[member.uid] ?? 0}
                        delta={delta}
                        accentColor={season.accentColor}
                        contestants={teamContestants.map((c) => ({
                          contestant: c,
                          totalPoints: 0, // per-contestant totals would require fetching sub-collections
                          episodePoints: {},
                        }))}
                        episodeNumbers={scoredEpisodes}
                      />
                    )
                  })
              )}
            </div>
          )}

          {/* Roster tab */}
          {tab === 'roster' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-200">
                    <th className="pb-3 font-medium">Contestant</th>
                    <th className="pb-3 font-medium">Owner</th>
                    <th className="pb-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contestants.map((c) => (
                    <tr key={c.id} className={c.eliminatedEpisode !== null ? 'opacity-50' : ''}>
                      <td className="py-3 font-medium text-gray-900">{c.name}</td>
                      <td className="py-3 text-gray-500">
                        {c.draftedByUid
                          ? (memberUidMap[c.draftedByUid]?.displayName ?? '—')
                          : t('contestant.freeAgent')}
                      </td>
                      <td className="py-3">
                        {c.eliminatedEpisode !== null ? (
                          <Badge variant="eliminated">{t('contestant.eliminated')}</Badge>
                        ) : (
                          <span className="text-gray-400">Active</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Free Agents tab */}
          {tab === 'freeAgents' && (
            <div className="flex flex-col gap-3">
              {freeAgents.length === 0 ? (
                <p className="text-gray-400">No free agents.</p>
              ) : (
                freeAgents.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4"
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    {isAdmin && (
                      <Button variant="secondary" onClick={() => setAssignFreeAgentOpen(c.id)}>
                        {t('contestant.assignToTeam')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Episodes tab */}
          {tab === 'episodes' && (
            <div className="flex flex-col gap-3">
              {episodeNumbers.map((n) => {
                const scored = episodeStatuses[String(n)] !== undefined
                const locked = episodeStatuses[String(n)]
                return (
                  <div
                    key={n}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4"
                  >
                    <div>
                      <p className="font-medium text-gray-900">Episode {n}</p>
                      <p className="text-xs text-gray-400">
                        {!scored
                          ? t('scoring.notScored')
                          : locked
                            ? t('scoring.submitted')
                            : 'Unlocked for editing'}
                      </p>
                    </div>
                    {/* Members get a way in to read the scores; the page
                        renders read-only for anyone who cannot enter them. */}
                    {!isAdmin && scored && (
                      <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                        <Button variant="ghost">{t('scoring.viewScores')}</Button>
                      </Link>
                    )}
                    {isAdmin && (
                      <div className="flex gap-2">
                        {!scored && (
                          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                            <Button variant="secondary">{t('scoring.scoreEpisode', { n })}</Button>
                          </Link>
                        )}
                        {scored && locked && (
                          <>
                            <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                              <Button variant="ghost">{t('scoring.viewScores')}</Button>
                            </Link>
                            <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                              <Button variant="secondary">{t('scoring.unlockEpisode')}</Button>
                            </Link>
                          </>
                        )}
                        {scored && !locked && (
                          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                            <Button variant="secondary">Edit scores</Button>
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Assign free agent modal */}
      {/* Edit season details */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('season.editDetails')}
        size="wide"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="edit-season-form" type="submit" loading={savingEdit}>
              {savingEdit ? t('season.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="edit-season-form"
          onSubmit={handleSaveSeasonDetails}
          className="flex flex-col gap-4"
        >
          <Input
            label={t('season.label')}
            value={editForm.label}
            onChange={(e) => setEditForm((f) => ({ ...f, label: e.target.value }))}
            required
            autoFocus
          />
          <Input
            label={t('season.episodeCount')}
            type="number"
            min={1}
            value={editForm.episodeCount}
            onChange={(e) => setEditForm((f) => ({ ...f, episodeCount: e.target.value }))}
            required
          />
          <AccentColorPicker
            value={editForm.accentColor}
            onChange={(c) => setEditForm((f) => ({ ...f, accentColor: c }))}
          />
          {editError && <p className="text-sm text-red-600">{editError}</p>}
        </form>

        {/* A sibling of the form above, not a child: this panel has its own
            form for adding a rule, and nested forms are not valid markup.
            Its edits save as they are made — the footer's Save applies to the
            season details only.

            Absent during setup, where the editor lives on the setup panel
            instead — one place to edit rules at a time, never two.

            Gone once the first episode is scored: the rules are settled then,
            and everyone reads them from the season page instead. */}
        {season.state !== 'setup' && rulesAreEditable(season.firstEpisodeScoredAt) && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <ScoringRulesPanel seasonId={seasonId!} leagueId={leagueId!} rules={rules} />
          </div>
        )}
      </Modal>

      <Modal
        open={!!assignFreeAgentOpen}
        onClose={() => setAssignFreeAgentOpen(null)}
        title={t('contestant.assignToTeam')}
      >
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <button
              key={m.uid}
              type="button"
              onClick={() => handleAssignFreeAgent(assignFreeAgentOpen!, m.uid)}
              className="rounded-lg border border-gray-200 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {m.teamName} <span className="text-gray-400 text-sm">({m.displayName})</span>
            </button>
          ))}
        </div>
      </Modal>
    </Layout>
  )
}
