import { describe, it, expect } from 'vitest'
import { evaluateRule, calcContestantTotal, calcTeamTotal, calcTeamEpisodeTotals } from './scoring'
import type { ScoringRuleDoc, ContestantScoreDoc, SeasonAwardDoc } from './types'

const binaryRule: ScoringRuleDoc & { id: string } = {
  id: 'r1',
  type: 'binary',
  name: 'Star Baker',
  points: 3,
  scope: null,
  episodeNumbers: null,
}

const numericRule: ScoringRuleDoc & { id: string } = {
  id: 'r2',
  type: 'numeric',
  name: 'Performance',
  points: 1,
  scope: null,
  episodeNumbers: null,
}

const bonusRule: ScoringRuleDoc & { id: string } = {
  id: 'r3',
  type: 'bonus_challenge',
  name: 'Technical win',
  points: 2,
  scope: 'per_episode',
  episodeNumbers: null,
}

describe('evaluateRule', () => {
  it('binary: true scores full points', () => {
    expect(evaluateRule(binaryRule, { r1: true }, 'c1')).toBe(3)
  })

  it('binary: false scores 0', () => {
    expect(evaluateRule(binaryRule, { r1: false }, 'c1')).toBe(0)
  })

  it('numeric: multiplies value by points', () => {
    expect(evaluateRule(numericRule, { r2: 4 }, 'c1')).toBe(4)
  })

  it('numeric: missing value scores 0', () => {
    expect(evaluateRule(numericRule, {}, 'c1')).toBe(0)
  })

  it('bonus_challenge: matching contestant id scores points', () => {
    expect(evaluateRule(bonusRule, { r3: 'c1' }, 'c1')).toBe(2)
  })

  it('bonus_challenge: non-matching id scores 0', () => {
    expect(evaluateRule(bonusRule, { r3: 'c2' }, 'c1')).toBe(0)
  })

  it('negative points deduct correctly', () => {
    const negRule: ScoringRuleDoc & { id: string } = { ...binaryRule, id: 'neg', points: -1 }
    expect(evaluateRule(negRule, { neg: true }, 'c1')).toBe(-1)
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
  const awards: SeasonAwardDoc[] = [
    { ruleId: 'award1', contestantId: 'c1', awardedAt: 0, awardedBy: 'admin' },
  ]
  const awardRules = [
    {
      ...binaryRule,
      id: 'award1',
      points: 10,
      type: 'bonus_challenge' as const,
      scope: 'season_level' as const,
    },
  ]

  it('sums episode points for team members', () => {
    expect(calcTeamTotal(['c1', 'c2'], episodes, [], [])).toBe(8)
  })

  it('adds season award points', () => {
    expect(calcTeamTotal(['c1'], episodes, awards, awardRules)).toBe(15)
  })

  it('does not add award for non-team contestant', () => {
    expect(calcTeamTotal(['c2'], episodes, awards, awardRules)).toBe(3)
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
    const result = calcTeamEpisodeTotals(['c1'], episodes, [], [])
    expect(result['1']).toBe(4)
    expect(result['2']).toBe(10)
  })

  it('adds award points to last episode total', () => {
    const awards: SeasonAwardDoc[] = [
      { ruleId: 'a1', contestantId: 'c1', awardedAt: 0, awardedBy: 'u' },
    ]
    const awardRule = {
      ...binaryRule,
      id: 'a1',
      points: 5,
      type: 'bonus_challenge' as const,
      scope: 'season_level' as const,
    }
    const result = calcTeamEpisodeTotals(['c1'], episodes, awards, [awardRule])
    expect(result['2']).toBe(15)
  })
})
