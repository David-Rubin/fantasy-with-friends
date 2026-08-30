import { describe, it, expect } from 'vitest'
import {
  allEpisodeNumbers,
  diffRuleSets,
  fingerprintOf,
  rulesFingerprint,
  validateRuleDraft,
  draftToRule,
  ruleCoversEpisode,
  ruleToDraft,
  emptyRuleDraft,
  type RuleDraft,
} from './scoringRules'

/** Every test season here runs five episodes unless it says otherwise. */
const EPISODES = 5

const draft = (over: Partial<RuleDraft> = {}): RuleDraft => ({
  ...emptyRuleDraft(EPISODES),
  name: 'Wins immunity',
  points: '5',
  ...over,
})

describe('validateRuleDraft', () => {
  it('accepts a plain rule', () => {
    expect(validateRuleDraft(draft())).toBeNull()
  })

  it('requires a name', () => {
    expect(validateRuleDraft(draft({ name: '   ' }))).toBe('name-required')
  })

  it('requires points to be a number', () => {
    expect(validateRuleDraft(draft({ points: '' }))).toBe('points-not-a-whole-number')
    expect(validateRuleDraft(draft({ points: 'lots' }))).toBe('points-not-a-whole-number')
  })

  it('refuses a decimal', () => {
    expect(validateRuleDraft(draft({ points: '2.5' }))).toBe('points-not-a-whole-number')
    expect(validateRuleDraft(draft({ points: '-2.5' }))).toBe('points-not-a-whole-number')
  })

  it('refuses a number with anything else attached', () => {
    // parseFloat would read this as 5 and store a rule nobody typed.
    expect(validateRuleDraft(draft({ points: '5 points' }))).toBe('points-not-a-whole-number')
  })

  it('allows negative points, for a penalty', () => {
    expect(validateRuleDraft(draft({ points: '-2' }))).toBeNull()
  })

  it('wants at least one episode', () => {
    expect(validateRuleDraft(draft({ episodeNumbers: [] }))).toBe('episodes-required')
  })

  it('is happy with a single episode', () => {
    expect(validateRuleDraft(draft({ episodeNumbers: [3] }))).toBeNull()
  })

  it('refuses a zero-point rule', () => {
    expect(validateRuleDraft(draft({ points: '0' }))).toBe('points-zero')
    expect(validateRuleDraft(draft({ points: '-0' }))).toBe('points-zero')
  })

  it('ignores surrounding whitespace', () => {
    expect(validateRuleDraft(draft({ points: '  -3  ' }))).toBeNull()
  })
})

describe('draftToRule', () => {
  it('trims the name and parses the points', () => {
    expect(draftToRule(draft({ name: '  Wins immunity  ', points: '5' }), EPISODES)).toEqual({
      type: 'binary',
      name: 'Wins immunity',
      points: 5,
      episodeNumbers: null,
    })
  })

  it('parses a negative point value', () => {
    expect(draftToRule(draft({ points: '-3' }), EPISODES).points).toBe(-3)
  })

  it('stores a whole-season selection as null, so it follows the season', () => {
    const rule = draftToRule(draft({ episodeNumbers: [1, 2, 3, 4, 5] }), EPISODES)
    expect(rule.episodeNumbers).toBeNull()
    // The point of the sentinel: the same rule still covers a sixth episode.
    expect(ruleCoversEpisode(rule, 6)).toBe(true)
  })

  it('stores a partial selection as written', () => {
    expect(draftToRule(draft({ episodeNumbers: [4, 2] }), EPISODES).episodeNumbers).toEqual([2, 4])
  })

  it('drops duplicates', () => {
    expect(draftToRule(draft({ episodeNumbers: [2, 2, 4] }), EPISODES).episodeNumbers).toEqual([
      2, 4,
    ])
  })
})

describe('ruleToDraft', () => {
  it('round-trips a rule through editing unchanged', () => {
    const rule = draftToRule(draft(), EPISODES)
    expect(draftToRule(ruleToDraft(rule, EPISODES), EPISODES)).toEqual(rule)
  })

  it('round-trips a partial selection unchanged', () => {
    const rule = draftToRule(draft({ episodeNumbers: [2, 5] }), EPISODES)
    expect(draftToRule(ruleToDraft(rule, EPISODES), EPISODES)).toEqual(rule)
  })

  it('renders the points back as text for the form', () => {
    expect(
      ruleToDraft({ type: 'binary', name: 'x', points: -1, episodeNumbers: null }, EPISODES)
    ).toEqual({
      name: 'x',
      points: '-1',
      episodeNumbers: [1, 2, 3, 4, 5],
    })
  })

  it('ticks every episode for a rule that covers the season', () => {
    const d = ruleToDraft({ type: 'binary', name: 'x', points: 1, episodeNumbers: null }, 3)
    expect(d.episodeNumbers).toEqual([1, 2, 3])
  })

  it('ticks every episode for a rule written before the field existed', () => {
    const d = ruleToDraft({ type: 'binary', name: 'x', points: 1 }, 3)
    expect(d.episodeNumbers).toEqual([1, 2, 3])
  })

  it('drops episodes the season no longer has', () => {
    // The count was lowered after the rule was written.
    const d = ruleToDraft({ type: 'binary', name: 'x', points: 1, episodeNumbers: [2, 9] }, 3)
    expect(d.episodeNumbers).toEqual([2])
  })
})

