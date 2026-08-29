import { describe, it, expect } from 'vitest'
import {
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
    expect(draftToRule(draft({ name: '  Wins immunity  ', points: '5' }))).toEqual({
      type: 'binary',
      name: 'Wins immunity',
      points: 5,
    })
  })

  it('parses a negative point value', () => {
    expect(draftToRule(draft({ points: '-3' })).points).toBe(-3)
  })
})

describe('ruleToDraft', () => {
  it('round-trips a rule through editing unchanged', () => {
    const rule = draftToRule(draft())
    expect(draftToRule(ruleToDraft(rule))).toEqual(rule)
  })

  it('renders the points back as text for the form', () => {
    expect(ruleToDraft({ type: 'binary', name: 'x', points: -1 })).toEqual({
      name: 'x',
      points: '-1',
    })
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
