import type { PickOrderMethod } from './types'

/**
 * Client-side draft helpers.
 *
 * Turn order and completion are NOT decided here. They live in the submitPick
 * and resolveExpiredTurn Cloud Functions (see functions/src/draft.ts), because
 * a client that computes its own next turn can award itself extra ones. This
 * module previously carried an `advancePick` that ended the draft once the turn
 * position implied every slot was used; that rule is wrong under skips and is
 * now gone rather than left here to be copied by mistake.
 *
 * Pick order resolution stays client-side: it runs once, before the draft opens,
 * and the resulting order is written to the draft document for the server to
 * work from.
 */

// ── Pick order resolution ─────────────────────────────────────────────────────

export function resolvePickOrder(
  method: PickOrderMethod,
  memberUids: string[],
  adminSetOrder?: string[]
): string[] {
  if (method === 'admin-set' && adminSetOrder?.length) {
    return adminSetOrder
  }
  // Randomized — Fisher-Yates shuffle
  const arr = [...memberUids]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
