import type { MemberRole } from './types'

/**
 * Who counts as an admin, in one place.
 *
 * Three pages worked this out for themselves and wrote the same expression
 * three times — `myRole === 'owner' || myRole === 'admin' || isSuperadmin` —
 * which is three chances to get it wrong and no way to change the answer once.
 * The membership half and the superadmin half are separate functions because
 * they are separate questions: a league's own roster says the first, and the
 * app-level `superadmins` collection says the second. See src/lib/types.ts.
 *
 * Pure, and free of Firebase, so the decision can be asserted on directly —
 * the hook that supplies the arguments is in useIsAdmin.ts.
 *
 * None of this is a boundary. Every one of these answers is re-derived in
 * firestore.rules and in the callables, which is what actually holds; this
 * decides what a screen offers.
 */

/** An owner or an admin of the league itself. A missing role is not a member. */
export function hasAdminRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** The owner of the league. */
export function hasOwnerRole(role: MemberRole | null | undefined): boolean {
  return role === 'owner'
}

/**
 * The full question a screen asks: an admin of this league, or a superadmin,
 * who is treated as one everywhere without joining.
 */
export function isLeagueAdmin(role: MemberRole | null | undefined, isSuperadmin: boolean): boolean {
  return hasAdminRole(role) || isSuperadmin
}
