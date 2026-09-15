import { describe, it, expect } from 'vitest'
import { entryByKey, entryKeyFor, isTeamMode, seasonEntries, unassignedMembers } from './entries'
import type { SeasonMember, SeasonTeam } from './types'

/**
 * Imports ./entries rather than anything reaching ./firebase on purpose — see
 * ./seasonDetails.test.ts.
 */

const member = (uid: string, teamId?: string): SeasonMember => ({
  uid,
  displayName: `${uid} Person`,
  teamName: `${uid}'s Team`,
  teamColor: 'sage',
  pickPosition: null,
  joinedAt: 0,
  ...(teamId ? { teamId } : {}),
})

const team = (n: number, teamName = `Team ${n}`): SeasonTeam => ({
  id: `team-${n}`,
  number: n,
  teamName,
  teamColor: 'rose',
  pickPosition: null,
  createdAt: 0,
})

describe('isTeamMode', () => {
  // Every season created before teams existed carries no flag at all, and
  // has to keep working exactly as it did.
  it('is off unless the flag is exactly true', () => {
    expect(isTeamMode({})).toBe(false)
    expect(isTeamMode({ teamMode: false })).toBe(false)
    expect(isTeamMode(null)).toBe(false)
    expect(isTeamMode(undefined)).toBe(false)
    expect(isTeamMode({ teamMode: true })).toBe(true)
  })
})

describe('seasonEntries', () => {
  it('makes every member an entry keyed by uid in a solo season', () => {
    const ada = member('ada')
    const bob = member('bob')
    const entries = seasonEntries({}, [ada, bob], [team(1)])
    expect(entries.map((e) => e.key)).toEqual(['ada', 'bob'])
    expect(entries[0]).toMatchObject({
      teamName: "ada's Team",
      teamColor: 'sage',
      label: 'ada Person',
      players: [ada],
    })
  })

  it('makes every team an entry keyed by team id in team mode, by number', () => {
    const ada = member('ada', 'team-2')
    const bob = member('bob', 'team-1')
    const mia = member('mia', 'team-2')
    const entries = seasonEntries({ teamMode: true }, [ada, bob, mia], [team(2), team(1)])
    expect(entries.map((e) => e.key)).toEqual(['team-1', 'team-2'])
    expect(entries[1]).toMatchObject({ label: 'Team 2', teamColor: 'rose', players: [ada, mia] })
    expect(entries[0].players).toEqual([bob])
  })

  it('lists a team nobody is on yet, with no players', () => {
    const entries = seasonEntries({ teamMode: true }, [member('ada', 'team-1')], [team(1), team(2)])
    expect(entries[1].players).toEqual([])
  })

  it('leaves an unassigned member out of every entry', () => {
    const entries = seasonEntries({ teamMode: true }, [member('ada')], [team(1)])
    expect(entries[0].players).toEqual([])
  })

  it('ignores a stored teamId in a solo season', () => {
    // A season that was set to teams and then back keeps its dormant fields.
    const ada = member('ada', 'team-1')
    expect(seasonEntries({ teamMode: false }, [ada], [team(1)])[0]).toMatchObject({
      key: 'ada',
      players: [ada],
    })
  })
})

describe('entryKeyFor', () => {
  it('is the uid in a solo season', () => {
    expect(entryKeyFor({}, member('ada', 'team-1'))).toBe('ada')
  })

  it('is the team id in team mode', () => {
    expect(entryKeyFor({ teamMode: true }, member('ada', 'team-1'))).toBe('team-1')
  })

  it('is null for an unassigned member in team mode', () => {
    expect(entryKeyFor({ teamMode: true }, member('ada'))).toBeNull()
  })

  it('is null for nobody', () => {
    expect(entryKeyFor({}, undefined)).toBeNull()
    expect(entryKeyFor({ teamMode: true }, null)).toBeNull()
  })
})

describe('entryByKey', () => {
  const entries = seasonEntries({}, [member('ada'), member('bob')], [])

  it('finds an entry by its key', () => {
    expect(entryByKey(entries, 'bob')?.label).toBe('bob Person')
  })

  it('finds nothing for a missing or absent key', () => {
    expect(entryByKey(entries, 'mia')).toBeUndefined()
    expect(entryByKey(entries, null)).toBeUndefined()
    expect(entryByKey(entries, undefined)).toBeUndefined()
  })
})

describe('unassignedMembers', () => {
  it('is empty in a solo season, whatever the members carry', () => {
    expect(unassignedMembers({}, [member('ada'), member('bob', 'team-9')], [])).toEqual([])
  })

  it('lists members with no team, and members on a team that is gone', () => {
    const ada = member('ada')
    const bob = member('bob', 'team-1')
    const mia = member('mia', 'team-3')
    expect(unassignedMembers({ teamMode: true }, [ada, bob, mia], [team(1), team(2)])).toEqual([
      ada,
      mia,
    ])
  })
})
