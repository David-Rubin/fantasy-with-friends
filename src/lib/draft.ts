import type { DraftDoc, PickOrderMethod } from './types'

// ── Strategy interface ────────────────────────────────────────────────────────

export interface DraftState {
  pickOrder: string[] // uid[]
  currentRound: number
  currentPickNumber: number
  totalContestants: number
}

export interface DraftStrategy {
  getNextPicker(state: DraftState): { uid: string; round: number; pickNumber: number } | null
}

// ── Snake draft ───────────────────────────────────────────────────────────────

export class SnakeDraftStrategy implements DraftStrategy {
  getNextPicker(state: DraftState): { uid: string; round: number; pickNumber: number } | null {
    const { pickOrder, currentRound, currentPickNumber, totalContestants } = state
    const totalPicked = (currentRound - 1) * pickOrder.length + (currentPickNumber - 1)
    if (totalPicked >= totalContestants) return null

    const isEvenRound = currentRound % 2 === 0
    const idx = isEvenRound
      ? pickOrder.length - currentPickNumber
      : currentPickNumber - 1

    return {
      uid: pickOrder[idx],
      round: currentRound,
      pickNumber: currentPickNumber,
    }
  }
}

export function advancePick(
  state: DraftState,
): { round: number; pickNumber: number } | null {
  const { pickOrder, currentRound, currentPickNumber, totalContestants } = state
  const totalPicked = (currentRound - 1) * pickOrder.length + currentPickNumber
  if (totalPicked >= totalContestants) return null

  if (currentPickNumber >= pickOrder.length) {
    return { round: currentRound + 1, pickNumber: 1 }
  }
  return { round: currentRound, pickNumber: currentPickNumber + 1 }
}

// ── Pick order resolution ─────────────────────────────────────────────────────

export function resolvePickOrder(
  method: PickOrderMethod,
  memberUids: string[],
  adminSetOrder?: string[],
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

// ── Current picker from DraftDoc ──────────────────────────────────────────────

export function getCurrentPickerUid(draft: DraftDoc): string | null {
  if (draft.status !== 'active') return null
  return draft.currentPickerUid
}
