import { describe, it, expect } from 'vitest'
import { movePickOrder, reconcilePickOrder, resolvePickOrder } from './draft'

// Turn order and completion are covered in functions/src/draft.test.ts, where
// the logic that actually decides them lives.

describe('resolvePickOrder', () => {
  it('admin-set returns provided order', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2', 'u3'], ['u3', 'u1', 'u2'])
    expect(result).toEqual(['u3', 'u1', 'u2'])
  })

  it('admin-set squares the saved order with the roster it is drafting', () => {
    // u2 left and u4 joined after the order was arranged.
    const result = resolvePickOrder('admin-set', ['u1', 'u3', 'u4'], ['u3', 'u2', 'u1'])
    expect(result).toEqual(['u3', 'u1', 'u4'])
  })

  it('randomized returns all members in some order', () => {
    const members = ['u1', 'u2', 'u3', 'u4']
    const result = resolvePickOrder('randomized', members)
    expect(result.sort()).toEqual(members.sort())
    expect(result.length).toBe(4)
  })

  it('randomized ignores a saved admin order', () => {
    const result = resolvePickOrder('randomized', ['u1', 'u2'], ['u2', 'u1'])
    expect([...result].sort()).toEqual(['u1', 'u2'])
  })

  it('randomized with no admin order falls back to shuffle', () => {
    const result = resolvePickOrder('admin-set', ['u1', 'u2'])
    expect(result.sort()).toEqual(['u1', 'u2'])
  })
})

describe('reconcilePickOrder', () => {
  it('keeps the arrangement when nothing has changed', () => {
    expect(reconcilePickOrder(['u2', 'u1'], ['u1', 'u2'])).toEqual(['u2', 'u1'])
  })

  it('appends members who joined after the order was arranged', () => {
    expect(reconcilePickOrder(['u2', 'u1'], ['u1', 'u2', 'u3'])).toEqual(['u2', 'u1', 'u3'])
  })

  it('drops uids that are no longer on the roster', () => {
    expect(reconcilePickOrder(['u2', 'gone', 'u1'], ['u1', 'u2'])).toEqual(['u2', 'u1'])
  })

  it('never repeats a uid, however the saved list got that way', () => {
    expect(reconcilePickOrder(['u1', 'u1', 'u2'], ['u1', 'u2'])).toEqual(['u1', 'u2'])
  })

  it('is the roster itself when nothing was ever saved', () => {
    expect(reconcilePickOrder(undefined, ['u1', 'u2'])).toEqual(['u1', 'u2'])
    expect(reconcilePickOrder(null, ['u1', 'u2'])).toEqual(['u1', 'u2'])
  })
})

describe('movePickOrder', () => {
  const order = ['a', 'b', 'c', 'd']

  it('moves a row later', () => {
    expect(movePickOrder(order, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a row earlier', () => {
    expect(movePickOrder(order, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('returns the same array when the move goes nowhere', () => {
    expect(movePickOrder(order, 1, 1)).toBe(order)
    expect(movePickOrder(order, 0, -1)).toBe(order)
    expect(movePickOrder(order, 0, 4)).toBe(order)
  })
})
