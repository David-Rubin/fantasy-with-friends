import { describe, it, expect } from 'vitest'
import { nextSlot, pickerAt, isDraftComplete, draftOutcome, openSlots } from './draft'

describe('nextSlot', () => {
  const twoTeams = ['alice', 'bob']

  it('advances within a round', () => {
    expect(nextSlot(twoTeams, 1, 1)).toEqual({ round: 1, pickNumber: 2 })
  })

  it('wraps to the next round at the end of the order', () => {
    expect(nextSlot(twoTeams, 1, 2)).toEqual({ round: 2, pickNumber: 1 })
  })

  it('keeps going past the round count a full board would imply', () => {
    // Skipped turns burn slots without taking anyone, so a draft can run well
    // past the rounds its contestant count first suggested.
    expect(nextSlot(twoTeams, 7, 2)).toEqual({ round: 8, pickNumber: 1 })
  })
})

describe('pickerAt', () => {
  const order = ['alice', 'bob', 'cara']

  it('runs forwards on odd rounds', () => {
    expect(pickerAt(order, 1, 1)).toBe('alice')
    expect(pickerAt(order, 1, 3)).toBe('cara')
  })

  it('runs backwards on even rounds — the snake', () => {
    expect(pickerAt(order, 2, 1)).toBe('cara')
    expect(pickerAt(order, 2, 3)).toBe('alice')
  })

  it('keeps alternating in later rounds', () => {
    expect(pickerAt(order, 3, 1)).toBe('alice')
    expect(pickerAt(order, 4, 1)).toBe('cara')
  })
})

describe('isDraftComplete', () => {
  it('does not end mid-round, even with too few left for everyone', () => {
    // 3 teams, slot 2 of the round used, 1 contestant left. Ending here would
    // give the player at slot 3 nothing while slots 1 and 2 both drafted.
    expect(isDraftComplete(2, 3, 1)).toBe(false)
  })

  it('ends on a round boundary when too few remain for another full round', () => {
    expect(isDraftComplete(3, 3, 2)).toBe(true)
  })

  it('continues when exactly enough remain for another full round', () => {
    expect(isDraftComplete(3, 3, 3)).toBe(false)
  })

  it('ends the moment the board empties, whatever the slot', () => {
    // The backstop: nothing left to draft, so there is nothing to continue for
    // even mid-round with uneven rosters after skips.
    expect(isDraftComplete(1, 3, 0)).toBe(true)
  })

  it('walks the 2-team, 5-contestant draft to a single free agent', () => {
    const teams = 2
    // R1P1 -> 4 left, R1P2 -> 3 left, R2P1 -> 2 left, R2P2 -> 1 left
    expect(isDraftComplete(1, teams, 4)).toBe(false)
    expect(isDraftComplete(2, teams, 3)).toBe(false) // boundary, 3 >= 2, keep going
    expect(isDraftComplete(1, teams, 2)).toBe(false)
    expect(isDraftComplete(2, teams, 1)).toBe(true) // boundary, 1 < 2, done
    // Both teams hold 2, one contestant is left over as a free agent.
  })

  it('walks the 2-team, 4-contestant draft to no free agents', () => {
    const teams = 2
    expect(isDraftComplete(1, teams, 3)).toBe(false)
    expect(isDraftComplete(2, teams, 2)).toBe(false) // boundary, 2 >= 2, keep going
    expect(isDraftComplete(1, teams, 1)).toBe(false)
    expect(isDraftComplete(2, teams, 0)).toBe(true) // board empty
  })

  it('stays reachable after a skip has made rosters uneven', () => {
    // Parity is counted in turns, not rosters. A skipped player can never draw
    // level again (no makeup picks), so a roster-equality rule would never fire
    // and the draft would drain the board instead of stopping.
    const teams = 2
    expect(isDraftComplete(2, teams, 1)).toBe(true)
  })
})

describe('draftOutcome', () => {
  it('keeps going while the finish condition is unmet', () => {
    expect(draftOutcome(1, 2, 4, [1, 0])).toBe('continue')
  })

  it('closes outright when everyone is level and the board is bare', () => {
    expect(draftOutcome(2, 2, 0, [2, 2])).toBe('complete')
  })

  it('closes outright when everyone is level and a contestant is spare', () => {
    // The 2-team, 5-contestant ending: nobody is short, so the leftover is
    // simply a free agent and there is nothing for an admin to settle.
    expect(draftOutcome(2, 2, 1, [2, 2])).toBe('complete')
  })

  it('waits for an admin when a roster is short and the bench is not empty', () => {
    // The skip case: one player took a turn fewer, and a contestant is going
    // spare that could fill the gap.
    expect(draftOutcome(2, 2, 1, [1, 2])).toBe('awaiting-close')
  })

  it('closes outright when a roster is short but nothing is left to give', () => {
    // Uneven, but the bench is empty — an admin has no decision to make.
    expect(draftOutcome(2, 2, 0, [1, 2])).toBe('complete')
  })
})

describe('openSlots', () => {
  it('is the gap up to the largest roster', () => {
    expect(openSlots(1, [1, 3])).toBe(2)
  })

  it('is zero for a team already at the top', () => {
    expect(openSlots(3, [1, 3])).toBe(0)
  })

  it('never goes negative', () => {
    expect(openSlots(5, [1, 3])).toBe(0)
  })

  it('is zero when everyone is level', () => {
    expect(openSlots(2, [2, 2, 2])).toBe(0)
  })
})
