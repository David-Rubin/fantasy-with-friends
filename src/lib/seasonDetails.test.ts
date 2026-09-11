import { describe, it, expect } from 'vitest'
import {
  clampTimerSeconds,
  episodeCountProblem,
  highestScoredEpisode,
  openDraftProblem,
  TIMER_SECONDS_MAX,
  TIMER_SECONDS_MIN,
} from './seasonDetails'

/**
 * Season details are editable in every state, so the only thing standing
 * between an admin and a broken leaderboard is this check.
 *
 * These import ./seasonDetails rather than ./seasonApi on purpose — the latter
 * reaches ./firebase, which builds a Firebase app at import time and throws
 * without the VITE_FIREBASE_* variables that CI does not have.
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

describe('openDraftProblem', () => {
  it('opens with enough contestants, a rule, and room for every player', () => {
    expect(openDraftProblem(8, 1, 4)).toBeNull()
  })

  it('opens with exactly one contestant per player', () => {
    expect(openDraftProblem(4, 1, 4)).toBeNull()
  })

  it('refuses more players than contestants', () => {
    // Somebody's team would be empty before the first pick.
    expect(openDraftProblem(3, 1, 4)).toBe('more-players-than-contestants')
  })

  it('refuses fewer than two contestants, before anything else', () => {
    expect(openDraftProblem(1, 0, 3)).toBe('too-few-contestants')
  })

  it('refuses a season with no scoring rules', () => {
    expect(openDraftProblem(5, 0, 2)).toBe('no-rules')
  })
})

describe('clampTimerSeconds', () => {
  it('leaves a value inside the bounds alone', () => {
    expect(clampTimerSeconds(60)).toBe(60)
    expect(clampTimerSeconds(TIMER_SECONDS_MIN)).toBe(TIMER_SECONDS_MIN)
    expect(clampTimerSeconds(TIMER_SECONDS_MAX)).toBe(TIMER_SECONDS_MAX)
  })

  it('pulls a value below the floor up to it', () => {
    expect(clampTimerSeconds(1)).toBe(TIMER_SECONDS_MIN)
    expect(clampTimerSeconds(-30)).toBe(TIMER_SECONDS_MIN)
  })

  it('pulls a value above the ceiling down to it', () => {
    expect(clampTimerSeconds(9999)).toBe(TIMER_SECONDS_MAX)
  })

  it('rounds a fractional value', () => {
    expect(clampTimerSeconds(60.4)).toBe(60)
    expect(clampTimerSeconds(60.6)).toBe(61)
  })

  it('falls back to the floor for anything that is not a number', () => {
    expect(clampTimerSeconds(NaN)).toBe(TIMER_SECONDS_MIN)
    expect(clampTimerSeconds(Infinity)).toBe(TIMER_SECONDS_MIN)
  })
})
