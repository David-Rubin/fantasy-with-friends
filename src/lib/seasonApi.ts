import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'
import { logAuditEvent } from './audit'
import type { SeasonDetails } from './seasonDetails'
import type { CarriedDraftSettings } from './seasonCarryOver'
import { storedPhotoFields, type StoredPhoto } from './photoCrop'
import type { AccentColor, SeasonState, SeasonTeam, SeasonTeamDoc } from './types'
import { normalizeTeamName } from './teamName'
import { teamIdFor } from './teamAssignment'
import { t } from './i18n'
import type { ScoringRule, ScoringRuleDoc, SeasonDoc, SeasonMember, SeasonMemberDoc } from './types'

/**
 * Writing a season's edited details.
 *
 * Deliberately not gated on `state`: a show name typo or a season that turned
 * out to run two episodes longer than announced needs fixing whether the draft
 * is open, the season is halfway scored, or it finished last year. The security
 * rule already scopes this to `isSeasonAdmin`, which resolves to the league's
 * owner and admins plus any superadmin.
 *
 * What may be written is decided in ./seasonDetails, which stays free of
 * Firebase so it can be tested without it.
 *
 * Draft settings (pick order, timer) are not here — those belong to the draft
 * and are edited from the setup panel while a season is still `setup`.
 */
export async function updateSeasonDetails(
  seasonId: string,
  leagueId: string,
  previous: SeasonDetails,
  next: SeasonDetails
): Promise<void> {
  await updateDoc(doc(db, 'seasons', seasonId), {
    label: next.label,
    episodeCount: next.episodeCount,
  })

  await logAuditEvent({
    action: 'season_details_updated',
    seasonId,
    leagueId,
    oldValue: previous,
    newValue: next,
  })
}

/**
 * Everything a new season needs, with every choice already made.
 *
 * The roster and the rules arrive as documents rather than as "copy last
 * season": what a copy comes out as is decided in ./seasonCarryOver, which can
 * be tested without Firebase, and this only writes what it is handed. An empty
 * roster is a legitimate answer — a season nobody has been added to yet, which
 * league members join themselves from the league page.
 */
export interface NewSeason {
  leagueId: string
  label: string
  episodeCount: number
  draftSettings: CarriedDraftSettings
  members: SeasonMemberDoc[]
  scoringRules: ScoringRuleDoc[]
  /** The teams of a team-mode season, keyed by their `team-N` id. Absent means none. */
  teams?: { id: string; doc: SeasonTeamDoc }[]
  /** The season these were copied from, for the audit trail. */
  copiedFromSeasonId?: string
}

/**
 * Creating a season, with whatever it inherits from the season before it.
 *
 * The season document goes first and alone, because everything else is written
 * beneath it and the rules authorising those writes read it: `isSeasonAdmin`
 * resolves the league through the season document, so a roster written before
 * the season exists is a roster nobody is allowed to write. What follows is one
 * batch, so a season never comes into being with half a roster or half its
 * rules — the two states an admin would have to spot and unpick by hand.
 *
 * `teamTotals` and `teamEpisodeTotals` start empty and are the Cloud Functions'
 * from then on; `firstEpisodeScoredAt` is null because nothing has been scored.
 */
export async function createSeason(input: NewSeason): Promise<string> {
  const seasonRef = await addDoc(collection(db, 'seasons'), {
    leagueId: input.leagueId,
    label: input.label,
    episodeCount: input.episodeCount,
    state: 'setup',
    ...input.draftSettings,
    createdAt: Date.now(),
    firstEpisodeScoredAt: null,
    teamTotals: {},
    teamEpisodeTotals: {},
  } satisfies SeasonDoc)

  const batch = writeBatch(db)
  for (const member of input.members) {
    batch.set(doc(db, 'seasons', seasonRef.id, 'members', member.uid), member)
  }
  const rulesRef = collection(db, 'seasons', seasonRef.id, 'scoringRules')
  for (const rule of input.scoringRules) batch.set(doc(rulesRef), rule)
  for (const team of input.teams ?? []) {
    batch.set(doc(db, 'seasons', seasonRef.id, 'teams', team.id), team.doc)
  }
  await batch.commit()

  await logAuditEvent({
    action: 'season_created',
    seasonId: seasonRef.id,
    leagueId: input.leagueId,
    newValue: {
      label: input.label,
      episodeCount: input.episodeCount,
      members: input.members.length,
      scoringRules: input.scoringRules.length,
      copiedFromSeasonId: input.copiedFromSeasonId ?? null,
    },
  })

  return seasonRef.id
}

/** Last season's roster and rules, as the new-season dialog shows them. */
export interface CarryOverSourceData {
  members: SeasonMember[]
  scoringRules: ScoringRule[]
  /** Empty for a season that did not play in teams. */
  teams: SeasonTeam[]
}

