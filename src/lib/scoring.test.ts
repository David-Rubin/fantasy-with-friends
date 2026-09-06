import { describe, it, expect } from 'vitest'
import {
  evaluateRule,
  scoredCount,
  isPenalty,
  calcContestantTotal,
  calcTeamTotal,
  calcTeamEpisodeTotals,
  latestEpisodePoints,
} from './scoring'
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

  it('scores a rule written before the type field existed as binary', () => {
    const untyped = { id: 'r1', name: 'Star Baker', points: 3 } as ScoringRuleDoc & { id: string }
    expect(evaluateRule(untyped, { r1: true })).toBe(3)
  })
})

const countRule: ScoringRuleDoc & { id: string } = {
  id: 'r1',
  type: 'number',
  name: 'Votes received',
  points: 2,
}

describe('evaluateRule for a count rule', () => {
  it('pays its points once per occurrence', () => {
    expect(evaluateRule(countRule, { r1: 3 })).toBe(6)
  })

  it('is worth nothing at zero, and nothing when untouched', () => {
    expect(evaluateRule(countRule, { r1: 0 })).toBe(0)
    expect(evaluateRule(countRule, {})).toBe(0)
  })

  it('deducts once per occurrence when the rule is a penalty', () => {
    expect(evaluateRule({ ...countRule, points: -3 }, { r1: 4 })).toBe(-12)
  })

  it('refuses to invent points from a count no input could produce', () => {
    // Only reachable by editing the document by hand.
    expect(evaluateRule({ ...countRule, points: -3 }, { r1: -2 })).toBe(0)
    expect(evaluateRule(countRule, { r1: 2.7 })).toBe(4)
    expect(evaluateRule(countRule, { r1: NaN })).toBe(0)
  })
})

describe('scoredCount when a rule changes type under stored scores', () => {
  // Nothing rewrites a scored episode when an admin changes a dropdown, so both
  // stored shapes have to mean something sensible under either kind of rule.
  it('reads a tick under a rule that has become a count as one occurrence', () => {
    expect(scoredCount(countRule, { r1: true })).toBe(1)
    expect(evaluateRule(countRule, { r1: true })).toBe(2)
  })

  it('reads a count under a rule that has gone back to binary as whether it happened', () => {
    expect(scoredCount(binaryRule, { r1: 4 })).toBe(1)
    expect(evaluateRule(binaryRule, { r1: 4 })).toBe(3)
    expect(scoredCount(binaryRule, { r1: 0 })).toBe(0)
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

describe('latestEpisodePoints', () => {
  const ep = (episodeNumber: number, points: Record<string, number>) => ({
    episodeNumber,
    scores: Object.fromEntries(
      Object.entries(points).map(([cid, totalPoints]) => [cid, { scores: {}, totalPoints }])
    ) as Record<string, ContestantScoreDoc>,
  })

  it('reads the highest-numbered episode, not the last one listed', () => {
    // A listener hands these over in whatever order Firestore chose.
    const docs = [ep(3, { c1: 7 }), ep(1, { c1: 2 }), ep(2, { c1: 5 })]
    expect(latestEpisodePoints(docs, 'c1')).toBe(7)
  })

  it('is null when nothing has been scored', () => {
    expect(latestEpisodePoints([], 'c1')).toBeNull()
  })

  it('is zero for a contestant who scored nothing in that episode', () => {
    // Distinct from null: the episode happened, they just earned nothing.
    expect(latestEpisodePoints([ep(1, { c2: 4 })], 'c1')).toBe(0)
  })

  it('counts a negative score', () => {
    expect(latestEpisodePoints([ep(1, { c1: -2 })], 'c1')).toBe(-2)
  })
})

describe('isPenalty', () => {
  it('is true of a rule that takes points away', () => {
    expect(isPenalty(-5)).toBe(true)
    expect(isPenalty(-1)).toBe(true)
  })

  it('is false of a rule that awards them', () => {
    expect(isPenalty(5)).toBe(false)
  })

  // Strange to have written, but it is not a punishment — so it draws as the
  // ordinary mark rather than the penalty cross.
  it('is false of a rule worth nothing', () => {
    expect(isPenalty(0)).toBe(false)
  })
})
