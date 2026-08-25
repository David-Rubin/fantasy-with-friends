import { describe, it, expect } from 'vitest'
import { highestScoredEpisode, episodeCountProblem } from './seasonApi'

/**
 * Season details are editable in every state, so the only thing standing
 * between an admin and a broken leaderboard is this check.
 */

describe('highestScoredEpisode', () => {
  it('is zero when nothing has been scored', () => {
    expect(highestScoredEpisode([])).toBe(0)
  })

  it('reads the episodeScores document ids, which are strings', () => {
    expect(highestScoredEpisode(['1', '2', '7'])).toBe(7)
  })

  it('does not sort ids as text — 10 is past 9', () => {
    expect(highestScoredEpisode(['9', '10'])).toBe(10)
  })

  it('ignores ids that are not episode numbers', () => {
    expect(highestScoredEpisode(['3', 'draft', ''])).toBe(3)
  })
})

describe('episodeCountProblem', () => {
  it('accepts a count above everything scored', () => {
    expect(episodeCountProblem(12, ['1', '2'])).toBeNull()
  })

  it('accepts a count exactly at the last scored episode', () => {
    expect(episodeCountProblem(8, ['7', '8'])).toBeNull()
  })

  it('refuses a count that would strand scored episodes', () => {
    expect(episodeCountProblem(5, ['6'])).toBe('below-scored')
  })

  it('refuses a season with no episodes', () => {
    expect(episodeCountProblem(0, [])).toBe('too-few')
  })

  it('refuses a blank or non-numeric entry', () => {
    expect(episodeCountProblem(NaN, [])).toBe('not-a-number')
  })

  it('allows shrinking freely when nothing has been scored', () => {
    // The season state is irrelevant here — only real scores constrain it.
    expect(episodeCountProblem(2, [])).toBeNull()
  })
})