/**
 * Read the season a new one would copy from.
 *
 * One-shot rather than a listener: this is a dialog reading a season that has
 * already been played, so there is nothing live to follow, and a listener left
 * open behind a closed dialog is a subscription nobody cancels.
 */
export async function readCarryOverSource(seasonId: string): Promise<CarryOverSourceData> {
  const [memberDocs, ruleDocs, teamDocs] = await Promise.all([
    getDocs(collection(db, 'seasons', seasonId, 'members')),
    getDocs(collection(db, 'seasons', seasonId, 'scoringRules')),
    getDocs(collection(db, 'seasons', seasonId, 'teams')),
  ])
  return {
    members: memberDocs.docs.map((d) => ({ ...(d.data() as SeasonMemberDoc), uid: d.id })),
    scoringRules: ruleDocs.docs.map((d) => ({ id: d.id, ...(d.data() as ScoringRuleDoc) })),
    teams: teamDocs.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonTeamDoc) })),
  }
}

/**
 * A league member joining a season themselves.
 *
 * Whether they may is decided in ./seasonMembership and, as a constraint rather
 * than advice, by the `create` rule on the season roster — the button only ever
 * appears where that rule would also allow the write.
 *
 * The team name mirrors what a season's own creation and a join-request
 * approval already give everybody, so a roster reads the same however its
 * members arrived. It is theirs to change afterwards.
 */
export async function joinSeason(
  seasonId: string,
  leagueId: string,
  uid: string,
  displayName: string,
  photo?: StoredPhoto
): Promise<void> {
  await setDoc(doc(db, 'seasons', seasonId, 'members', uid), {
    // uid, displayName and the picture are denormalized deliberately — see
    // SeasonMemberDoc. Written here as well as by the trigger so a member is
    // not a blank circle between joining and their next profile edit, and the
    // crop travels with the URL so they are not an unframed one either.
    uid,
    displayName,
    ...storedPhotoFields(photo),
    teamName: `${displayName}'s Team`,
    pickPosition: null,
    joinedAt: Date.now(),
  } satisfies SeasonMemberDoc)

  await logAuditEvent({
    action: 'season_joined',
    seasonId,
    leagueId,
    targetUid: uid,
  })
}

/**
 * A member taking themselves off a season's roster.
 *
 * Whether they may is decided in ./seasonMembership and, as a constraint,
 * by the `delete` rule on the season roster: own document, season still in
 * setup. Nothing else is written — see the rule for why nothing needs to be.
 */
export async function leaveSeason(seasonId: string, leagueId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'seasons', seasonId, 'members', uid))

  await logAuditEvent({
    action: 'season_left',
    seasonId,
    leagueId,
    targetUid: uid,
  })
}

/**
 * An admin taking somebody off a season's roster, from the setup panel.
 *
 * The same write as leaveSeason under the admin's `write` on the roster,
 * recorded under its own action because who did it is the whole difference:
 * a member who left chose to, a member who was removed did not.
 */
export async function removeSeasonMember(
  seasonId: string,
  leagueId: string,
  uid: string
): Promise<void> {
  await deleteDoc(doc(db, 'seasons', seasonId, 'members', uid))

  await logAuditEvent({
    action: 'season_member_removed',
    seasonId,
    leagueId,
    targetUid: uid,
  })
}

/** The draft settings the setup panel writes — see draftSettingsToSave there. */
export type SeasonSetupSettings = Pick<
  SeasonDoc,
  'pickOrderMethod' | 'timerSeconds' | 'timerExpiry' | 'adminPickOrder' | 'teamMode' | 'teamCount'
>

/**
 * Save the setup panel: the draft settings, the team layout, and — when
 * opening the draft — the state change, in one batch.
 *
 * One batch rather than a write per thing because they describe one layout.
 * A team count of three with members on a fourth team is not a state the
 * setup panel can draw, and a save interrupted between the two writes would
 * have left exactly that.
 *
 * Team documents are `team-1` … `team-N`, written with merge so a name a
 * member already chose and a colour the onSeasonTeamWritten trigger already
 * handed out survive a re-save; teams past the new count are deleted, and the
 * members on them are in `assignments` as null because the panel already
 * treats them as unassigned (see effectiveAssignments). Team mode switched
 * off leaves the team documents and the members' teamIds where they are —
 * nothing draws them while `teamMode` is false, and switching back on finds
 * the layout as it was, the same courtesy the pick order gets when the method
 * is toggled.
 *
 * Admin-only by the rules on every document touched.
 */
