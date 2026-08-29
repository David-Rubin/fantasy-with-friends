import { describe, it, expect } from 'vitest'
import {
  allEpisodeNumbers,
  validateRuleDraft,
  draftToRule,
  ruleCoversEpisode,
  ruleToDraft,
  rulesAreEditable,
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

describe('rulesAreEditable', () => {
  it('is open until an episode has been scored', () => {
    expect(rulesAreEditable(null)).toBe(true)
    expect(rulesAreEditable(undefined)).toBe(true)
  })

  it('closes once the first episode is scored', () => {
    expect(rulesAreEditable(1735689600000)).toBe(false)
  })
})
