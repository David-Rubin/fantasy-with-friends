import { describe, it, expect } from 'vitest'
import { entryKeyFor, entryKeys, isTeamMode, teamAssignmentProblem } from './entries'
import { teamAssignmentProblem as clientTeamAssignmentProblem } from '../../src/lib/teamAssignment'
import { entryKeyFor as clientEntryKeyFor, seasonEntries } from '../../src/lib/entries'
import type { SeasonMember, SeasonTeam } from '../../src/lib/types'

/**
 * The server's copy of the entries logic, and its agreement with the client's.
 * The two trees cannot import each other, so the rules are written down twice;
 * if they drift, the setup panel enables a button startDraft then refuses, or
 * the draft room shows one player on the clock while the server waits for
 * another.
 */

const teams = [
  { id: 'team-2', number: 2 },
  { id: 'team-1', number: 1 },
]

describe('entryKeys', () => {
  it('is the member uids, in roster order, in a solo season', () => {
    expect(entryKeys({}, [{ uid: 'bob' }, { uid: 'ada' }], teams)).toEqual(['bob', 'ada'])
  })

  it('is the team ids, by number, in team mode', () => {
    expect(entryKeys({ teamMode: true }, [{ uid: 'ada', teamId: 'team-2' }], teams)).toEqual([
      'team-1',
      'team-2',
    ])
  })
})

describe('entryKeyFor', () => {
  it('is the uid in a solo season and the team id in team mode', () => {
    const ada = { uid: 'ada', teamId: 'team-2' }
    expect(entryKeyFor({}, ada, teams)).toBe('ada')
    expect(entryKeyFor({ teamMode: true }, ada, teams)).toBe('team-2')
  })

  it('is null for an unassigned member, a member of a vanished team, or nobody', () => {
    expect(entryKeyFor({ teamMode: true }, { uid: 'ada' }, teams)).toBeNull()
    expect(entryKeyFor({ teamMode: true }, { uid: 'ada', teamId: 'team-9' }, teams)).toBeNull()
    expect(entryKeyFor({ teamMode: true }, null, teams)).toBeNull()
  })
})

describe('agreement with the client', () => {
  const cases: { teamIds: string[]; members: { uid: string; teamId?: string }[] }[] = [
    { teamIds: [], members: [] },
    { teamIds: ['team-1'], members: [] },
    { teamIds: ['team-1', 'team-2'], members: [{ uid: 'a', teamId: 'team-1' }] },
    { teamIds: ['team-1', 'team-2'], members: [{ uid: 'a', teamId: 'team-1' }, { uid: 'b' }] },
    {
      teamIds: ['team-1', 'team-2'],
      members: [
        { uid: 'a', teamId: 'team-1' },
        { uid: 'b', teamId: 'team-2' },
        { uid: 'c', teamId: 'team-3' },
      ],
    },
    {
      teamIds: ['team-1', 'team-2'],
      members: [
        { uid: 'a', teamId: 'team-1' },
        { uid: 'b', teamId: 'team-2' },
        { uid: 'c', teamId: 'team-2' },
      ],
    },
  ]

  it('refuses and accepts the same layouts', () => {
    for (const { teamIds, members } of cases) {
      expect(teamAssignmentProblem(teamIds, members)).toBe(
        clientTeamAssignmentProblem(teamIds, members)
      )
    }
  })

  it('resolves the same entry key for a member', () => {
    const fullTeams: SeasonTeam[] = teams.map((t) => ({
      ...t,
      teamName: t.id,
      pickPosition: null,
      createdAt: 0,
    }))
    const members: SeasonMember[] = [
      {
        uid: 'ada',
        displayName: 'Ada',
        teamName: 'A',
        pickPosition: null,
        joinedAt: 0,
        teamId: 'team-2',
      },
      { uid: 'bob', displayName: 'Bob', teamName: 'B', pickPosition: null, joinedAt: 0 },
    ]
    for (const season of [{}, { teamMode: true }, { teamMode: false }]) {
      expect(isTeamMode(season)).toBe(seasonEntries(season, members, fullTeams)[0].key !== 'ada')
      for (const m of members) {
        expect(entryKeyFor(season, m, teams)).toBe(clientEntryKeyFor(season, m))
      }
      expect(entryKeys(season, members, teams)).toEqual(
        seasonEntries(season, members, fullTeams).map((e) => e.key)
      )
    }
  })
})
