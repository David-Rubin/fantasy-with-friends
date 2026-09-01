import { useMemo, useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
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
  ContestantScoreDoc,
} from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'
import { Input } from '../components/Input'
import { Modal } from '../components/Modal'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { deleteSeason, deletionErrorMessage } from '../lib/deleteApi'
import { AccentColorPicker } from '../components/AccentColorPicker'
import { ScoringRulesPanel } from '../components/ScoringRulesPanel'
import { ScoringRulesCard } from '../components/ScoringRulesCard'
import {
  clampTimerSeconds,
  episodeCountProblem,
  highestScoredEpisode,
  TIMER_SECONDS_MAX,
  TIMER_SECONDS_MIN,
} from '../lib/seasonDetails'
import { updateSeasonDetails } from '../lib/seasonApi'
import { reconcilePickOrder } from '../lib/draft'
import { PickOrderList } from '../components/PickOrderList'
import { calcContestantTotal, latestEpisodePoints } from '../lib/scoring'
import { BIO_MAX_LENGTH, bioProblem, normaliseBio } from '../lib/contestants'
import { ContestantCard } from '../components/ContestantCard'
import { ContestantAvatar } from '../components/ContestantAvatar'
import {
  DEFAULT_ROSTER_SORT,
  nextRosterSort,
  ROSTER_COLUMNS,
  sortRosterRows,
  type RosterColumn,
  type RosterSort,
} from '../lib/roster'
import {
  ContestantFields,
  emptyContestantForm,
  type ContestantFormValues,
} from '../components/ContestantFields'

const TABS = ['leaderboard', 'roster', 'freeAgents', 'episodes'] as const
type Tab = (typeof TABS)[number]

interface MemberDoc extends SeasonMemberDoc {
  uid: string
  displayName: string
}

/**
 * A roster column heading that sorts the table.
 *
 * The whole heading is the button, not an icon beside it: a header that sorts
 * on click has to look clickable across its whole width, or half the clicks
 * land on dead space next to the word.
 *
 * `aria-sort` on the cell is what tells a screen reader the table is ordered
 * and by which column; the arrow says the same thing to everyone else, and the
 * button's own label says which way the next click will take it.
 */
