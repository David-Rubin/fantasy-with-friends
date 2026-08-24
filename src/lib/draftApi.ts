import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/**
 * Submit a draft pick.
 *
 * Every write a pick entails happens server-side. Three of the four documents
 * involved are admin-only, so a member picking from the client was denied
 * partway through and left the draft stalled; the function also checks turn and
 * availability in one transaction, closing the double-pick race.
 *
 * `onBehalfOf` is an admin proxy pick (PRD 3.3.2) and is rejected for non-admins.
 */
export const submitPick = httpsCallable<
  { seasonId: string; contestantId: string; onBehalfOf?: string },
  { status: 'active' | 'awaiting-close' | 'complete' }
>(functions, 'submitPick')

/**
 * Give a bench contestant to a team that finished a roster short. Admin only,
 * and only while the draft is awaiting close.
 */
export const assignFromBench = httpsCallable<
  { seasonId: string; contestantId: string; toUid: string },
  { ok: true }
>(functions, 'assignFromBench')

/** Close a draft that is waiting on an admin. Admin only. */
export const closeDraft = httpsCallable<{ seasonId: string }, { ok: true }>(functions, 'closeDraft')

/**
 * Tell the server a pick clock has run out.
 *
 * The countdown here is only a display; the server re-checks against its own
 * clock and ignores the call if the turn has not really expired. `round` and
 * `pickNumber` identify the turn that was seen expiring, so the many clients
 * that all hit zero together cannot each burn a turn — the first call wins and
 * the rest no-op.
 */
export const resolveExpiredTurn = httpsCallable<
  { seasonId: string; round: number; pickNumber: number },
  { outcome: 'auto-picked' | 'skipped' | 'halted' | 'paused' | 'no-op'; status?: string }
>(functions, 'resolveExpiredTurn')
