import { describe, it, expect } from 'vitest'
import {
  DEFAULT_DRAFT_SETTINGS,
  NO_CARRY_OVER_ANSWERS,
  carriedDraftSettings,
  carriedMember,
  carriedRule,
  carriedTeam,
  carryOverAnswered,
  carryOverSource,
  copies,
  orderedParticipants,
} from './seasonCarryOver'
import type { ScoringRuleDoc, SeasonMemberDoc, SeasonState } from './types'

function season(id: string, state: SeasonState, createdAt: number) {
  return { id, label: `The Traitors — ${id}`, state, createdAt }
}

function member(overrides: Partial<SeasonMemberDoc> = {}): SeasonMemberDoc {
  return {
    uid: 'u1',
    displayName: 'Ada Owner',
    teamName: "Ada's Faithful",
    pickPosition: 3,
    joinedAt: 100,
    ...overrides,
  }
}

function rule(overrides: Partial<ScoringRuleDoc> = {}): ScoringRuleDoc {
  return { type: 'binary', name: 'Survives a banishment', points: 5, ...overrides }
}

describe('carryOverSource', () => {
  it('has nothing to copy from a league with no seasons', () => {
    expect(carryOverSource([])).toBeNull()
  })

  it('ignores a season that has not been played', () => {
    expect(carryOverSource([season('s1', 'setup', 1), season('s2', 'draft', 2)])).toBeNull()
  })

  it('takes the most recently created season that was played', () => {
    const source = carryOverSource([
      season('s1', 'complete', 1),
      season('s2', 'active', 3),
      season('s3', 'setup', 9),
    ])
    expect(source?.id).toBe('s2')
  })

  it('breaks a tie on id rather than on the order it was handed', () => {
    const seasons = [season('s1', 'complete', 5), season('s2', 'active', 5)]
    expect(carryOverSource(seasons)?.id).toBe('s2')
    expect(carryOverSource([...seasons].reverse())?.id).toBe('s2')
  })
})

describe('carryOverAnswered', () => {
  it('is unanswered until all three questions have an answer', () => {
    expect(carryOverAnswered(NO_CARRY_OVER_ANSWERS)).toBe(false)
    expect(
      carryOverAnswered({ participants: 'yes', scoringRules: 'no', draftSettings: null })
    ).toBe(false)
    expect(
      carryOverAnswered({ participants: 'yes', scoringRules: 'no', draftSettings: 'no' })
    ).toBe(true)
  })

  it('reads "no" as not copying', () => {
    const answers = { participants: 'yes', scoringRules: 'no', draftSettings: null } as const
    expect(copies(answers, 'participants')).toBe(true)
    expect(copies(answers, 'scoringRules')).toBe(false)
    expect(copies(answers, 'draftSettings')).toBe(false)
  })
})

describe('carriedDraftSettings', () => {
  it('takes the four settings and nothing else from the season', () => {
    const settings = carriedDraftSettings({
      draftFormat: 'snake',
      pickOrderMethod: 'randomized',
      timerSeconds: 90,
      timerExpiry: 'skip',
      // A field the new season has to work out for itself, offered anyway.
      adminPickOrder: ['u1', 'u2'],
    } as Parameters<typeof carriedDraftSettings>[0])

    expect(settings).toEqual({
      draftFormat: 'snake',
      pickOrderMethod: 'randomized',
      timerSeconds: 90,
      timerExpiry: 'skip',
    })
  })

  it('carries team mode and the number of teams, when the mode was on', () => {
    const settings = carriedDraftSettings({
      draftFormat: 'snake',
      pickOrderMethod: 'admin-set',
      timerSeconds: 60,
      timerExpiry: 'auto-pick',
      teamMode: true,
      teamCount: 3,
    })
    expect(settings).toMatchObject({ teamMode: true, teamCount: 3 })
  })

  it('carries neither team field when the mode was off — as a season from before teams', () => {
    // A season that was set to teams and then back keeps a dormant teamCount;
    // it is not a setting the new season should wake up with.
    const settings = carriedDraftSettings({
      draftFormat: 'snake',
      pickOrderMethod: 'admin-set',
      timerSeconds: 60,
      timerExpiry: 'auto-pick',
      teamMode: false,
      teamCount: 3,
    })
    expect(settings).not.toHaveProperty('teamMode')
    expect(settings).not.toHaveProperty('teamCount')
  })

  it('differs from the defaults a season is created with otherwise', () => {
    expect(DEFAULT_DRAFT_SETTINGS).toEqual({
      draftFormat: 'snake',
      pickOrderMethod: 'admin-set',
      timerSeconds: 60,
      timerExpiry: 'auto-pick',
    })
  })
})