function RosterHeader({
  column,
  label,
  sort,
  onSort,
}: {
  column: RosterColumn
  label: string
  sort: RosterSort
  onSort: (column: RosterColumn) => void
}) {
  const active = sort.column === column
  const ascending = active && sort.direction === 'asc'
  const nextDirection = nextRosterSort(sort, column).direction

  return (
    <th
      className="pb-3 font-medium"
      aria-sort={active ? (ascending ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={t(
          nextDirection === 'asc' ? 'season.roster.sortAscending' : 'season.roster.sortDescending',
          { column: label }
        )}
        className="flex items-center gap-1 rounded text-left hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {label}
        {/* Held open at a fixed width whether or not this column is the sorted
            one, so the headings do not jump sideways as the sort moves. */}
        <span aria-hidden="true" className="w-3 text-xs">
          {active ? (ascending ? '\u25b2' : '\u25bc') : ''}
        </span>
      </button>
    </th>
  )
}

export function SeasonDetailPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  const { user, isSuperadmin } = useAuth()
  const navigate = useNavigate()
  // In the URL rather than component state, so a breadcrumb or a shared link
  // can open the page on the tab it means. An unknown or absent value falls
  // back to the leaderboard rather than showing nothing.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'leaderboard'
  const setTab = (next: Tab) =>
    setSearchParams(next === 'leaderboard' ? {} : { tab: next }, { replace: true })
  const [season, setSeason] = useState<(SeasonDoc & { id: string }) | null>(null)
  const [members, setMembers] = useState<MemberDoc[]>([])
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rosterSort, setRosterSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSeason, setDeletingSeason] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const { canView, blocked } = useSeasonMembership(seasonId)
  const { leagueName, showName } = useTrailNames(leagueId)
  const [episodeStatuses, setEpisodeStatuses] = useState<Record<string, boolean>>({}) // episodeNumber -> locked
  // Per-contestant scores, keyed by episode number. A cache, not the source of
  // truth for which episodes are scored — that is `episodeStatuses` — so an
  // episode that disappears is filtered out on read rather than deleted here.
  // The leaderboard's expanded breakdown is the only thing that needs these;
  // the team totals on the collapsed row come from `season.teamTotals`, which a
  // trigger maintains.
  const [scoresByEpisode, setScoresByEpisode] = useState<
    Record<string, Record<string, ContestantScoreDoc>>
  >({})
  // Setup form state
  const [contestantForm, setContestantForm] = useState<ContestantFormValues>(emptyContestantForm)
  const [addingContestant, setAddingContestant] = useState(false)
  const [contestantError, setContestantError] = useState('')
  // The contestant being edited, if any, alongside the form holding the edits.
  const [editingContestantId, setEditingContestantId] = useState<string | null>(null)
  const [editContestantForm, setEditContestantForm] =
    useState<ContestantFormValues>(emptyContestantForm)
  const [savingContestant, setSavingContestant] = useState(false)
  const [editContestantError, setEditContestantError] = useState('')
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
    pickOrderMethod: 'admin-set' as SeasonDoc['pickOrderMethod'],
    timerSeconds: '60',
    timerExpiry: 'auto-pick' as SeasonDoc['timerExpiry'],
    adminPickOrder: [] as string[],
  })
  // Whether the form has been touched since it last matched what is stored.
  // A flag rather than a comparison against the saved values: it is what gates
  // the Save button, and re-enabling it for an edit that was undone by hand
  // costs a redundant write, where comparing would have to decide whether a
  // pick order reconciled against a roster that moved counts as a change.
  const [settingsDirty, setSettingsDirty] = useState(false)
  // Set once a save lands, so the button can say so. Cleared by the next edit
  // rather than by a timer — "Saved" stops being true the moment it is stale,
  // and a countdown would make it a guess.
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Counts edits, so a save can tell whether the form moved under it while the
  // write was in flight. A ref because the save handler reads it after an
  // await, where a state variable would still hold the value it closed over.
  const settingsEdits = useRef(0)

  /**
   * Every edit to the draft settings goes through here, so that marking the
   * form dirty and retiring the "Saved" line cannot be forgotten by one
   * control. Deliberately not wired into the timer field's blur, which
   * re-clamps a value that typing has already accounted for.
   */
  function editDraftSettings(update: (previous: typeof draftSettings) => typeof draftSettings) {
    setDraftSettings(update)
    settingsEdits.current += 1
    setSettingsDirty(true)
    setSettingsSaved(false)
  }

  // The arrangement as it stands against the roster as it stands. Derived
  // rather than held, because the roster moves underneath it: a league member
  // can join the season while it is still being set up, and the saved order
  // knows nothing about them until this squares the two.
  const pickOrder = useMemo(
    () =>
      reconcilePickOrder(
        draftSettings.adminPickOrder,
        members.map((m) => m.uid)
      ),
    [draftSettings.adminPickOrder, members]
  )

  // What the form actually writes: whatever is in the timer field, brought
  // inside its bounds. Nothing downstream should ever see the raw text.
  //
  // The order is written whichever method is selected, so that switching to
  // Randomized to see what it says and back again does not throw away an
  // arrangement someone made by hand.
  const draftSettingsToSave = {
    pickOrderMethod: draftSettings.pickOrderMethod,
    timerSeconds: clampTimerSeconds(parseInt(draftSettings.timerSeconds, 10)),
    timerExpiry: draftSettings.timerExpiry,
    // Only once the roster is in. `members` arrives on its own listener, so
    // there is a moment after the panel renders when it is still empty and
    // `pickOrder` with it — and writing that would wipe a saved arrangement
    // for anyone quick enough to press Save in the meantime.
    adminPickOrder: members.length > 0 ? pickOrder : draftSettings.adminPickOrder,
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
          // Absent on seasons saved before the order could be arranged.
          adminPickOrder: data.adminPickOrder ?? [],
        })
        // The form now holds exactly what the season holds. This covers a
        // change made elsewhere — another admin, or another tab; a save of our
        // own clears the flag itself, because a write that stores what was
        // already there raises no snapshot to be heard.
        setSettingsDirty(false)
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

  // One listener per scored episode. `contestantScores` is a subcollection of
  // each episode, and a collection-group query over them would need its own
  // security rule written against a denormalised field — far more machinery
  // than a handful of listeners, since a season has as many episodes as it has.
  const scoredEpisodeKey = Object.keys(episodeStatuses).sort().join(',')
  useEffect(() => {
    if (!seasonId || !canView) return
    const episodes = scoredEpisodeKey ? scoredEpisodeKey.split(',') : []
    const unsubs = episodes.map((ep) =>
      listenQuery(
        collection(db, 'seasons', seasonId, 'episodeScores', ep, 'contestantScores'),
        'contestant scores',
        (snap) => {
          setScoresByEpisode((prev) => ({
            ...prev,
            [ep]: Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as ContestantScoreDoc])),
          }))
        }
      )
    )
    return () => unsubs.forEach((u) => u())
  }, [seasonId, canView, scoredEpisodeKey])

  // Superadmins are folded in here because the security rules already treat
  // them as an admin of every season (isSeasonAdmin resolves through
  // isLeagueAdmin, which is true for them). Leaving them out only meant the
  // client hid controls the server would have accepted.
  const isAdmin = myRole === 'owner' || myRole === 'admin' || isSuperadmin

  async function handleAddContestant(e: React.FormEvent) {
    e.preventDefault()
    if (!seasonId) return
    // The textarea's maxLength stops typing past the limit, but not a value
    // that only crosses it once the ends are trimmed, nor an old browser
    // ignoring the attribute on paste.
    if (bioProblem(contestantForm.bio)) {
      setContestantError(t('contestant.errors.bioTooLong', { max: BIO_MAX_LENGTH }))
      return
    }
    setContestantError('')
    setAddingContestant(true)
    try {
      await addDoc(collection(db, 'seasons', seasonId, 'contestants'), {
        name: contestantForm.name.trim(),
        photoUrl: contestantForm.photoUrl.trim(),
        bio: normaliseBio(contestantForm.bio),
        draftedByUid: null,
        draftedRound: null,
        eliminatedEpisode: null,
      } satisfies ContestantDoc)
      setContestantForm({ name: '', photoUrl: '', bio: '' })
    } finally {
      setAddingContestant(false)
    }
  }

  function openEditContestant(contestant: Contestant) {
    setEditContestantError('')
    setEditContestantForm({
      name: contestant.name,
      photoUrl: contestant.photoUrl,
      bio: contestant.bio,
    })
    setEditingContestantId(contestant.id)
  }

  async function handleSaveContestant(e: React.FormEvent) {
    e.preventDefault()
    if (!seasonId || !editingContestantId) return
    if (bioProblem(editContestantForm.bio)) {
      setEditContestantError(t('contestant.errors.bioTooLong', { max: BIO_MAX_LENGTH }))
      return
    }
    setEditContestantError('')
    setSavingContestant(true)
    try {
      // Only the three fields the form owns. A contestant document also carries
      // who drafted them and when they went out, and spreading the form over
      // the document would take those with it.
      await updateDoc(doc(db, 'seasons', seasonId, 'contestants', editingContestantId), {
        name: editContestantForm.name.trim(),
        photoUrl: editContestantForm.photoUrl.trim(),
        bio: normaliseBio(editContestantForm.bio),
      })
      setEditingContestantId(null)
    } finally {
      setSavingContestant(false)
    }
  }

  async function handleSaveSetup() {
    if (!seasonId) return
    setSavingSetup(true)
    // What the form has had done to it as of this write. Anything past this is
    // an edit the write did not carry.
    const savedAtEdit = settingsEdits.current
    try {
      await updateDoc(doc(db, 'seasons', seasonId), draftSettingsToSave)
      setSettingsSaved(true)
      // Cleared here rather than left to the season listener. Firestore only
      // reports a document whose data actually changed, so saving a form that
      // was edited and put back exactly as it was — or that another tab has
      // already written — produces no snapshot at all, and the button stayed
      // lit after a save that plainly succeeded.
      //
      // Unless the form moved while the write was in flight, in which case
      // there is again something to save and the button belongs lit.
      if (settingsEdits.current === savedAtEdit) setSettingsDirty(false)
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

  /**
   * Back to the league on success: this page is built on a season document that
   * no longer exists, so staying would leave every listener on it reporting a
   * missing document.
   */
  async function handleDeleteSeason() {
    if (!seasonId || !leagueId) return
    setDeletingSeason(true)
    setDeleteError('')
    try {
      await deleteSeason({ seasonId })
      navigate(`/leagues/${leagueId}`)
    } catch (err) {
      console.error('Could not delete the season', err)
      setDeleteError(deletionErrorMessage(err, t('season.deleteFailed')))
      setDeletingSeason(false)
    }
  }

  const canOpenDraft = contestants.length >= 2 && rules.length >= 1
  const freeAgents = contestants.filter((c) => !c.draftedByUid)
  const memberUidMap = Object.fromEntries(members.map((m) => [m.uid, m]))
  // The roster's rows, resolved to the text each cell shows before they are
  // sorted — see sortRosterRows for why the sort works on that text and not on
  // the contestant documents behind it.
  const rosterRows = useMemo(() => {
    const rows = contestants.map((c) => ({
      id: c.id,
      photoUrl: c.photoUrl,
      eliminated: c.eliminatedEpisode !== null,
      contestant: c.name,
      owner: c.draftedByUid
        ? (memberUidMap[c.draftedByUid]?.displayName ?? '\u2014')
        : t('contestant.freeAgent'),
      status: c.eliminatedEpisode !== null ? t('contestant.eliminated') : t('contestant.active'),
    }))
    return sortRosterRows(rows, rosterSort)
    // memberUidMap is rebuilt on every render, so `members` is the real
    // dependency; listing the map itself would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contestants, members, rosterSort])
  const episodeNumbers = Array.from({ length: season?.episodeCount ?? 0 }, (_, i) => i + 1)
  // Episode numbers that already have a scores document, whatever the season's
  // state — the one thing that constrains an edit.
  // Only the episodes that are still scored, so a cached entry for one that has
  // gone cannot keep counting towards a season total.
  const episodeScoreDocs = Object.keys(episodeStatuses)
    .filter((ep) => scoresByEpisode[ep])
    .map((ep) => ({ episodeNumber: parseInt(ep, 10), scores: scoresByEpisode[ep] }))

  // Which episode the breakdown's "Latest Episode" column is reporting on.
  // Null rather than 0 before anything is scored, so the column can say so.
  const highestScored = highestScoredEpisode(episodeScoreDocs.map((d) => d.episodeNumber))
  const latestScoredEpisodeNumber = highestScored > 0 ? highestScored : null

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
              // The same card the draft board uses, scaled down: the cast is
              // checked over as a whole here, so the photo and the opening of
              // the bio are what matter, not one line of text per name.
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                {contestants.map((c) => (
                  <ContestantCard
                    key={c.id}
                    contestant={c}
                    compact
                    onEdit={() => openEditContestant(c)}
                  />
                ))}
              </div>
            )}
            <form onSubmit={handleAddContestant} className="flex flex-col gap-2">
              <ContestantFields values={contestantForm} onChange={setContestantForm} />
              <div className="flex items-center justify-end gap-2">
                <Button type="submit" loading={addingContestant} variant="secondary">
                  {t('contestant.add')}
                </Button>
              </div>
              {contestantError && <p className="text-sm text-red-600">{contestantError}</p>}
            </form>
          </section>

          {/* Scoring rules — here rather than behind the edit dialog because
              adding them is setup work: `canOpenDraft` needs at least one, so
              this sits beside the contestant list that gates the draft too.
              Unlike in the dialog there is no nested-form hazard, since nothing
              else in this panel is a form. */}
          <section className="mb-6">
            <ScoringRulesPanel
              seasonId={seasonId!}
              leagueId={leagueId!}
              rules={rules}
              episodeCount={season.episodeCount}
            />
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
                    editDraftSettings((s) => ({
                      ...s,
                      pickOrderMethod: e.target.value as SeasonDoc['pickOrderMethod'],
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="admin-set">{t('draft.pickOrder.adminSet')}</option>
                  <option value="randomized">{t('draft.pickOrder.randomized')}</option>
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
                    editDraftSettings((s) => ({ ...s, timerSeconds: e.target.value }))
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
                    editDraftSettings((s) => ({
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

            {/* Only under Admin-set: with Randomized the order is drawn when
                the draft opens, so a list here would be a promise the draft
                does not keep. The arrangement itself is kept either way — see
                draftSettingsToSave — so flicking between the two to read the
                options costs nothing. */}
            {draftSettings.pickOrderMethod === 'admin-set' && (
              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <h4 className="text-sm font-medium text-gray-700">
                  {t('draft.pickOrder.adminSetTitle')}
                </h4>
                <p className="mb-3 mt-1 text-xs text-gray-500">
                  {t('draft.pickOrder.adminSetHelp')}
                </p>
                <PickOrderList
                  players={members}
                  order={pickOrder}
                  onChange={(next) => editDraftSettings((s) => ({ ...s, adminPickOrder: next }))}
                />
                {members.length > 0 && (
                  <p className="mt-3 text-xs text-gray-400">{t('draft.pickOrder.savedOnSetup')}</p>
                )}
              </div>
            )}
          </section>

          <div className="flex gap-3">
            {/* Off until something has been edited: with nothing to write, a
                live button invites a click that does nothing, which is the
                complaint it was meant to answer. */}
            <Button
              variant="secondary"
              onClick={handleSaveSetup}
              loading={savingSetup}
              disabled={!settingsDirty}
            >
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
          {/* Sits under the Save button it belongs to. A write to Firestore is
              silent and the form looks identical afterwards, so without this
              there is nothing at all to say the click landed. `role="status"`
              announces it to a screen reader, which sees no colour. */}
          {settingsSaved && (
            <p
              role="status"
              className="mt-2 flex items-center gap-1 text-xs font-medium text-green-600"
            >
              {t('season.setupSaved')}
              {/* Sized in `em` so it tracks the text it sits beside. */}
              <svg
                className="size-[1em] shrink-0"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 10.5l4 4 8-9" />
              </svg>
            </p>
          )}
          {!canOpenDraft && (
            <p className="mt-2 text-xs text-gray-400">{t('season.openDraftDisabled')}</p>
          )}
        </div>
      )}

      {/* Only once the draft has closed. Before that the rules are still being
          written, and a half-finished list read as settled is worse than none;
          the admin has the editable panel above instead. */}
      {['active', 'complete'].includes(season.state) && (
        <ScoringRulesCard
          seasonId={seasonId!}
          leagueId={leagueId!}
          rules={rules}
          episodeCount={season.episodeCount}
          canEdit={isAdmin}
        />
      )}

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

      {/* The same panel for a season that is drafting, since this page has
          nothing else to show while it is — the tabs belong to a season with
          scores. The league page sends people straight to the draft room and
          leaves the card unclickable while it does, so this is reached by a
          direct link, by the breadcrumb out of the room, or by somebody sitting
          here after a reset waiting for the draft to open again.

          No membership test beyond the state: this page is already closed to
          anyone who is not in the season, which is the same test the league
          page's button makes. See canJoinDraft. */}
      {season.state === 'draft' && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="font-medium text-gray-700">{t('season.draftNoticeTitle')}</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            {t('season.draftNoticeBody')}
          </p>
          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/draft`} className="mt-4 inline-block">
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
                        playerPhotoUrl={member.photoUrl}
                        totalPoints={season.teamTotals[member.uid] ?? 0}
                        delta={delta}
                        accentColor={season.accentColor}
                        contestants={teamContestants.map((c) => ({
                          contestant: c,
                          seasonTotal: calcContestantTotal(c.id, episodeScoreDocs),
                          latestEpisodePoints: latestEpisodePoints(episodeScoreDocs, c.id),
                        }))}
                        latestEpisodeNumber={latestScoredEpisodeNumber}
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
                    {ROSTER_COLUMNS.map((column) => (
                      <RosterHeader
                        key={column}
                        column={column}
                        label={t(`season.roster.${column}`)}
                        sort={rosterSort}
                        onSort={(next) => setRosterSort((current) => nextRosterSort(current, next))}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rosterRows.map((row) => (
                    // Eliminated is carried by red text across all three cells
                    // rather than by the dimming this row used to have: a
                    // whole roster of grey rows is hard to pick out of, and a
                    // dimmed red would only fight itself.
                    <tr key={row.id}>
                      <td
                        className={[
                          'py-3 font-medium',
                          row.eliminated ? 'text-red-600' : 'text-gray-900',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-3">
                          <ContestantAvatar photoUrl={row.photoUrl} />
                          {row.contestant}
                        </span>
                      </td>
                      <td
                        className={['py-3', row.eliminated ? 'text-red-600' : 'text-gray-500'].join(
                          ' '
                        )}
                      >
                        {row.owner}
                      </td>
                      <td
                        className={['py-3', row.eliminated ? 'text-red-600' : 'text-gray-400'].join(
                          ' '
                        )}
                      >
                        {row.status}
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

      {/* Edit contestant */}
      <Modal
        open={!!editingContestantId}
        onClose={() => setEditingContestantId(null)}
        title={t('contestant.edit')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingContestantId(null)}>
              {t('common.cancel')}
            </Button>
            <Button form="edit-contestant-form" type="submit" loading={savingContestant}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="edit-contestant-form"
          onSubmit={handleSaveContestant}
          className="flex flex-col gap-2"
        >
          <ContestantFields
            values={editContestantForm}
            onChange={setEditContestantForm}
            autoFocus
          />
          {editContestantError && <p className="text-sm text-red-600">{editContestantError}</p>}
        </form>
      </Modal>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('season.deleteTitle', { name: season.label })}
        name={season.label}
        consequences={[
          t('season.deleteContestants', { n: contestants.length }),
          t('season.deleteMembers', { n: members.length }),
          t('season.deleteScores'),
        ]}
        confirmLabel={t('season.delete')}
        busy={deletingSeason}
        error={deleteError}
        onConfirm={handleDeleteSeason}
      />

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

        {/* Deleting lives here rather than on the page, for the same reason as
            the league's: it is reached about once in a season's life, and a red
            panel under the leaderboard was announcing that every week. The
            dialog is already where a season is changed and only an admin opens
            it, so the audience is unchanged without a second guard.

            This dialog closes as the confirmation opens. Leaving it up and
            stacking the two renders them into each other — both take the same
            z-index, so the confirmation bleeds through this one instead of
            covering it. Nothing is lost by closing: the confirmation is where
            the league's name is typed out. */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-red-800">{t('delete.dangerZone')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('season.deleteExplain')}</p>
          <Button
            variant="danger"
            className="mt-3"
            onClick={() => {
              setEditOpen(false)
              setDeleteError('')
              setDeleteOpen(true)
            }}
          >
            {t('season.delete')}
          </Button>
        </div>
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
