import { describe, it, expect } from 'vitest'
import { TEAM_COLORS, isTeamColor, pickTeamColor, takenBy } from './teamColor'

describe('isTeamColor', () => {
  it('accepts a colour from the palette', () => {
    expect(isTeamColor('sage')).toBe(true)
  })

  it('rejects anything else a client might send', () => {
    expect(isTeamColor('chartreuse')).toBe(false)
    // A name the palette used to have. Migrated away in the documents; not
    // something to start accepting again.
    expect(isTeamColor('teal')).toBe(false)
    expect(isTeamColor('')).toBe(false)
    expect(isTeamColor(undefined)).toBe(false)
    expect(isTeamColor(7)).toBe(false)
  })
})

describe('pickTeamColor', () => {
  it('never hands out a colour somebody already holds', () => {
    const taken = TEAM_COLORS.slice(0, 11)
    // Every draw, whatever the die says, has one answer left.
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(pickTeamColor(taken, () => roll)).toBe(TEAM_COLORS[11])
    }
  })

  it('chooses from the whole palette when nothing is taken', () => {
    expect(pickTeamColor([], () => 0)).toBe(TEAM_COLORS[0])
    expect(pickTeamColor([], () => 0.999)).toBe(TEAM_COLORS[TEAM_COLORS.length - 1])
  })

  it('ignores a colour nobody could be holding', () => {
    // A roster row carrying something outside the palette must not shrink the
    // set of colours left to give away.
    const picked = pickTeamColor(['chartreuse' as never], () => 0)
    expect(picked).toBe(TEAM_COLORS[0])
  })

  // Twelve colours and a thirteenth member: there is no unique answer to give,
  // and a team with no colour at all is worse than a repeated one.
  it('falls back to the least-used colour once every one is taken', () => {
    const taken = [...TEAM_COLORS, TEAM_COLORS[0]]
    const picked = pickTeamColor(taken, () => 0)
    expect(picked).toBe(TEAM_COLORS[1])
  })
})

describe('takenBy', () => {
  const roster = [
    { uid: 'ada', teamColor: 'sage' },
    { uid: 'bob', teamColor: 'rose' },
    { uid: 'mia' },
  ]

  it('names the member holding a colour', () => {
    expect(takenBy(roster, 'rose', 'ada')).toBe('bob')
  })

  it('says nothing is holding a free colour', () => {
    expect(takenBy(roster, 'amber', 'ada')).toBeNull()
  })

  it('does not count the asker against themselves', () => {
    expect(takenBy(roster, 'sage', 'ada')).toBeNull()
  })
})
