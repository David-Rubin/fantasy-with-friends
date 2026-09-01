import { describe, it, expect } from 'vitest'
import { canJoinDraft, canJoinSeason } from './seasonMembership'
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

describe('canJoinDraft', () => {
  const base = {
    state: 'draft' as SeasonState,
    isSeasonMember: true,
    isSuperadmin: false,
    resolved: true,
  }

  it('offers the draft to a member of the season', () => {
    expect(canJoinDraft(base)).toBe(true)
  })

  it('offers it to a superadmin, who may read any season without joining it', () => {
    expect(canJoinDraft({ ...base, isSeasonMember: false, isSuperadmin: true })).toBe(true)
  })

  // The same refusal the season page gave: a league member who is not in this
  // season could reach neither the page nor the button on it.
  it('withholds it from someone who is not in the season', () => {
    expect(canJoinDraft({ ...base, isSeasonMember: false })).toBe(false)
  })

  it('withholds it from every season that is not drafting', () => {
    for (const state of ['setup', 'active', 'complete'] as SeasonState[]) {
      expect(canJoinDraft({ ...base, state })).toBe(false)
    }
  })

  // Otherwise the card flashes a draft button at a member while their
  // membership is still being read back.
  it('waits until membership is known', () => {
    expect(canJoinDraft({ ...base, resolved: false })).toBe(false)
  })
})
