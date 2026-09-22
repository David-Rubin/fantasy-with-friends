import { describe, expect, it } from 'vitest'
import { hasAdminRole, hasOwnerRole, isLeagueAdmin } from './roles'

describe('hasAdminRole', () => {
  it('accepts an owner and an admin', () => {
    expect(hasAdminRole('owner')).toBe(true)
    expect(hasAdminRole('admin')).toBe(true)
  })

  it('rejects an ordinary member, and anyone with no role at all', () => {
    expect(hasAdminRole('member')).toBe(false)
    expect(hasAdminRole(null)).toBe(false)
    expect(hasAdminRole(undefined)).toBe(false)
  })
})

describe('hasOwnerRole', () => {
  it('is the owner alone — an admin is not one', () => {
    expect(hasOwnerRole('owner')).toBe(true)
    expect(hasOwnerRole('admin')).toBe(false)
    expect(hasOwnerRole(null)).toBe(false)
  })
})

describe('isLeagueAdmin', () => {
  it('takes either half', () => {
    expect(isLeagueAdmin('admin', false)).toBe(true)
    expect(isLeagueAdmin(null, true)).toBe(true)
    expect(isLeagueAdmin('member', true)).toBe(true)
  })

  it('is false for a member of the league who is nothing more', () => {
    expect(isLeagueAdmin('member', false)).toBe(false)
  })
})
