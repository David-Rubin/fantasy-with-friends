import { describe, it, expect } from 'vitest'
import { avatarInitial } from './initial'

describe('avatarInitial', () => {
  it('takes the first letter, capitalized', () => {
    expect(avatarInitial('Ada Owner')).toBe('A')
    expect(avatarInitial('bob member')).toBe('B')
  })

  it('ignores surrounding whitespace', () => {
    expect(avatarInitial('  mia  ')).toBe('M')
  })

  it('has nothing to show for an empty name', () => {
    expect(avatarInitial('')).toBe('')
    expect(avatarInitial('   ')).toBe('')
    expect(avatarInitial(null)).toBe('')
    expect(avatarInitial(undefined)).toBe('')
  })

  it('keeps a whole character when the first one is a surrogate pair', () => {
    // charAt would return half of the emoji and render a broken glyph.
    expect(avatarInitial('🎉 Party')).toBe('🎉')
  })

  it('leaves a script without capitals alone', () => {
    expect(avatarInitial('日本語')).toBe('日')
  })
})
