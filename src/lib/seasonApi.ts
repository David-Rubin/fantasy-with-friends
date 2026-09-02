import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './audit'
import type { SeasonDetails } from './seasonDetails'
import type { SeasonState } from './types'
import { normalizeTeamName } from './teamName'
import type { SeasonMemberDoc } from './types'

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
    accentColor: next.accentColor,
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
  photoUrl?: string
): Promise<void> {
  await setDoc(doc(db, 'seasons', seasonId, 'members', uid), {
    // uid, displayName and photoUrl are denormalized deliberately — see
    // SeasonMemberDoc. Written here as well as by the trigger so a member is
    // not a blank circle between joining and their next profile edit.
    uid,
    displayName,
    ...(photoUrl ? { photoUrl } : {}),
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
 * A member naming their own team.
 *
 * Whether they may is decided in ./teamName and, as a constraint rather than
 * advice, by the `update` rule on the season roster — which pins the write to
 * the caller's own document, to the `teamName` field alone, and to a season
 * with nothing scored against it yet.
 *
 * The name is normalized here so the value that was validated is the value that
 * gets stored; the rule checks the stored length, so a name padded past the
 * limit with spaces would otherwise be rejected by the server after the client
 * had accepted it.
 */
export async function renameTeam(
  seasonId: string,
  leagueId: string,
  uid: string,
  previous: string,
  next: string
): Promise<void> {
  const teamName = normalizeTeamName(next)

  await updateDoc(doc(db, 'seasons', seasonId, 'members', uid), { teamName })

  await logAuditEvent({
    action: 'team_renamed',
    seasonId,
    leagueId,
    targetUid: uid,
    oldValue: previous,
    newValue: teamName,
  })
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
