import { describe, it, expect } from 'vitest'
import { canCompleteSeason, seasonWinner } from './seasonCompletion'

const allLocked = (n: number) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), true]))

describe('canCompleteSeason', () => {
  it('allows it once every episode is scored and locked', () => {
    expect(canCompleteSeason('active', 3, allLocked(3))).toBe(true)
  })

  it('refuses while an episode has no scores at all', () => {
    expect(canCompleteSeason('active', 3, { '1': true, '2': true })).toBe(false)
  })

  // Scored but unlocked means an admin is still working on it; closing the
  // season around it would freeze it half-finished.
  it('refuses while an episode is unlocked for editing', () => {
    expect(canCompleteSeason('active', 3, { ...allLocked(3), '2': false })).toBe(false)
  })

  // Adding an episode is a statement that the season is not over.
  it('refuses again when the season grows', () => {
    expect(canCompleteSeason('active', 4, allLocked(3))).toBe(false)
  })

  it('only applies to a season that is running', () => {
    for (const state of ['setup', 'draft', 'complete'] as const) {
      expect(canCompleteSeason(state, 3, allLocked(3))).toBe(false)
    }
  })

  it('refuses a season with no episodes to score', () => {
    expect(canCompleteSeason('active', 0, {})).toBe(false)
  })
})

describe('seasonWinner', () => {
  it('names the highest score', () => {
    expect(seasonWinner(['a', 'b', 'c'], { a: 10, b: 40, c: 25 })).toEqual({
      uids: ['b'],
      points: 40,
      tied: false,
    })
  })

  // No tiebreak rule exists, and inventing one here would settle a league's
  // season on a technicality nobody agreed to.
  it('shares a tie rather than breaking it', () => {
    expect(seasonWinner(['a', 'b', 'c'], { a: 40, b: 40, c: 25 })).toEqual({
      uids: ['a', 'b'],
      points: 40,
      tied: true,
    })
  })

  it('counts a member with no total as zero, as the leaderboard does', () => {
    expect(seasonWinner(['a', 'b'], { a: -5 })).toEqual({ uids: ['b'], points: 0, tied: false })
  })

  it('lets a negative score win when everyone is negative', () => {
    expect(seasonWinner(['a', 'b'], { a: -5, b: -12 })).toEqual({
      uids: ['a'],
      points: -5,
      tied: false,
    })
  })

  it('has nobody to celebrate with no members', () => {
    expect(seasonWinner([], {})).toBeNull()
  })
})
