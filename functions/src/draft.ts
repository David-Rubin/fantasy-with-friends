/**
 * Snake-draft turn arithmetic, mirrored from src/lib/draft.ts.
 *
 * Kept as a standalone copy rather than shared with the client bundle: the
 * client's version drives what the UI shows, this one decides what is actually
 * written. If the two ever disagree the server wins, which is the point —
 * a modified client cannot talk its way into an extra turn.
 */

export interface DraftState {
  pickOrder: string[]
  currentRound: number
  currentPickNumber: number
  totalContestants: number
}

/** The next (round, pickNumber), or null when the board is exhausted. */
export function advancePick(state: DraftState): { round: number; pickNumber: number } | null {
  const { pickOrder, currentRound, currentPickNumber, totalContestants } = state
  const totalPicked = (currentRound - 1) * pickOrder.length + currentPickNumber
  if (totalPicked >= totalContestants) return null

  if (currentPickNumber >= pickOrder.length) {
    return { round: currentRound + 1, pickNumber: 1 }
  }
  return { round: currentRound, pickNumber: currentPickNumber + 1 }
}

/**
 * Whose turn (round, pickNumber) belongs to. Even rounds run backwards — that
 * reversal is the whole of "snake".
 */
export function pickerAt(pickOrder: string[], round: number, pickNumber: number): string {
  const isEvenRound = round % 2 === 0
  const idx = isEvenRound ? pickOrder.length - pickNumber : pickNumber - 1
  return pickOrder[idx]
}