describe('allEpisodeNumbers', () => {
  it('counts from one', () => {
    expect(allEpisodeNumbers(3)).toEqual([1, 2, 3])
  })

  it('is empty for a season with no episodes', () => {
    expect(allEpisodeNumbers(0)).toEqual([])
    expect(allEpisodeNumbers(-1)).toEqual([])
    expect(allEpisodeNumbers(NaN)).toEqual([])
  })
})

describe('ruleCoversEpisode', () => {
  it('covers everything when the list is null', () => {
    expect(ruleCoversEpisode({ episodeNumbers: null }, 1)).toBe(true)
    expect(ruleCoversEpisode({ episodeNumbers: null }, 99)).toBe(true)
  })

  it('covers everything when the field is absent, as on older rules', () => {
    expect(ruleCoversEpisode({}, 4)).toBe(true)
  })

  it('covers only the episodes listed', () => {
    expect(ruleCoversEpisode({ episodeNumbers: [2, 5] }, 2)).toBe(true)
    expect(ruleCoversEpisode({ episodeNumbers: [2, 5] }, 3)).toBe(false)
  })

  it('covers nothing when the list is empty', () => {
    expect(ruleCoversEpisode({ episodeNumbers: [] }, 1)).toBe(false)
  })
})

const rule = (id: string, points: number, episodeNumbers: number[] | null = null) => ({
  id,
  type: 'binary' as const,
  name: `Rule ${id}`,
  points,
  episodeNumbers,
})

describe('rulesFingerprint', () => {
  it('is stable however the rules are ordered', () => {
    const a = [rule('r1', 3), rule('r2', 5)]
    const b = [rule('r2', 5), rule('r1', 3)]
    expect(rulesFingerprint(a, 1)).toBe(rulesFingerprint(b, 1))
  })

  it('changes when a point value changes', () => {
    expect(rulesFingerprint([rule('r1', 3)], 1)).not.toBe(rulesFingerprint([rule('r1', 4)], 1))
  })

  it('does not change when a rule is only renamed', () => {
    // A name is what the column says, not what it is worth.
    const renamed = { ...rule('r1', 3), name: 'Something else' }
    expect(rulesFingerprint([renamed], 1)).toBe(rulesFingerprint([rule('r1', 3)], 1))
  })

  it('changes when a rule stops covering the episode', () => {
    expect(rulesFingerprint([rule('r1', 3, [1, 2])], 1)).not.toBe(
      rulesFingerprint([rule('r1', 3, [2])], 1)
    )
  })

  it('ignores rules that never covered the episode', () => {
    const withFinaleRule = [rule('r1', 3), rule('r2', 9, [10])]
    expect(rulesFingerprint(withFinaleRule, 1)).toBe(rulesFingerprint([rule('r1', 3)], 1))
  })

  it('changes when a rule is added or removed', () => {
    const one = rulesFingerprint([rule('r1', 3)], 1)
    expect(rulesFingerprint([rule('r1', 3), rule('r2', 1)], 1)).not.toBe(one)
    expect(rulesFingerprint([], 1)).not.toBe(one)
  })
})

describe('diffRuleSets', () => {
  const original = [rule('r1', 3), rule('r2', 5)]

  it('finds nothing to write when nothing changed', () => {
    const d = diffRuleSets(original, [...original])
    expect(d).toEqual({ added: [], updated: [], deleted: [] })
  })

  it('treats a rule with no id as new', () => {
    const d = diffRuleSets(original, [...original, { type: 'binary', name: 'New', points: 2 }])
    expect(d.added).toEqual([{ type: 'binary', name: 'New', points: 2 }])
    expect(d.updated).toHaveLength(0)
    expect(d.deleted).toHaveLength(0)
  })

  it('finds a changed point value', () => {
    const d = diffRuleSets(original, [{ ...rule('r1', 8) }, rule('r2', 5)])
    expect(d.updated.map((r) => [r.id, r.points])).toEqual([['r1', 8]])
  })

  it('finds a changed episode selection', () => {
    const d = diffRuleSets(original, [rule('r1', 3, [2]), rule('r2', 5)])
    expect(d.updated.map((r) => r.id)).toEqual(['r1'])
  })

  it('finds a rule that is gone', () => {
    const d = diffRuleSets(original, [rule('r1', 3)])
    expect(d.deleted.map((r) => r.id)).toEqual(['r2'])
  })

  it('never writes a rule added and removed before saving', () => {
    // It has no id, so there is no document to create or delete.
    const d = diffRuleSets(original, [...original])
    expect(d.added).toHaveLength(0)
    expect(d.deleted).toHaveLength(0)
  })
})

describe('fingerprintOf', () => {
  it('matches rulesFingerprint for the same set', () => {
    // A stored snapshot carries no episode numbers, having already been
    // narrowed to one episode — the two must still agree.
    const live = [rule('r1', 3), rule('r2', 5, [1])]
    const snapshot = [
      { id: 'r1', name: 'Rule r1', points: 3 },
      { id: 'r2', name: 'Rule r2', points: 5 },
    ]
    expect(fingerprintOf(snapshot)).toBe(rulesFingerprint(live, 1))
  })

  it('ignores a rename, and notices a new point value', () => {
    const base = [{ id: 'r1', name: 'Original', points: 3 }]
    expect(fingerprintOf([{ id: 'r1', name: 'Renamed', points: 3 }])).toBe(fingerprintOf(base))
    expect(fingerprintOf([{ id: 'r1', name: 'Original', points: 4 }])).not.toBe(fingerprintOf(base))
  })
})
