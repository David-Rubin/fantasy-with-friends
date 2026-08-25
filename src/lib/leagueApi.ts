import { doc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'
import { logAuditEvent } from './audit'
import type { LeagueDoc } from './types'

/**
 * Owner-only edits to a league: its details, and its roster.
 *
 * The two go through different paths on purpose. Renaming is a single-document
 * write the security rules can authorize on their own, so it stays on the
 * client. Removing a member cannot be — see removeLeagueMember below.
 */

/**
 * Rename a league or change its description.
 *
 * `memberCount` is deliberately not touched: the rule requires it to be
 * unchanged on any client update, since it is derived state owned by the
 * onLeagueMemberWritten trigger.
 */
export async function updateLeagueDetails(
  leagueId: string,
  previous: Pick<LeagueDoc, 'name' | 'description'>,
  next: Pick<LeagueDoc, 'name' | 'description'>
): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId), {
    name: next.name,
    description: next.description,
  })

  await logAuditEvent({
    action: 'league_details_updated',
    leagueId,
    oldValue: previous,
    newValue: next,
  })
}

/**
 * Remove a member from a league.
 *
 * A callable rather than a delete, because the rule that governs it is one
 * security rules cannot express: a member may only go if they are not in a
 * season that is drafting or active, which means querying every season of the
 * league. `leagues/{id}/members/{uid}` is delete-denied to clients so this is
 * the only route.
 *
 * Rejects with `failed-precondition` when a season is in the way; the message
 * names the seasons and is written to be shown to the owner as-is.
 */
export const removeLeagueMember = httpsCallable<
  { leagueId: string; uid: string },
  { leftSeasons: string[]; keptSeasons: string[] }
>(functions, 'removeLeagueMember')
