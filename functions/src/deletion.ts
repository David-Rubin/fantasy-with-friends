/**
 * What stops a deletion, decided apart from Firestore so it can be tested.
 *
 * The deleting itself is uninteresting — a recursive delete of a document tree.
 * The part worth asserting on is which deletions must be refused, and why, so
 * that the refusal can say something the admin can act on rather than just
 * "no".
 */

import type { MemberSeason } from './membership'

/** A league the user being deleted owns, named so a refusal can list it. */
export interface OwnedLeague {
  id: string
  name: string
}

export interface UserDeletionSubject {
  /** The superadmin is trying to delete their own account. */
  isSelf: boolean
  ownedLeagues: OwnedLeague[]
  /** Every season the user is a member of, whatever its state. */
  seasons: MemberSeason[]
}

export type UserDeletionProblem =
  | { kind: 'self' }
  | { kind: 'owns-leagues'; names: string[] }
  | { kind: 'seasons-underway'; labels: string[] }

/**
 * Why a user cannot be deleted, or null when they can.
 *
 * Three refusals, in the order an admin can act on them.
 *
 * A superadmin cannot delete themselves. There is no UI for granting the role —
 * see the `superadmins` rule — so the last superadmin deleting their own
 * account would leave an app nobody can administer, recoverable only out of
 * band against the database.
 *
 * Owning a league blocks deletion because `ownerId` is what every ownership
 * check compares against: removing members, transferring the league, deleting
 * it. A league whose ownerId names a deleted account cannot be administered by
 * anyone. Cascading instead was considered and rejected — one account's
 * deletion would destroy seasons, rosters and scores belonging to every other
 * member of those leagues, who did nothing. So the superadmin deals with the
 * leagues first, deliberately, and the refusal names them.
 *
 * A season that is drafting or active blocks deletion for exactly the reason it
 * blocks a removal from a league — pick order is a fixed list of uids and
 * scores are keyed by uid, so pulling a player out mid-run leaves a draft that
 * cannot finish or a leaderboard with a hole in it. `setup` and `complete`
 * seasons do not block: see planRemoval, which decides what happens to each.
 */
export function userDeletionProblem(subject: UserDeletionSubject): UserDeletionProblem | null {
  if (subject.isSelf) return { kind: 'self' }
  if (subject.ownedLeagues.length > 0) {
    return { kind: 'owns-leagues', names: subject.ownedLeagues.map((l) => l.name) }
  }
  const underway = subject.seasons.filter((s) => s.state === 'draft' || s.state === 'active')
  if (underway.length > 0) {
    return { kind: 'seasons-underway', labels: underway.map((s) => s.label) }
  }
  return null
}

/** The refusal an admin sees. Phrased so the next step is obvious. */
export function userDeletionMessage(problem: UserDeletionProblem): string {
  switch (problem.kind) {
    case 'self':
      return 'You cannot delete your own account.'
    case 'owns-leagues':
      return (
        `They own ${list(problem.names)}. Transfer ownership or delete ` +
        `${problem.names.length === 1 ? 'that league' : 'those leagues'} first.`
      )
    case 'seasons-underway':
      return (
        `They are playing in ${list(problem.labels)}. Accounts can only be deleted ` +
        'once a season has finished.'
      )
  }
}

/** "a", "a and b", "a, b and c" — a list a person would read aloud. */
function list(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}
