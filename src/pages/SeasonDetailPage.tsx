import { useMemo, useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import { doc, collection, deleteDoc, deleteField, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenDoc, listenQuery } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { NotASeasonMember, useSeasonMembership } from '../components/SeasonMemberGate'
import { seasonTrail } from '../lib/breadcrumbs'
import { useTrailNames } from '../lib/useTrailNames'
import { Button } from '../components/Button'
import { LeaderboardRow } from '../components/LeaderboardRow'
import type {
  ScoreProposalDoc,
  SeasonDoc,
  ContestantDoc,
  SeasonMemberDoc,
  EpisodeScoreDoc,
  Contestant,
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
import { ScoringRulesPanel } from '../components/ScoringRulesPanel'
import { ScoringRulesCard } from '../components/ScoringRulesCard'
import {
  clampTimerSeconds,
  episodeCountProblem,
  highestScoredEpisode,
  TIMER_SECONDS_MAX,
  TIMER_SECONDS_MIN,
  openDraftProblem,
} from '../lib/seasonDetails'
import {
  removeSeasonMember,
  setSeasonCompleted,
  updateSeasonDetails,
  writeSeasonSetup,
} from '../lib/seasonApi'
import { canRemoveFromSeason } from '../lib/seasonMembership'
import { UserAvatar } from '../components/UserAvatar'
import {
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  assignmentWrites,
  clampTeamCount,
  effectiveAssignments,
  teamAssignmentProblem,
  teamIds,
  teamNumberOf,
  type Assignments,
} from '../lib/teamAssignment'
import { TeamAssignmentBoard } from '../components/TeamAssignmentBoard'
import { Switch } from '../components/Switch'
import { draftLobbyVisible, reconcilePickOrder } from '../lib/draft'
import { canCompleteSeason, seasonWinner } from '../lib/seasonCompletion'
import { SeasonChampion } from '../components/SeasonChampion'
import { PickOrderList } from '../components/PickOrderList'
import { calcContestantTotal, latestEpisodePoints } from '../lib/scoring'
import { BIO_MAX_LENGTH, bioProblem, normaliseBio } from '../lib/contestants'
import { ContestantGrid } from '../components/ContestantGrid'
import { DraftRoom } from '../components/DraftRoom'
import { reopenSeasonSetup, startDraft } from '../lib/draftApi'
import {
  useSeasonContestants,
  useSeasonDraft,
  useSeasonScoringRules,
  useSeasonTeams,
} from '../lib/useSeasonCollections'
import { entryByKey, entryKeyFor, isTeamMode, seasonEntries } from '../lib/entries'
import { useIsAdmin } from '../lib/useIsAdmin'
import { PlayerAvatars, playerNames } from '../components/PlayerAvatars'
import { ContestantAvatar } from '../components/ContestantAvatar'
import { uploadContestantPhoto } from '../lib/contestantPhotoApi'
import { ContestantPhotoButton } from '../components/ContestantPhotoButton'
import {
  ContestantPhotoDialog,
  type ContestantPhotoChoice,
} from '../components/ContestantPhotoDialog'
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
import { TeamIdentityCard } from '../components/TeamIdentityCard'
import { TeamColorDot } from '../components/TeamColorDot'
import { accentLeftBorder } from '../components/accentStyles'
import { takenTeamColors, teamColorFor, teamHoldingColor } from '../lib/teamColor'

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
  const { user } = useAuth()
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
  const [rosterSort, setRosterSort] = useState<RosterSort>(DEFAULT_ROSTER_SORT)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingSeason, setDeletingSeason] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const { canView, blocked } = useSeasonMembership(seasonId)
  // A listener rather than a read, and gated on canView: see useLeagueRole.
  // Superadmins are folded in there because the security rules already treat
  // them as an admin of every season (isSeasonAdmin resolves through
  // isLeagueAdmin, which is true for them). Leaving them out only meant the
  // client hid controls the server would have accepted.
  const isAdmin = useIsAdmin(leagueId, canView)
  const contestants = useSeasonContestants(seasonId, canView)
  const rules = useSeasonScoringRules(seasonId, canView)
  const teams = useSeasonTeams(seasonId, canView)
  // Read here as well as in the room, because the header's Start draft button
  // is only offered while the draft has not opened — the same condition the
  // room uses to show its lobby.
  const { draft, draftLoaded } = useSeasonDraft(seasonId, canView)
  const [startingDraft, setStartingDraft] = useState(false)
  const [startDraftError, setStartDraftError] = useState('')
  const [resetDraftOpen, setResetDraftOpen] = useState(false)
  const [resettingDraft, setResettingDraft] = useState(false)
  const [resetDraftError, setResetDraftError] = useState('')
  const { leagueName, showName } = useTrailNames(leagueId)
  const [episodeStatuses, setEpisodeStatuses] = useState<Record<string, boolean>>({})
  /** Episodes somebody has suggested scores for, awaiting an admin's decision. */
  const [episodesAwaitingReview, setEpisodesAwaitingReview] = useState<Set<string>>(new Set()) // episodeNumber -> locked
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
  // The participant an admin is about to take off the roster, while the
  // confirmation is up. Confirmed rather than immediate because there is no
  // admin control to put them back: the member has to rejoin themselves.
  const [removeMemberTarget, setRemoveMemberTarget] = useState<MemberDoc | null>(null)
  const [removingMember, setRemovingMember] = useState(false)
  const [removeMemberError, setRemoveMemberError] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ label: '', episodeCount: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [completeConfirm, setCompleteConfirm] = useState(false)
  const [reopenConfirm, setReopenConfirm] = useState(false)
  const [closingSeason, setClosingSeason] = useState(false)
  const [editError, setEditError] = useState('')

  // Draft settings form. `timerSeconds` is text, not a number, for the same
  // reason a rule's points are: an emptied field is a legitimate step on the
  // way from "5" to "400", and a number cannot hold it. It is read back as a
  // number only when the field is left, and again when the form is written.
  //
  // `teamCount` is text for the same reason. `assignmentOverrides` are the
  // drags made since the last save, laid over what the roster records — see
  // effectiveAssignments — and cleared once a save lands.
  const [draftSettings, setDraftSettings] = useState({
    pickOrderMethod: 'admin-set' as SeasonDoc['pickOrderMethod'],
    timerSeconds: '60',
    timerExpiry: 'auto-pick' as SeasonDoc['timerExpiry'],
    adminPickOrder: [] as string[],
    teamMode: false,
    teamCount: String(TEAM_COUNT_MIN),
    assignmentOverrides: {} as Assignments,
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

  // What the season is played between — members, or teams in team mode. Every
  // panel below that used to walk the roster walks this instead, and every key
  // the season document carries (`teamTotals`, `draftedByUid`) is one of these.
  // See src/lib/entries.ts.
  const teamMode = isTeamMode(season)
  const entries = useMemo(() => seasonEntries(season, members, teams), [season, members, teams])

  // The team layout as the setup form has it, which is ahead of what is
  // stored: a count typed but not saved, a drag not yet written. The setup
  // panel's own pieces — the boxes, the pick-order list, the gate on opening
  // the draft — read this; everything outside it reads the stored entries.
  const setupTeamCount = clampTeamCount(parseInt(draftSettings.teamCount, 10))
  const setupTeamIds = draftSettings.teamMode ? teamIds(setupTeamCount) : []
  const setupAssignments = effectiveAssignments(
    members,
    draftSettings.assignmentOverrides,
    setupTeamCount
  )
  const setupEntries = draftSettings.teamMode
    ? setupTeamIds.map((id) => {
        const stored = teams.find((team) => team.id === id)
        const teamName = stored?.teamName ?? t('team.defaultName', { n: teamNumberOf(id) ?? 0 })
        return {
          key: id,
          teamName,
          teamColor: stored?.teamColor,
          pickPosition: null,
          label: teamName,
          players: members.filter((m) => setupAssignments[m.uid] === id),
        }
      })
    : seasonEntries({}, members, [])
  const setupTeamProblem = draftSettings.teamMode
    ? teamAssignmentProblem(
        setupTeamIds,
        members.map((m) => ({ uid: m.uid, teamId: setupAssignments[m.uid] ?? undefined }))
      )
    : null

  // The arrangement as it stands against the roster as it stands. Derived
  // rather than held, because the roster moves underneath it: a league member
  // can join the season while it is still being set up, and the saved order
  // knows nothing about them until this squares the two.
  //
  // Against the entries rather than the members: in team mode the order is an
  // order of teams, and reconcilePickOrder squares a saved order of uids with
  // a roster of team ids — or the reverse, after the mode is switched — the
  // same way it squares any other stale list.
  const pickOrder = reconcilePickOrder(
    draftSettings.adminPickOrder,
    setupEntries.map((e) => e.key)
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
    teamMode: draftSettings.teamMode,
    teamCount: setupTeamCount,
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
          // Absent on seasons from before teams; read as off.
          teamMode: data.teamMode === true,
          teamCount: String(data.teamCount ?? TEAM_COUNT_MIN),
          // A snapshot means the stored layout has moved, and the roster
          // listener carries the new teamIds — so drags made against the
          // old one are stale, not pending.
          assignmentOverrides: {},
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
      (snap) => {
        const list: MemberDoc[] = snap.docs.map((d) => {
          const data = d.data() as SeasonMemberDoc
          // See LeagueMemberDoc.displayName — cross-user reads are denied.
          return { ...data, uid: d.id, displayName: data.displayName || d.id }
        })
        setMembers(list)
      }
    )
    return unsub
  }, [seasonId, user, canView])

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

  // What is waiting to be decided on, so the episode list can say so rather
  // than sending an admin into every unscored episode to find out. Pending
  // only: a discarded suggestion is not waiting for anybody, and an approved
  // one has already become the episode's score.
  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'scoreProposals'),
      'score proposals',
      (snap) => {
        setEpisodesAwaitingReview(
          new Set(
            snap.docs
              .filter((d) => (d.data() as ScoreProposalDoc).status === 'pending')
              .map((d) => d.id)
          )
        )
      }
    )
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
      const created = await addDoc(collection(db, 'seasons', seasonId, 'contestants'), {
        name: contestantForm.name.trim(),
        photoUrl: contestantForm.photoUrl.trim(),
        // Left off entirely when nobody framed the picture: absent is what the
        // renderer reads as "all of it", and Firestore refuses an undefined.
        ...(contestantForm.photoCrop ? { photoCrop: contestantForm.photoCrop } : {}),
        bio: normaliseBio(contestantForm.bio),
        draftedByUid: null,
        draftedRound: null,
        eliminatedEpisode: null,
      } satisfies ContestantDoc)
      // After the document, because the object is keyed by the contestant it
      // belongs to — there was nothing to key it by until now. A contestant
      // whose photo fails to upload is still a contestant, with a frame that
      // offers the picture again.
      if (contestantForm.photoFile && user) {
        await uploadContestantPhoto(
          seasonId,
          created.id,
          user.uid,
          contestantForm.photoFile,
          contestantForm.photoCrop
        )
      }
      setContestantForm(emptyContestantForm)
    } finally {
      setAddingContestant(false)
    }
  }

  /**
   * The contestant whose photo is being reframed from the roster, if any.
   *
   * Framing a picture was part of entering the cast, so it lived in the setup
   * panel and left with it: once a season started, a photo that sat badly —
   * or that looked fine in the form and wrong beside a name — could not be
   * moved. Nothing about a crop depends on the season's state, so the roster
   * offers the same dialog the setup form does, on the photo itself.
   */
  const [croppingContestantId, setCroppingContestantId] = useState<string | null>(null)
  const [savingCrop, setSavingCrop] = useState(false)
  const [cropError, setCropError] = useState('')
  /** The contestant an admin is about to drop from a season being set up. */
  const [removingContestant, setRemovingContestant] = useState<Contestant | null>(null)
  const [removingContestantBusy, setRemovingContestantBusy] = useState(false)

  function openEditContestant(contestant: Contestant) {
    setEditContestantError('')
    setEditContestantForm({
      name: contestant.name,
      photoUrl: contestant.photoUrl,
      photoCrop: contestant.photoCrop,
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
      // Only the fields the form owns. A contestant document also carries who
      // drafted them and when they went out, and spreading the form over the
      // document would take those with it.
      await updateDoc(doc(db, 'seasons', seasonId, 'contestants', editingContestantId), {
        name: editContestantForm.name.trim(),
        photoUrl: editContestantForm.photoUrl.trim(),
        // deleteField rather than omitted: a picture that was framed and then
        // pointed somewhere else has to lose the crop that no longer fits it,
        // and an omitted key would leave the old one in place.
        photoCrop: editContestantForm.photoCrop ?? deleteField(),
        bio: normaliseBio(editContestantForm.bio),
      })
      // Second, so the address it writes is not overwritten by the form's own
      // idea of the photo — which is the old one until this lands.
      if (editContestantForm.photoFile && user) {
        await uploadContestantPhoto(
          seasonId,
          editingContestantId,
          user.uid,
          editContestantForm.photoFile,
          editContestantForm.photoCrop
        )
      }
      setEditingContestantId(null)
    } finally {
      setSavingContestant(false)
    }
  }

  /**
   * Store a crop chosen from the roster.
   *
   * Only the crop: the contestant's name, bio, owner and elimination are not
   * this dialog's business, and writing the document from a form that does not
   * hold them would take them with it. The rules already let a season's admin
   * update a contestant at any point in the season, so this needs nothing new
   * from them.
   */
  async function handleSaveContestantPhoto(
    contestantId: string,
    { crop, file }: ContestantPhotoChoice
  ) {
    if (!seasonId || !user) return
    setCropError('')
    setSavingCrop(true)
    try {
      if (file) {
        // A new picture, so the file and the crop go together — the crop
        // belongs to this photo and means nothing against the last one.
        await uploadContestantPhoto(seasonId, contestantId, user.uid, file, crop)
      } else {
        await updateDoc(doc(db, 'seasons', seasonId, 'contestants', contestantId), {
          photoCrop: crop,
        })
      }
      setCroppingContestantId(null)
    } catch {
      // Said on the dialog rather than swallowed: it stays open over the
      // framing that was just chosen, so the save can be tried again without
      // redoing it.
      setCropError(t(file ? 'contestant.photoUploadFailed' : 'contestant.photoCropFailed'))
    } finally {
      setSavingCrop(false)
    }
  }

  /**
   * Drop a contestant from a season being set up.
   *
   * Setup only, which is when a cast is still being assembled: after the draft
   * a contestant is on somebody's roster and in the scores, and removing one
   * there would take points out of a season already being played. The rules let
   * an admin delete at any point — this is the client withholding a control
   * whose consequences nobody wants, not a boundary.
   *
   * The uploaded photo, if there is one, stays in the bucket: only whoever
   * uploaded it may delete it, and the document that pointed at it is gone.
   */
  async function handleRemoveContestant() {
    if (!seasonId || !removingContestant) return
    setRemovingContestantBusy(true)
    try {
      await deleteDoc(doc(db, 'seasons', seasonId, 'contestants', removingContestant.id))
      setRemovingContestant(null)
    } finally {
      setRemovingContestantBusy(false)
    }
  }

  /** Close the season, or open it again. See setSeasonCompleted. */
  async function handleSetCompleted(completed: boolean) {
    if (!seasonId || !leagueId) return
    setClosingSeason(true)
    try {
      await setSeasonCompleted(seasonId, leagueId, completed)
      setCompleteConfirm(false)
      setReopenConfirm(false)
    } finally {
      setClosingSeason(false)
    }
  }

  async function handleSaveSetup() {
    if (!seasonId) return
    setSavingSetup(true)
    // What the form has had done to it as of this write. Anything past this is
    // an edit the write did not carry.
    const savedAtEdit = settingsEdits.current
    try {
      await writeSeasonSetup(seasonId, leagueId!, {
        settings: draftSettingsToSave,
        teams,
        assignments: assignmentWrites(members, setupAssignments),
      })
      setSettingsSaved(true)
      // The drags are stored now, and the roster listener is about to say so.
      setDraftSettings((s) => ({ ...s, assignmentOverrides: {} }))
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

  /**
   * Put a drafting season back into setup.
   *
   * A forgotten contestant is usually noticed once the draft is under way, and
   * changing one means undoing the draft — so this only opens the confirmation,
   * and the confirmation says what it costs. Nothing is navigated: the setup
   * panel is on this same page, and the season listener brings it in as soon as
   * the state changes.
   */
  /**
   * Open the board. One server call — the order, the pick positions and the
   * first deadline are all set there, on the server's clock. See startDraft in
   * functions/src/index.ts.
   */
  async function handleStartDraft() {
    if (!seasonId || startingDraft) return
    setStartingDraft(true)
    setStartDraftError('')
    try {
      const { data } = await startDraft({ seasonId })
      trackEvent('draft_started', { season_id: seasonId, player_count: data.pickOrder.length })
    } catch (error) {
      setStartDraftError((error as { message?: string }).message ?? t('draft.error.start'))
      console.error('Start draft rejected', error)
    } finally {
      setStartingDraft(false)
    }
  }

  async function handleResetDraft() {
    if (!seasonId) return
    setResettingDraft(true)
    setResetDraftError('')
    try {
      await reopenSeasonSetup({ seasonId })
      // Closed on success, which the version of this in the draft room did not
      // have to do: it navigated away, and the dialog went with the page. Here
      // the page stays, so leaving it open put a backdrop over the setup panel
      // the admin had just asked for.
      setResetDraftOpen(false)
    } catch (error) {
      console.error('Failed to reopen the season for setup', error)
      setResetDraftError(error instanceof Error ? error.message : t('common.error'))
    } finally {
      setResettingDraft(false)
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
      await writeSeasonSetup(seasonId, leagueId!, {
        settings: draftSettingsToSave,
        state: 'draft',
        teams,
        assignments: assignmentWrites(members, setupAssignments),
      })
      // Nowhere to navigate: the season listener brings the lobby in here, in
      // place of the setup panel that was just used.
    } finally {
      setOpeningDraft(false)
    }
  }

  async function handleRemoveMember() {
    if (!seasonId || !leagueId || !removeMemberTarget) return
    setRemovingMember(true)
    setRemoveMemberError('')
    try {
      await removeSeasonMember(seasonId, leagueId, removeMemberTarget.uid)
      setRemoveMemberTarget(null)
    } catch (error) {
      console.error('Could not remove the participant', error)
      setRemoveMemberError(t('season.participants.removeFailed'))
    } finally {
      setRemovingMember(false)
    }
  }

  /** `entryKey` is a member's uid, or a team id in team mode — see src/lib/entries.ts. */
  async function handleAssignFreeAgent(contestantId: string, entryKey: string) {
    if (!seasonId || !user) return
    await updateDoc(doc(db, 'seasons', seasonId, 'contestants', contestantId), {
      draftedByUid: entryKey,
      draftedRound: null,
    })
    await logAuditEvent({
      action: 'free_agent_assigned',
      seasonId,
      contestantId,
      targetUid: entryKey,
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

  /**
   * A finished season is a record. Everything that could change one is withheld
   * — scores, rules, free agents, the unlock — and the security rules refuse a
   * score while the state says `complete`, so this is what the page shows
   * rather than what holds the line.
   */
  const seasonClosed = season?.state === 'complete'
  /** Admin controls that write something, which a closed season does not offer. */
  const canManageSeason = isAdmin && !seasonClosed
  /** An admin looking at a season they are still setting up — the setup panel's audience. */
  const adminInSetup = isAdmin && season?.state === 'setup'
  const canClose = season
    ? canCompleteSeason(season.state, season.episodeCount, episodeStatuses)
    : false
  const winner = seasonClosed
    ? seasonWinner(
        entries.map((e) => e.key),
        season?.teamTotals ?? {}
      )
    : null

  const openProblem = openDraftProblem(
    contestants.length,
    rules.length,
    setupEntries.length,
    setupTeamProblem
  )
  const canOpenDraft = openProblem === null
  const openDraftHint =
    openProblem === 'more-players-than-contestants'
      ? draftSettings.teamMode
        ? t('season.openDraftTooManyTeams')
        : t('season.openDraftTooManyPlayers')
      : openProblem === 'no-teams'
        ? t('season.openDraftNoTeams')
        : openProblem === 'team-empty'
          ? t('season.openDraftTeamEmpty')
          : openProblem === 'member-unassigned'
            ? t('season.openDraftUnassigned')
            : t('season.openDraftDisabled')
  const freeAgents = contestants.filter((c) => !c.draftedByUid)
  // The signed-in member's own roster row, when they have one. Everyone on this
  // page can see the season; only somebody actually playing it has a team to
  // name and a colour to claim.
  const myMember = members.find((m) => m.uid === user?.uid)
  // The entry they play for: themselves, or their team — or nothing yet, in a
  // team-mode season where the admin has not placed them.
  const myKey = entryKeyFor(season, myMember)
  const myEntry = entryByKey(entries, myKey)
  // Colours other teams hold, so the picker can grey them out. Derived from the
  // listeners that are already open rather than read separately — the
  // uniqueness rule itself is enforced by setTeamColor, server-side, so this is
  // only what the picker draws.
  const takenColors = takenTeamColors(entries, myKey ?? undefined)
  const colorHolder = (color: AccentColor) => teamHoldingColor(entries, color, myKey ?? undefined)
  // The roster's rows, resolved to the text each cell shows before they are
  // sorted — see sortRosterRows for why the sort works on that text and not on
  // the contestant documents behind it.
  const rosterRows = useMemo(() => {
    const rows = contestants.map((c) => {
      const owner = entryByKey(entries, c.draftedByUid)
      return {
        id: c.id,
        photoUrl: c.photoUrl,
        photoCrop: c.photoCrop,
        eliminated: c.eliminatedEpisode !== null,
        contestant: c.name,
        owner: c.draftedByUid ? (owner?.label ?? '\u2014') : t('contestant.freeAgent'),
        // Carried alongside the owner's name rather than looked up in the
        // cell, so the sort still works on exactly the text it renders.
        ownerColor: owner ? teamColorFor(owner) : null,
        ownerTeamName: owner?.teamName ?? '',
        status: c.eliminatedEpisode !== null ? t('contestant.eliminated') : t('contestant.active'),
      }
    })
    return sortRosterRows(rows, rosterSort)
  }, [contestants, entries, rosterSort])
  /** Shut the dialog. A picture chosen and never saved goes with it. */
  function closeCropDialog() {
    setCroppingContestantId(null)
    setCropError('')
  }

  /** The contestant behind the crop dialog, drawn from the live documents so a
      photo changed elsewhere is the one being framed. */
  const croppingContestant = contestants.find((c) => c.id === croppingContestantId) ?? null
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
    setEditForm({ label: season.label, episodeCount: String(season.episodeCount) })
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
        { label: season.label, episodeCount: season.episodeCount },
        { label: editForm.label.trim(), episodeCount }
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
          {/* Deliberately not gated on season.state — a name or episode count
              can need correcting long after the draft has opened. */}
          {isAdmin && (
            <Button variant="secondary" onClick={openEditSeason}>
              {t('season.editDetails')}
            </Button>
          )}
          {/* Offered only once every episode is scored and locked, and replaced
              by its own undo once it has been used. */}
          {/* Beside Edit season rather than down in the draft, because it is
              the same kind of thing: a season-level action only an admin has.
              Named for what it costs — Edit season changes a label, this throws
              the draft away — since the two sit side by side. */}
          {isAdmin && season.state === 'draft' && (
            <Button variant="danger" onClick={() => setResetDraftOpen(true)}>
              {t('draft.editSettings')}
            </Button>
          )}
          {isAdmin && canClose && (
            <Button onClick={() => setCompleteConfirm(true)}>{t('season.markCompleted')}</Button>
          )}
          {isAdmin && seasonClosed && (
            <Button variant="secondary" onClick={() => setReopenConfirm(true)}>
              {t('season.reopen')}
            </Button>
          )}
          {isAdmin &&
            season.state === 'draft' &&
            draftLobbyVisible(draftLoaded, draft?.status ?? null) && (
              <Button onClick={handleStartDraft} loading={startingDraft}>
                {t('draft.lobby.startDraft')}
              </Button>
            )}
        </div>
      </div>
      {startDraftError && <p className="mb-4 text-sm text-red-600">{startDraftError}</p>}

      {/* Your team, in every state of the season.
          It used to live only in the draft room, which meant a member who
          joined a season already under way — or who came back to a finished
          one — had nowhere to name their team at all. Nothing in a season
          depends on the name or the colour, so there is nothing to protect by
          taking them away; the only test is whether this is your season.

          Except for an admin during setup, who has the whole setup panel below
          to get through and can name their team as soon as the draft opens —
          the card is one more thing between them and the work. */}
      {myMember && myEntry && myKey && seasonId && leagueId && !adminInSetup && (
        <TeamIdentityCard
          seasonId={seasonId}
          leagueId={leagueId}
          target={teamMode ? { kind: 'team', teamId: myKey } : { kind: 'member', uid: myKey }}
          teamName={myEntry.teamName}
          teammates={myEntry.players
            .filter((p) => p.uid !== myMember.uid)
            .map((p) => p.displayName)}
          teamColor={teamColorFor(myEntry)}
          takenColors={takenColors}
          takenLabel={colorHolder}
          seasonState={season.state}
        />
      )}
      {/* A member of a team-mode season nobody has placed yet has no team to
          name. Said plainly, rather than the card silently not appearing. */}
      {myMember && !myEntry && teamMode && !adminInSetup && (
        <p className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
          {t('team.unassignedNotice')}
        </p>
      )}

      {/* Participants — who is in the season, and the way to take somebody
          out of it. Its own panel above the setup rather than a section of
          it: the roster is people, the setup is configuration, and the
          remove control is the one thing here that acts on somebody else. */}
      {adminInSetup && canRemoveFromSeason(season.state) && (
        <section className="mb-8 rounded-2xl border border-gray-200 bg-white p-6">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">
            {t('season.participants.heading', { n: members.length })}
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-gray-400">{t('season.participants.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {[...members]
                .sort((a, b) =>
                  a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
                )
                .map((m) => (
                  <li
                    key={m.uid}
                    className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-4 py-3"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <UserAvatar
                        displayName={m.displayName}
                        photoUrl={m.photoUrl}
                        photoCrop={m.photoCrop}
                      />
                      <span className="truncate text-sm font-medium text-gray-800">
                        {m.displayName}
                      </span>
                    </span>
                    <Button
                      variant="ghost"
                      className="!min-h-0 shrink-0 !px-2 !py-1 text-xs !text-red-600 hover:!bg-red-50"
                      onClick={() => {
                        setRemoveMemberError('')
                        setRemoveMemberTarget(m)
                      }}
                    >
                      {t('season.participants.remove')}
                    </Button>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {/* Setup panel */}
      {adminInSetup && (
        <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Season Setup</h2>

          {/* Contestants */}
          <section className="mb-6">
            {/* The same card the draft board uses, scaled down: the cast is
                checked over as a whole here, so the photo and the opening of
                the bio are what matter, not one line of text per name. The
                heading matches the panel's other sections rather than the
                board's small capitals — see ContestantGrid. */}
            <ContestantGrid
              heading={t('season.contestantsHeading', { n: contestants.length })}
              headingClassName="mb-3 font-medium text-gray-700"
              className={contestants.length > 0 ? 'mb-4' : ''}
              contestants={contestants}
              compact
              cardProps={(c) => ({
                onEdit: () => openEditContestant(c),
                onRemove: () => setRemovingContestant(c),
              })}
            />
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
                  className="rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="auto-pick">{t('draft.timerExpiry.autoPick')}</option>
                  <option value="admin-picks">{t('draft.timerExpiry.adminPicks')}</option>
                  <option value="skip">{t('draft.timerExpiry.skip')}</option>
                </select>
              </label>
            </div>

            {/* Team mode. A switch is always in one state or the other, so
                the question is answered — off — before the admin touches it,
                and the count and the boxes only appear once it is on. */}
            <div className="mt-4">
              <Switch
                id="team-mode"
                checked={draftSettings.teamMode}
                onChange={(on) => editDraftSettings((s) => ({ ...s, teamMode: on }))}
                label={t('team.mode.question')}
                hint={t('team.mode.help')}
              />
            </div>

            {draftSettings.teamMode && (
              <div className="mt-4 flex flex-col gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-gray-600">{t('team.count.label')}</span>
                  <input
                    type="number"
                    required
                    min={TEAM_COUNT_MIN}
                    max={TEAM_COUNT_MAX}
                    value={draftSettings.teamCount}
                    // Takes whatever is typed, as the timer does; settled on
                    // blur. The boxes below follow the clamped value.
                    onChange={(e) =>
                      editDraftSettings((s) => ({ ...s, teamCount: e.target.value }))
                    }
                    onBlur={() =>
                      setDraftSettings((s) => ({
                        ...s,
                        teamCount: String(clampTeamCount(parseInt(s.teamCount, 10))),
                      }))
                    }
                    className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <TeamAssignmentBoard
                  members={members}
                  teamCount={setupTeamCount}
                  assignments={setupAssignments}
                  teamNames={Object.fromEntries(teams.map((team) => [team.id, team.teamName]))}
                  onAssign={(uid, teamId) =>
                    editDraftSettings((s) => ({
                      ...s,
                      assignmentOverrides: { ...s.assignmentOverrides, [uid]: teamId },
                    }))
                  }
                />
              </div>
            )}

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
                  rows={setupEntries}
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
              title={!canOpenDraft ? openDraftHint : undefined}
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
          {!canOpenDraft && <p className="mt-2 text-xs text-gray-400">{openDraftHint}</p>}
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
          canEdit={canManageSeason}
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

      <Modal
        open={resetDraftOpen}
        onClose={() => setResetDraftOpen(false)}
        title={t('draft.reopenTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetDraftOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={resettingDraft} onClick={handleResetDraft}>
              {resettingDraft ? t('draft.reopening') : t('draft.reopenConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t('draft.reopenBody')}</p>
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {t('draft.reopenWarning')}
        </p>
        {resetDraftError && <p className="mt-3 text-sm text-red-600">{resetDraftError}</p>}
      </Modal>

      {/* The draft, in place of the signpost that used to point at it.
          A season that is drafting shows the room itself — the lobby before it
          starts, the board once it does, the settling up afterwards — because
          once the lobby carried the cast and the rules there was nothing left
          here that the room did not already have, and the step between them
          only stood between a reader and what they came for.

          No membership test beyond the state: this page is already closed to
          anyone who is not in the season. See canJoinDraft. */}
      {season.state === 'draft' && seasonId && leagueId && (
        <DraftRoom
          seasonId={seasonId}
          leagueId={leagueId}
          season={season}
          members={members}
          teams={teams}
          contestants={contestants}
          rules={rules}
          isAdmin={isAdmin}
        />
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
              {/* Above the standings rather than inside them: it is about the
                  season, not about one row. */}
              {winner && (
                <SeasonChampion
                  winner={winner}
                  teams={winner.keys.map((key) => {
                    const entry = entryByKey(entries, key)
                    return {
                      key,
                      teamName: entry?.teamName ?? '',
                      players: entry?.players ?? [{ uid: key, displayName: key }],
                      teamColor: teamColorFor(entry ?? { key }),
                    }
                  })}
                />
              )}
              {entries.length === 0 ? (
                <p className="text-gray-400">{t('leaderboard.noScoresYet')}</p>
              ) : (
                [...entries]
                  .sort((a, b) => (season.teamTotals[b.key] ?? 0) - (season.teamTotals[a.key] ?? 0))
                  .map((entry, idx) => {
                    const scoredEpisodes = Object.keys(season.teamEpisodeTotals[entry.key] ?? {})
                      .map(Number)
                      .sort((a, b) => a - b)
                    const lastEp = scoredEpisodes[scoredEpisodes.length - 1]
                    const prevEp = scoredEpisodes[scoredEpisodes.length - 2]
                    const delta =
                      lastEp !== undefined
                        ? (season.teamEpisodeTotals[entry.key]?.[lastEp] ?? 0) -
                          (prevEp !== undefined
                            ? (season.teamEpisodeTotals[entry.key]?.[prevEp] ?? 0)
                            : 0)
                        : null

                    const teamContestants = contestants.filter((c) => c.draftedByUid === entry.key)

                    return (
                      <LeaderboardRow
                        key={entry.key}
                        rank={idx + 1}
                        teamName={entry.teamName}
                        players={entry.players}
                        totalPoints={season.teamTotals[entry.key] ?? 0}
                        delta={delta}
                        teamColor={teamColorFor(entry)}
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
                          {/* The photo is the control. An admin who can see
                              that a face sits badly in its frame is looking at
                              the thing they want to move, so that is what they
                              press — a separate Adjust button in a cast list
                              would be a column of buttons repeating what the
                              picture already offers.

                              An empty frame is a control too: it is where a
                              contestant who has never had a photo gets one,
                              and the dialog opens on the file picker rather
                              than on a stage with nothing to position.

                              A button only for somebody who may use it;
                              everyone else gets the plain thumbnail, and a
                              closed season's roster is a record like every
                              other part of it. */}
                          {canManageSeason ? (
                            <ContestantPhotoButton
                              name={row.contestant}
                              photoUrl={row.photoUrl}
                              photoCrop={row.photoCrop}
                              onClick={() => {
                                setCropError('')
                                setCroppingContestantId(row.id)
                              }}
                            />
                          ) : (
                            <ContestantAvatar photoUrl={row.photoUrl} photoCrop={row.photoCrop} />
                          )}
                          {row.contestant}
                        </span>
                      </td>
                      <td
                        className={['py-3', row.eliminated ? 'text-red-600' : 'text-gray-500'].join(
                          ' '
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {/* A free agent has no team, so no dot — the gap is
                              what says so, and the cell already reads "Free
                              agent" beside it. */}
                          {row.ownerColor && (
                            <TeamColorDot color={row.ownerColor} teamName={row.ownerTeamName} />
                          )}
                          {row.owner}
                        </span>
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
                    {canManageSeason && (
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
                const awaitingReview = episodesAwaitingReview.has(String(n))
                return (
                  <div
                    key={n}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4"
                  >
                    <div>
                      <p className="font-medium text-gray-900">
                        {t('scoring.episodeTitle', { n })}
                      </p>
                      <p className="text-xs text-gray-400">
                        {!scored
                          ? t('scoring.notScored')
                          : locked
                            ? t('scoring.submitted')
                            : t('scoring.unlockedForEditing')}
                      </p>
                    </div>
                    {/* Members get a way in to read the scores; the page
                        renders read-only for anyone who cannot enter them. */}
                    {!isAdmin && scored && (
                      <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                        <Button variant="ghost">{t('scoring.viewScores')}</Button>
                      </Link>
                    )}
                    {/* And a way in to an episode nobody has scored, which is
                        the only route to filling one in for an admin to
                        approve. Without this the card exists and nothing on
                        this page leads to it. */}
                    {!isAdmin && !scored && (
                      <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                        <Button variant="ghost">{t('scoring.suggestScores')}</Button>
                      </Link>
                    )}
                    {/* An admin's controls, split by what they do rather than
                        by who they belong to. Reading a scorecard is not
                        managing one, so `View scores` stays when the season is
                        closed — gating the whole group on canManageSeason left
                        an admin with no way into a finished season's scores at
                        all, while every member kept theirs. */}
                    {isAdmin && (
                      <div className="flex gap-2">
                        {/* Not alongside `Edit scores`, which is a link to the
                            same page — an unlocked episode an admin can still
                            edit needs one way in, not two. */}
                        {/* A locked episode gets this alone: the unlock lives
                            on the scorecard this opens, and a second button
                            here led to the same page. */}
                        {scored && (locked || !canManageSeason) && (
                          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                            <Button variant="ghost">{t('scoring.viewScores')}</Button>
                          </Link>
                        )}
                        {canManageSeason && !scored && (
                          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                            {/* Somebody has already filled this one in: the
                                admin is going in to decide on their card, not
                                to face an empty one. */}
                            <Button variant="secondary">
                              {awaitingReview
                                ? t('scoring.seeSuggestedScores')
                                : t('scoring.scoreEpisode', { n })}
                            </Button>
                          </Link>
                        )}
                        {canManageSeason && scored && !locked && (
                          <Link to={`/leagues/${leagueId}/seasons/${seasonId}/score/${n}`}>
                            <Button variant="secondary">{t('scoring.editScores')}</Button>
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
      {/* Closing the season */}
      <Modal
        open={completeConfirm}
        onClose={() => setCompleteConfirm(false)}
        title={t('season.markCompleted')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCompleteConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={closingSeason} onClick={() => handleSetCompleted(true)}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('season.markCompletedConfirm', { label: season.label })}</p>
      </Modal>

      {/* Opening it again */}
      <Modal
        open={reopenConfirm}
        onClose={() => setReopenConfirm(false)}
        title={t('season.reopen')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReopenConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={closingSeason} onClick={() => handleSetCompleted(false)}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('season.reopenConfirm', { label: season.label })}</p>
      </Modal>

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

      {/* Remove a participant */}
      <Modal
        open={removeMemberTarget !== null}
        onClose={() => setRemoveMemberTarget(null)}
        title={t('season.participants.removeTitle', {
          name: removeMemberTarget?.displayName ?? '',
        })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveMemberTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={removingMember} onClick={handleRemoveMember}>
              {removingMember ? t('season.participants.removing') : t('season.participants.remove')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t('season.participants.removeExplain')}</p>
        {removeMemberError && <p className="mt-3 text-sm text-red-600">{removeMemberError}</p>}
      </Modal>

      <Modal
        open={!!assignFreeAgentOpen}
        onClose={() => setAssignFreeAgentOpen(null)}
        title={t('contestant.assignToTeam')}
      >
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => handleAssignFreeAgent(assignFreeAgentOpen!, entry.key)}
              className={`flex items-center gap-3 rounded-lg border border-l-4 border-gray-200 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${accentLeftBorder[teamColorFor(entry)]}`}
            >
              <PlayerAvatars players={entry.players} />
              <span>
                {entry.teamName}{' '}
                <span className="text-gray-400 text-sm">({playerNames(entry.players)})</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Reframing a contestant's photo from the roster.
          Keyed on the contestant, so opening one after another mounts a fresh
          dialog rather than reopening the last one's zoom over a new face —
          the same reason ContestantFields keys it on the picture's address. */}
      {croppingContestant && (
        <ContestantPhotoDialog
          key={croppingContestant.id}
          open
          onClose={closeCropDialog}
          photoUrl={croppingContestant.photoUrl}
          photoCrop={croppingContestant.photoCrop}
          onSave={(choice) => handleSaveContestantPhoto(croppingContestant.id, choice)}
          saving={savingCrop}
          error={cropError}
        />
      )}

      {/* Dropping one from a cast still being assembled. A plain confirm
          rather than the type-the-name dialog a season deletion gets: a
          contestant in setup has nothing behind them yet — no roster place, no
          scores — so the cost of a slip is retyping a name. */}
      <Modal
        open={!!removingContestant}
        onClose={() => setRemovingContestant(null)}
        title={t('contestant.removeTitle', { name: removingContestant?.name ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemovingContestant(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removingContestantBusy}
              onClick={handleRemoveContestant}
            >
              {t('contestant.remove')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('contestant.removeConfirm')}</p>
      </Modal>
    </Layout>
  )
}
