/**
 * Snake-draft turn arithmetic, mirrored from src/lib/draft.ts.
 *
 * Kept as a standalone copy rather than shared with the client bundle: the
 * client's version drives what the UI shows, this one decides what is actually
 * written. If the two ever disagree the server wins, which is the point —
 * a modified client cannot talk its way into an extra turn.
 */

/**
 * The next turn slot. Purely positional: it wraps through pickOrder and starts
 * a new round at the end, and never decides that the draft is over.
 *
 * Completion is deliberately not computed here. A skipped turn advances the
 * slot without drafting anyone, so position no longer tracks how many
 * contestants have actually been taken — deriving "are we done" from
 * (round, pickNumber) would end the draft early and strand undrafted
 * contestants. The caller decides completion by counting the board instead.
 */
export function nextSlot(
  pickOrder: string[],
  currentRound: number,
  currentPickNumber: number
): { round: number; pickNumber: number } {
  if (currentPickNumber >= pickOrder.length) {
    return { round: currentRound + 1, pickNumber: 1 }
  }
  return { round: currentRound, pickNumber: currentPickNumber + 1 }
}

/**
 * Is the draft finished, evaluated after a turn has been used?
 *
 * The draft ends on a round boundary, once too few contestants remain to give
 * everyone another one. Stopping mid-round would hand later picks in the order
 * a contestant their rivals never got a shot at.
 *
 * Parity is measured in turns taken, not roster size. Those are the same thing
 * until somebody's clock expires under `skip`: a skipped player takes nothing
 * that round and, with no makeup picks (PRD 3.3.1), can never draw level again.
 * Requiring equal rosters would therefore be unsatisfiable after a single skip
 * and the draft would run until the board was bare. Counting turns keeps the
 * finish line reachable — a skipped player simply ends with a smaller roster.
 *
 * `remaining === 0` is the backstop: with nothing left there is nothing to
 * continue for, whatever the rosters look like.
 *
 * @param justUsedPickNumber the pick slot that was just consumed, by a pick or a skip
 * @param teams              participants in the draft — pickOrder.length
 * @param remaining          undrafted, uneliminated contestants left afterwards
 */
export function isDraftComplete(
  justUsedPickNumber: number,
  teams: number,
  remaining: number
): boolean {
  if (remaining === 0) return true
  const atRoundBoundary = justUsedPickNumber >= teams
  return atRoundBoundary && remaining < teams
}

/**
 * Whose turn (round, pickNumber) belongs to. Even rounds run backwards — that
 * reversal is the whole of "snake". Rounds may run past the number originally
 * projected when turns get skipped, which the parity check handles fine.
 */
export function pickerAt(pickOrder: string[], round: number, pickNumber: number): string {
  const isEvenRound = round % 2 === 0
  const idx = isEvenRound ? pickOrder.length - pickNumber : pickNumber - 1
  return pickOrder[idx]
}
