import { describe, it, expect } from 'vitest'
import { evaluateRule, calcContestantTotal, calcTeamTotal, calcTeamEpisodeTotals } from './scoring'
import type { ScoringRuleDoc, ContestantScoreDoc } from './types'

const binaryRule: ScoringRuleDoc & { id: string } = {
  id: 'r1',
  type: 'binary',
  name: 'Star Baker',
  points: 3,
}

describe('evaluateRule', () => {
  it('true scores full points', () => {
    expect(evaluateRule(binaryRule, { r1: true })).toBe(3)
  })

  it('false scores 0', () => {
    expect(evaluateRule(binaryRule, { r1: false })).toBe(0)
  })

  it('missing value scores 0', () => {
    expect(evaluateRule(binaryRule, {})).toBe(0)
  })

  it('negative points deduct correctly', () => {
    const negRule: ScoringRuleDoc & { id: string } = { ...binaryRule, id: 'neg', points: -1 }
    expect(evaluateRule(negRule, { neg: true })).toBe(-1)
  })
})

describe('calcContestantTotal', () => {
  it('sums totalPoints across episodes', () => {
    const eps = [
      {
        episodeNumber: 1,
        scores: { c1: { scores: {}, totalPoints: 5 } as ContestantScoreDoc },
        locked: true,
      },
      {
        episodeNumber: 2,
        scores: { c1: { scores: {}, totalPoints: 3 } as ContestantScoreDoc },
        locked: true,
      },
    ]
    expect(calcContestantTotal('c1', eps)).toBe(8)
  })

  it('returns 0 for contestant with no scores', () => {
    expect(calcContestantTotal('missing', [])).toBe(0)
  })
})

describe('calcTeamTotal', () => {
  const episodes = [
    {
      episodeNumber: 1,
      scores: {
        c1: { scores: {}, totalPoints: 5 } as ContestantScoreDoc,
        c2: { scores: {}, totalPoints: 3 } as ContestantScoreDoc,
      },
      locked: true,
    },
  ]

  it('sums episode points for team members', () => {
    expect(calcTeamTotal(['c1', 'c2'], episodes)).toBe(8)
  })

  it('counts only the contestants on the team', () => {
    expect(calcTeamTotal(['c2'], episodes)).toBe(3)
  })

  it('returns 0 for a team with nobody on it', () => {
    expect(calcTeamTotal([], episodes)).toBe(0)
  })
})

describe('calcTeamEpisodeTotals', () => {
  const episodes = [
    {
      episodeNumber: 1,
      scores: { c1: { scores: {}, totalPoints: 4 } as ContestantScoreDoc },
      locked: true,
    },
    {
      episodeNumber: 2,
      scores: { c1: { scores: {}, totalPoints: 6 } as ContestantScoreDoc },
      locked: true,
    },
  ]

  it('returns running cumulative totals per episode', () => {
    const result = calcTeamEpisodeTotals(['c1'], episodes)
    expect(result['1']).toBe(4)
    expect(result['2']).toBe(10)
  })

  it('accumulates in episode order regardless of input order', () => {
    const result = calcTeamEpisodeTotals(['c1'], [episodes[1], episodes[0]])
    expect(result['1']).toBe(4)
    expect(result['2']).toBe(10)
  })
})