describe('carriedMember', () => {
  it('keeps who they are and what their team is called', () => {
    expect(carriedMember(member({ photoUrl: 'https://example.test/ada.png' }), 500)).toEqual({
      uid: 'u1',
      displayName: 'Ada Owner',
      photoUrl: 'https://example.test/ada.png',
      teamName: "Ada's Faithful",
      pickPosition: null,
      joinedAt: 500,
    })
  })

  it('drops the pick position and the colour, which the new season assigns', () => {
    const carried = carriedMember(member({ teamColor: 'emerald', pickPosition: 2 }), 500)
    expect(carried.pickPosition).toBeNull()
    expect(carried).not.toHaveProperty('teamColor')
  })

  it('leaves photoUrl out entirely when there is none — undefined is not a value Firestore takes', () => {
    expect(carriedMember(member(), 500)).not.toHaveProperty('photoUrl')
  })

  it('leaves the team behind unless asked, and brings it when asked', () => {
    expect(carriedMember(member({ teamId: 'team-2' }), 500)).not.toHaveProperty('teamId')
    expect(carriedMember(member({ teamId: 'team-2' }), 500, true).teamId).toBe('team-2')
    // Asked, but there was none to bring: no undefined field for Firestore.
    expect(carriedMember(member(), 500, true)).not.toHaveProperty('teamId')
  })
})

describe('carriedTeam', () => {
  const team = {
    number: 2,
    teamName: 'Castle Crashers',
    teamColor: 'rose' as const,
    pickPosition: 1,
    createdAt: 1,
  }

  it('keeps the number and the name with its players, and drops what the new season assigns', () => {
    expect(carriedTeam(team, 500, true)).toEqual({
      number: 2,
      teamName: 'Castle Crashers',
      pickPosition: null,
      createdAt: 500,
    })
  })

  it('goes back to the default name without its players — the name was theirs', () => {
    expect(carriedTeam(team, 500).teamName).toBe('Team 2')
  })
})

describe('carriedRule', () => {
  it('carries a rule that covers every episode as covering every episode', () => {
    expect(carriedRule(rule({ episodeNumbers: null }), 8).episodeNumbers).toBeNull()
  })

  it('treats a rule written before episode numbers existed as covering them all', () => {
    expect(carriedRule(rule(), 8).episodeNumbers).toBeNull()
  })

  it('keeps a partial selection the new season can still hold', () => {
    expect(carriedRule(rule({ episodeNumbers: [2, 5] }), 8).episodeNumbers).toEqual([2, 5])
  })

  it('drops episodes the new season does not have', () => {
    expect(carriedRule(rule({ episodeNumbers: [1, 5, 12] }), 6).episodeNumbers).toEqual([1, 5])
  })

  it('becomes "every episode" when the narrowed selection covers the new season', () => {
    expect(carriedRule(rule({ episodeNumbers: [1, 2, 3, 4] }), 3).episodeNumbers).toBeNull()
  })

  it('scores nowhere rather than everywhere when nothing survives the narrowing', () => {
    expect(carriedRule(rule({ name: 'Wins the final', episodeNumbers: [12] }), 6)).toEqual({
      type: 'binary',
      name: 'Wins the final',
      points: 5,
      episodeNumbers: [],
    })
  })

  it('carries the type, so a count rule does not arrive as a tick box', () => {
    expect(carriedRule(rule({ type: 'number' }), 8).type).toBe('number')
  })

  it('carries the name and the points untouched, penalties included', () => {
    expect(carriedRule(rule({ name: 'Voted out', points: -3 }), 4)).toMatchObject({
      name: 'Voted out',
      points: -3,
    })
  })
})

describe('orderedParticipants', () => {
  it('lists people by name, however the roster came back', () => {
    const names = orderedParticipants([
      { displayName: 'mia requester' },
      { displayName: 'Ada Owner' },
      { displayName: 'Bob Member' },
    ]).map((m) => m.displayName)
    expect(names).toEqual(['Ada Owner', 'Bob Member', 'mia requester'])
  })

  it("leaves the caller's array alone", () => {
    const members = [{ displayName: 'Bob Member' }, { displayName: 'Ada Owner' }]
    orderedParticipants(members)
    expect(members[0].displayName).toBe('Bob Member')
  })
})
