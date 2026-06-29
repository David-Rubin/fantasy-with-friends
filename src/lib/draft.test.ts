import { describe, it, expect } from 'vitest'
import { SnakeDraftStrategy, resolvePickOrder, advancePick } from './draft'
import type { DraftState } from './draft'

describe('SnakeDraftStrategy', () => {
  const strategy = new SnakeDraftStrategy()

  it('round 1 picks left-to-right', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 1,
      currentPickNumber: 1,
      totalContestants: 6,
    }
    expect(strategy.getNextPicker(state)?.uid).toBe('u1')
  })

  it('round 1 pick 2 is second player', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 1,
      currentPickNumber: 2,
      totalContestants: 6,
    }
    expect(strategy.getNextPicker(state)?.uid).toBe('u2')
  })

  it('round 2 (even) picks right-to-left', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 2,
      currentPickNumber: 1,
      totalContestants: 6,
    }
    // Even round, pick 1 → index = length - 1 = 'u3'
    expect(strategy.getNextPicker(state)?.uid).toBe('u3')
  })

  it('round 2 pick 2 is second-to-last', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 2,
      currentPickNumber: 2,
      totalContestants: 6,
    }
    expect(strategy.getNextPicker(state)?.uid).toBe('u2')
  })

  it('returns null when all contestants drafted', () => {
    const state: DraftState = {
      pickOrder: ['u1'],
      currentRound: 3,
      currentPickNumber: 1,
      totalContestants: 2,
    }
    expect(strategy.getNextPicker(state)).toBeNull()
  })
})

describe('advancePick', () => {
  it('advances pick number within a round', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 1,
      currentPickNumber: 1,
      totalContestants: 9,
    }
    const next = advancePick(state)
    expect(next?.round).toBe(1)
    expect(next?.pickNumber).toBe(2)
  })

  it('wraps to next round when pick number hits end', () => {
    const state: DraftState = {
      pickOrder: ['u1', 'u2', 'u3'],
      currentRound: 1,
      currentPickNumber: 3,
      totalContestants: 9,
    }
    const next = advancePick(state)
    expect(next?.round).toBe(2)
    expect(next?.pickNumber).toBe(1)
  })

  it('returns null when all contestants are drafted', () => {
    const state: DraftState = {
      pickOrder: ['u1'],
      currentRound: 3,
      currentPickNumber: 1,
      totalContestants: 3,
    }
    expect(advancePick(state)).toBeNull()
  })
})

describe('resolvePickOrder', () => {
  it('admin-set returns provided order', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2', 'u3'], ['u3', 'u1', 'u2'])
    expect(result).toEqual(['u3', 'u1', 'u2'])
  })

  it('randomized returns all members in some order', () => {
    const members = ['u1', 'u2', 'u3', 'u4']
    const result = resolvePickOrder('randomized', members)
    expect(result.sort()).toEqual(members.sort())
    expect(result.length).toBe(4)
  })

  it('randomized with no admin order falls back to shuffle', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2'])
    expect(result.sort()).toEqual(['u1', 'u2'])
  })
})
