import { describe, it, expect } from 'vitest'
import { documentTitle } from './documentTitle'

describe('documentTitle with tab-scoped sessions', () => {
  const scoped = (displayName?: string | null) =>
    documentTitle({ displayName, tabScopedAuth: true })

  it('names the signed-in user', () => {
    expect(scoped('Ada Owner')).toBe('Fantasy With Friends — Ada Owner')
  })

  it('is the bare app name with nobody signed in', () => {
    expect(scoped(null)).toBe('Fantasy With Friends')
    expect(scoped(undefined)).toBe('Fantasy With Friends')
  })

  it('does not leave a dangling separator for an empty name', () => {
    expect(scoped('')).toBe('Fantasy With Friends')
    expect(scoped('   ')).toBe('Fantasy With Friends')
  })

  it('trims a padded name rather than spacing it out', () => {
    expect(scoped('  Bob Member  ')).toBe('Fantasy With Friends — Bob Member')
  })
})

describe('documentTitle with one session per browser', () => {
  // Every tab holds the same user, so naming them says nothing a reader of the
  // tab strip does not already know.
  it('never names the user', () => {
    expect(documentTitle({ displayName: 'Ada Owner', tabScopedAuth: false })).toBe(
      'Fantasy With Friends'
    )
    expect(documentTitle({ displayName: null, tabScopedAuth: false })).toBe('Fantasy With Friends')
  })
})