export async function writeSeasonSetup(
  seasonId: string,
  leagueId: string,
  input: {
    settings: SeasonSetupSettings
    /** Set to open the draft in the same write. */
    state?: Extract<SeasonState, 'draft'>
    /** The team documents as they stand, so names and colours are kept. */
    teams: SeasonTeam[]
    /** Only the members whose team changed — see assignmentWrites. */
    assignments: { uid: string; teamId: string | null }[]
  }
): Promise<void> {
  const { settings, state, teams, assignments } = input
  const batch = writeBatch(db)
  const now = Date.now()

  batch.update(doc(db, 'seasons', seasonId), { ...settings, ...(state ? { state } : {}) })

  if (settings.teamMode) {
    const count = settings.teamCount ?? 0
    for (let n = 1; n <= count; n += 1) {
      const id = teamIdFor(n)
      const existing = teams.find((team) => team.id === id)
      batch.set(
        doc(db, 'seasons', seasonId, 'teams', id),
        {
          number: n,
          teamName: existing?.teamName ?? t('team.defaultName', { n }),
          pickPosition: null,
          createdAt: existing?.createdAt ?? now,
        } satisfies Omit<SeasonTeamDoc, 'teamColor'>,
        { merge: true }
      )
    }
    for (const team of teams) {
      if (team.number > count) batch.delete(doc(db, 'seasons', seasonId, 'teams', team.id))
    }
    for (const { uid, teamId } of assignments) {
      batch.update(doc(db, 'seasons', seasonId, 'members', uid), {
        teamId: teamId ?? deleteField(),
      })
    }
  }

  await batch.commit()

  if (settings.teamMode) {
    await logAuditEvent({
      action: 'season_teams_updated',
      seasonId,
      leagueId,
      newValue: {
        teamCount: settings.teamCount ?? 0,
        assigned: assignments.filter((a) => a.teamId).length,
        unassigned: assignments.filter((a) => !a.teamId).length,
      },
    })
  }
}

/**
 * Where a team's name lives: on the member's own document in a solo season,
 * on the team document in team mode. See src/lib/entries.ts.
 */
export type TeamTarget = { kind: 'member'; uid: string } | { kind: 'team'; teamId: string }

/**
 * A member naming their team.
 *
 * What a name may be is decided in ./teamName. That it is *their* team is a
 * constraint rather than advice: the `update` rule on the season roster pins
 * the write to the caller's own document and to the `teamName` field alone,
 * and the rule on `teams` pins it to a team the caller's own membership names
 * — in whatever state the season is in.
 *
 * The name is normalized here so the value that was validated is the value that
 * gets stored; the rule checks the stored length, so a name padded past the
 * limit with spaces would otherwise be rejected by the server after the client
 * had accepted it.
 */
export async function renameTeam(
  seasonId: string,
  leagueId: string,
  target: TeamTarget,
  previous: string,
  next: string
): Promise<void> {
  const teamName = normalizeTeamName(next)
  const ref =
    target.kind === 'team'
      ? doc(db, 'seasons', seasonId, 'teams', target.teamId)
      : doc(db, 'seasons', seasonId, 'members', target.uid)

  await updateDoc(ref, { teamName })

  await logAuditEvent({
    action: 'team_renamed',
    seasonId,
    leagueId,
    targetUid: target.kind === 'team' ? target.teamId : target.uid,
    oldValue: previous,
    newValue: teamName,
  })
}

/**
 * A member choosing their team's colour.
 *
 * A callable rather than a direct write, and the only reason is that the
 * constraint is not local: no two teams in a season may hold the same colour,
 * which is a question about the whole roster. A security rule cannot query a
 * collection, so the field is closed to clients and setTeamColor in
 * functions/src/index.ts settles it in a transaction — see "Where a rule
 * belongs" in CLAUDE.md.
 *
 * Rejects with `failed-precondition` when somebody claimed the colour first;
 * the picker turns that into a line of text rather than a thrown error, because
 * two people reaching for sage at once is an ordinary thing to happen.
 */
export const setTeamColor = httpsCallable<
  { seasonId: string; teamColor: AccentColor },
  { teamColor: AccentColor }
>(functions, 'setTeamColor')

/** Whether a rejected colour change was rejected because somebody has it. */
export function isColorTakenError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'functions/failed-precondition'
  )
}

/**
 * Closing a season, and opening it again.
 *
 * Whether it may be closed is decided in ./seasonCompletion; that it stays
 * closed is decided by the security rules, which stop accepting a score while
 * the state is `complete`. A page that merely hid the controls would be making
 * a promise it could not keep.
 *
 * Reversible on purpose, and the reverse is the same one-field write. An admin
 * who closes a season a week early — or who has to correct a scoring mistake
 * somebody spots afterwards — should not need anybody's help to undo it.
 */
export async function setSeasonCompleted(
  seasonId: string,
  leagueId: string,
  completed: boolean
): Promise<void> {
  const state: SeasonState = completed ? 'complete' : 'active'
  await updateDoc(doc(db, 'seasons', seasonId), { state })

  await logAuditEvent({
    action: completed ? 'season_completed' : 'season_reopened',
    seasonId,
    leagueId,
    newValue: state,
  })
}
