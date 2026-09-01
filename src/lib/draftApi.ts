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
  { seasonId: string; contestantId?: string; onBehalfOf?: string; warm?: boolean },
  { status: 'active' | 'awaiting-close' | 'complete'; warmed?: boolean }
>(functions, 'submitPick')

/**
 * Give a bench contestant to a team that finished a roster short. Admin only,
 * and only while the draft is awaiting close.
 */
export const assignFromBench = httpsCallable<
  { seasonId: string; contestantId: string; toUid: string },
  { ok: true }
>(functions, 'assignFromBench')

/**
 * Open the board: fix the pick order, hand out positions, start the clock.
 * Admin only.
 *
 * Server-side for the clock above all. The deadline is judged against the
 * server's own clock — when a turn expires, what a pause banks — so writing it
 * from a browser mixed two clocks, and an admin whose machine ran fast gave
 * everyone a longer turn than the season was configured for. See startDraft in
 * functions/src/index.ts.
 */
export const startDraft = httpsCallable<
  { seasonId: string },
  { pickOrder: string[]; timerExpiresAt: number }
>(functions, 'startDraft')

/**
 * Stop or restart the pick clock. Admin only.
 *
 * Server-side so it reaches every participant, not just the admin who pressed
 * it. Time left is banked and handed back on resume, so the current picker
 * loses nothing.
 */
export const setTimerPaused = httpsCallable<
  { seasonId: string; paused: boolean; warm?: boolean },
  { paused: boolean; remainingMs: number | null; warmed?: boolean }
>(functions, 'setTimerPaused')

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

/**
 * Put a drafting season back into setup so its settings can be changed.
 *
 * Destructive by design: the draft document and every pick are deleted, each
 * contestant is returned to the pool and pick positions are cleared, so the
 * caller must confirm first. Admin only, and refused unless the season is
 * currently `draft` — undoing the draft of a season that has been scored would
 * leave a leaderboard describing rosters that no longer exist.
 */
export const reopenSeasonSetup = httpsCallable<
  { seasonId: string },
  { clearedPicks: number; clearedContestants: number }
>(functions, 'reopenSeasonSetup')
