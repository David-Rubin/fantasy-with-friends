import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/**
 * The three deletions, each a callable because each target is a document tree
 * the client cannot enumerate — see the Deletion section of functions/src/index.ts.
 * The matching Firestore rules are all `allow delete: if false`, so this is the
 * only way any of them happens.
 */

export const deleteLeague = httpsCallable<
  { leagueId: string },
  { seasonsDeleted: number; membersDeleted: number }
>(functions, 'deleteLeague')

export const deleteSeason = httpsCallable<{ seasonId: string }, { leagueId: string }>(
  functions,
  'deleteSeason'
)

export const deleteUser = httpsCallable<
  { uid: string },
  { leaguesLeft: number; seasonsLeft: number; seasonsKept: number }
>(functions, 'deleteUser')

/**
 * The message a failed deletion should show.
 *
 * The interesting failures are the deliberate ones — a user who still owns a
 * league, a season still being drafted — and the function puts a sentence
 * naming the obstacle into the error. Showing that beats any generic string the
 * client could substitute, so it is used whenever there is one.
 */
export function deletionErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { message?: string })?.message
  return message && message.trim() !== '' ? message : fallback
}
