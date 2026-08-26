import { describe, it, expect } from 'vitest'
import {
  parseEpisodeNumbers,
  validateRuleDraft,
  draftToRule,
  ruleToDraft,
  rulesAreEditable,
  emptyRuleDraft,
  type RuleDraft,
} from './scoringRules'

const draft = (over: Partial<RuleDraft> = {}): RuleDraft => ({
  ...emptyRuleDraft,
  name: 'Wins immunity',
  points: '5',
  ...over,
})

describe('parseEpisodeNumbers', () => {
  it('reads a comma-separated list', () => {
    expect(parseEpisodeNumbers('1, 4, 9')).toEqual([1, 4, 9])
  })

  it('ignores empty entries from stray commas', () => {
    expect(parseEpisodeNumbers('1, ,3,')).toEqual([1, 3])
  })

  it('reports a typo rather than dropping it', () => {
    // The old implementation filtered falsy values, so "4x" vanished and the
    // rule silently covered fewer episodes than the admin typed.
    const parsed = parseEpisodeNumbers('1, 4x, 9')
    expect(parsed).toHaveLength(3)
    expect(Number.isNaN(parsed[1])).toBe(true)
  })

  it('is empty for an empty string', () => {
    expect(parseEpisodeNumbers('')).toEqual([])
    expect(parseEpisodeNumbers('  ')).toEqual([])
  })
})

describe('validateRuleDraft', () => {
  it('accepts a plain binary rule', () => {
    expect(validateRuleDraft(draft(), 10)).toBeNull()
  })

  it('requires a name', () => {
    expect(validateRuleDraft(draft({ name: '   ' }), 10)).toBe('name-required')
  })

  it('requires points to be a number', () => {
    expect(validateRuleDraft(draft({ points: '' }), 10)).toBe('points-not-a-number')
    expect(validateRuleDraft(draft({ points: 'lots' }), 10)).toBe('points-not-a-number')
  })

  it('allows negative and fractional points', () => {
    expect(validateRuleDraft(draft({ points: '-2.5' }), 10)).toBeNull()
  })

  it('allows a zero-point rule', () => {
    expect(validateRuleDraft(draft({ points: '0' }), 10)).toBeNull()
  })

  it('wants a scope on a bonus challenge', () => {
    expect(validateRuleDraft(draft({ type: 'bonus_challenge' }), 10)).toBe('scope-required')
  })

  it('wants episodes when the scope is specific episodes', () => {
    const d = draft({ type: 'bonus_challenge', scope: 'specific_episodes' })
    expect(validateRuleDraft(d, 10)).toBe('episodes-required')
  })

  it('refuses an episode the season does not have', () => {
    const d = draft({
      type: 'bonus_challenge',
      scope: 'specific_episodes',
      episodeNumbers: '3, 12',
    })
    expect(validateRuleDraft(d, 10)).toBe('episodes-out-of-range')
  })

  it('refuses a mistyped episode number', () => {
    const d = draft({ type: 'bonus_challenge', scope: 'specific_episodes', episodeNumbers: '4x' })
    expect(validateRuleDraft(d, 10)).toBe('episodes-out-of-range')
  })

  it('ignores scope entirely for non-bonus rules', () => {
    expect(validateRuleDraft(draft({ type: 'numeric', scope: null }), 10)).toBeNull()
  })
})

describe('draftToRule', () => {
  it('trims the name and parses the points', () => {
    expect(draftToRule(draft({ name: '  Wins immunity  ', points: '5' }))).toMatchObject({
      name: 'Wins immunity',
      points: 5,
    })
  })

  it('drops scope and episodes on a rule that is not a bonus challenge', () => {
    const rule = draftToRule(
      draft({ type: 'binary', scope: 'specific_episodes', episodeNumbers: '1,2' })
    )
    expect(rule.scope).toBeNull()
    expect(rule.episodeNumbers).toBeNull()
  })

  it('keeps episodes only when the scope asks for them', () => {
    const specific = draftToRule(
      draft({ type: 'bonus_challenge', scope: 'specific_episodes', episodeNumbers: '2, 5' })
    )
    expect(specific.episodeNumbers).toEqual([2, 5])

    const seasonLevel = draftToRule(
      draft({ type: 'bonus_challenge', scope: 'season_level', episodeNumbers: '2, 5' })
    )
    expect(seasonLevel.episodeNumbers).toBeNull()
  })
})

describe('ruleToDraft', () => {
  it('round-trips a rule through editing unchanged', () => {
    const rule = draftToRule(
      draft({ type: 'bonus_challenge', scope: 'specific_episodes', episodeNumbers: '2, 5' })
    )
    expect(draftToRule(ruleToDraft(rule))).toEqual(rule)
  })

  it('shows an absent episode list as empty text', () => {
    expect(
      ruleToDraft({ type: 'binary', name: 'x', points: 1, scope: null, episodeNumbers: null })
    ).toMatchObject({ episodeNumbers: '' })
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
