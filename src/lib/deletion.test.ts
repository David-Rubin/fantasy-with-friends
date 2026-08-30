import { describe, it, expect } from 'vitest'
import { confirmationMatches } from './deletion'

describe('confirmationMatches', () => {
  it('matches the name typed exactly', () => {
    expect(confirmationMatches('Survivor Superfans', 'Survivor Superfans')).toBe(true)
  })

  it('forgives case', () => {
    expect(confirmationMatches('survivor superfans', 'Survivor Superfans')).toBe(true)
  })

  it('forgives surrounding whitespace', () => {
    expect(confirmationMatches('  Survivor Superfans \n', 'Survivor Superfans')).toBe(true)
  })

  it('keeps punctuation and em dashes significant', () => {
    const name = 'Traitors — Thursday Night Crew'
    expect(confirmationMatches(name, name)).toBe(true)
    expect(confirmationMatches('Traitors - Thursday Night Crew', name)).toBe(false)
    expect(confirmationMatches('Traitors Thursday Night Crew', name)).toBe(false)
  })

  it('rejects a prefix, so a half-typed name cannot delete anything', () => {
    expect(confirmationMatches('Survivor', 'Survivor Superfans')).toBe(false)
  })

  it('rejects trailing extra text', () => {
    expect(confirmationMatches('Survivor Superfans!', 'Survivor Superfans')).toBe(false)
  })

  it('rejects an empty box', () => {
    expect(confirmationMatches('', 'Survivor Superfans')).toBe(false)
    expect(confirmationMatches('   ', 'Survivor Superfans')).toBe(false)
  })

  it('never matches when there is no name to type', () => {
    expect(confirmationMatches('', '')).toBe(false)
    expect(confirmationMatches('anything', '   ')).toBe(false)
  })
})
