import type { DraftStatus, PickOrderMethod } from './types'

/**
 * Client-side draft helpers.
 *
 * Turn order and completion are NOT decided here. They live in the submitPick
 * and resolveExpiredTurn Cloud Functions (see functions/src/draft.ts), because
 * a client that computes its own next turn can award itself extra ones. This
 * module previously carried an `advancePick` that ended the draft once the turn
 * position implied every slot was used; that rule is wrong under skips and is
 * now gone rather than left here to be copied by mistake. The one piece of
 * that arithmetic kept here, teamCapacity, is for display.
 *
 * Pick order resolution stays client-side: it runs once, before the draft opens,
 * and the resulting order is written to the draft document for the server to
 * work from.
 */

// ── Team capacity ─────────────────────────────────────────────────────────────

/**
 * How many contestants each team gets: the pool shared out evenly, with the
 * remainder left on the bench. Mirrored from functions/src/draft.ts, where it
 * decides when a team is full and the draft is over; here it only decides
 * what the bench panel shows as open. Never below one — see the server copy.
 *
 * @param draftable contestants in the season that are not eliminated
 */
export function teamCapacity(draftable: number, teams: number): number {
  if (teams <= 0) return 0
  return Math.max(1, Math.floor(draftable / teams))
}

// ── Pick order resolution ─────────────────────────────────────────────────────

/**
 * A saved admin-set order, brought back into line with who is actually in the
 * season.
 *
 * The order is arranged during setup and used when the draft opens, and the
 * roster can move in between: a league member may join a season on their own
 * while it is still `setup`, and an admin may remove someone. Using the saved
 * list as written would then hand a turn to somebody who has left, or leave a
 * newcomer out of the rotation entirely — an off-by-one that only shows up
 * mid-draft, when there is no way back.
 *
 * So departed uids are dropped, and anyone missing is appended in roster order.
 * Appending rather than refusing keeps the admin's arrangement intact: the part
 * they set stays exactly as they left it, and the newcomer picks last until
 * they say otherwise.
 */
export function reconcilePickOrder(
  savedOrder: string[] | undefined | null,
  memberUids: string[]
): string[] {
  const members = new Set(memberUids)
  const placed = (savedOrder ?? []).filter(
    (uid, i, all) => members.has(uid) && all.indexOf(uid) === i
  )
  const seen = new Set(placed)
  return [...placed, ...memberUids.filter((uid) => !seen.has(uid))]
}

export function resolvePickOrder(
  method: PickOrderMethod,
  memberUids: string[],
  adminSetOrder?: string[] | null
): string[] {
  if (method === 'admin-set' && adminSetOrder?.length) {
    return reconcilePickOrder(adminSetOrder, memberUids)
  }
  // Randomized — Fisher-Yates shuffle
  const arr = [...memberUids]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * One row moved to another position, as a new array. The list is short and
 * rearranged by hand, so clarity beats an in-place splice.
 */
export function movePickOrder(order: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= order.length || to >= order.length) return order
  const next = [...order]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// ── Standing in a room that is no longer there ───────────────────────────────

/**
 * Whether the room should show the lobby — the screen before the draft starts.
 *
 * `draftLoaded` is the whole point of this being a function. The draft document
 * is read as a collection, and an empty result is meaningful: a reset deletes
 * the document, which is what puts a room back into the lobby. So the room
 * cannot tell "no draft" from "no snapshot yet" by looking at the document
 * alone, and before this it could not tell them apart at all — every entry to a
 * running draft rendered the lobby for a frame first. With nothing in it but a
 * sentence that was easy to miss; with the cast in it, it is a flash of the
 * wrong screen.
 *
 * `'lobby'` is a declared DraftStatus that nothing currently writes — startDraft
 * creates the document already `'active'` — so in practice this returns true on
 * the null. The arm is kept because the status exists and a future writer of it
 * would mean exactly this screen.
 */
export function draftLobbyVisible(draftLoaded: boolean, status: DraftStatus | null): boolean {
  if (!draftLoaded) return false
  return status === null || status === 'lobby'
}
