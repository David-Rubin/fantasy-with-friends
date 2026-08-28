import { describe, it, expect } from 'vitest'
import { canJoinSeason } from './seasonMembership'
import type { SeasonState } from './types'

const base = {
  state: 'setup' as SeasonState,
  isLeagueMember: true,
  isSeasonMember: false,
  resolved: true,
}

describe('canJoinSeason', () => {
  it('lets a league member into a season still being set up', () => {
    expect(canJoinSeason(base)).toBe(true)
  })

  it('offers nothing to somebody already in the season', () => {
    expect(canJoinSeason({ ...base, isSeasonMember: true })).toBe(false)
  })

  it('offers nothing to somebody outside the league', () => {
    expect(canJoinSeason({ ...base, isLeagueMember: false })).toBe(false)
  })

  it('closes once the season has moved past setup', () => {
    // An admin who wants late arrivals reopens the draft, which returns the
    // season to setup and makes this true again.
    for (const state of ['draft', 'active', 'complete'] as SeasonState[]) {
      expect(canJoinSeason({ ...base, state })).toBe(false)
    }
  })

  it('stays silent until both memberships are known', () => {
    expect(canJoinSeason({ ...base, resolved: false })).toBe(false)
  })
})
