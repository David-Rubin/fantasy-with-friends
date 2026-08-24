import { describe, it, expect } from 'vitest'
import { resolvePickOrder } from './draft'

// Turn order and completion are covered in functions/src/draft.test.ts, where
// the logic that actually decides them lives.

describe('resolvePickOrder', () => {
  it('admin-set returns provided order', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2', 'u3'], ['u3', 'u1', 'u2'])
    expect(result).toEqual(['u3', 'u1', 'u2'])
  })

  it('randomized returns all members in some order', () => {
    const members = ['u1', 'u2', 'u3', 'u4']
    const result = resolvePickOrder('randomized', members)
    expect(result.sort()).toEqual(members.sort())
    expect(result.length).toBe(4)
  })

  it('randomized with no admin order falls back to shuffle', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2'])
    expect(result.sort()).toEqual(['u1', 'u2'])
  })
})
