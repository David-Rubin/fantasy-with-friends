import { describe, it, expect } from 'vitest'
import {
  TEAM_COUNT_MAX,
  TEAM_COUNT_MIN,
  assignmentWrites,
  clampTeamCount,
  effectiveAssignments,
  teamAssignmentProblem,
  teamIdFor,
  teamIds,
  teamNumberOf,
} from './teamAssignment'

describe('clampTeamCount', () => {
  it('leaves a value inside the bounds alone', () => {
    expect(clampTeamCount(4)).toBe(4)
  })

  it('brings a value outside them to the nearer bound', () => {
    expect(clampTeamCount(0)).toBe(TEAM_COUNT_MIN)
    expect(clampTeamCount(1)).toBe(TEAM_COUNT_MIN)
    expect(clampTeamCount(999)).toBe(TEAM_COUNT_MAX)
  })

  it('treats an unparseable value as the minimum', () => {
    expect(clampTeamCount(NaN)).toBe(TEAM_COUNT_MIN)
  })

  it('rounds', () => {
    expect(clampTeamCount(3.6)).toBe(4)
  })
})

describe('team ids', () => {
  it('names the n-th team team-n', () => {
    expect(teamIdFor(3)).toBe('team-3')
    expect(teamIds(3)).toEqual(['team-1', 'team-2', 'team-3'])
    expect(teamIds(0)).toEqual([])
  })

  it('reads the number back, and nothing from anything else', () => {
    expect(teamNumberOf('team-12')).toBe(12)
    expect(teamNumberOf('ada')).toBeNull()
    expect(teamNumberOf('team-')).toBeNull()
  })
})

describe('effectiveAssignments', () => {
  const members = [
    { uid: 'ada', teamId: 'team-1' },
    { uid: 'bob', teamId: 'team-2' },
    { uid: 'mia' },
  ]

  it('is what the roster records when nothing has been dragged', () => {
    expect(effectiveAssignments(members, {}, 2)).toEqual({
      ada: 'team-1',
      bob: 'team-2',
      mia: null,
    })
  })

  it('lets an unsaved drag win over the record, including a drag out', () => {
    expect(effectiveAssignments(members, { mia: 'team-1', ada: null }, 2)).toEqual({
      ada: null,
      bob: 'team-2',
      mia: 'team-1',
    })
  })

  it('unassigns anyone on a team past the count', () => {
    // The admin lowered the number: Team 2 is about to be deleted.
    expect(effectiveAssignments(members, { mia: 'team-2' }, 1)).toEqual({
      ada: 'team-1',
      bob: null,
      mia: null,
    })
  })

  it('follows the roster for who exists', () => {
    // A drag for somebody who has since left is dropped; a newcomer the
    // admin has not touched is present and unassigned.
    const now = [{ uid: 'ada', teamId: 'team-1' }, { uid: 'zed' }]
    expect(effectiveAssignments(now, { bob: 'team-1' }, 2)).toEqual({ ada: 'team-1', zed: null })
  })
})

describe('assignmentWrites', () => {
  it('writes only what changed', () => {
    const members = [
      { uid: 'ada', teamId: 'team-1' },
      { uid: 'bob', teamId: 'team-2' },
      { uid: 'mia' },
    ]
    expect(assignmentWrites(members, { ada: 'team-1', bob: null, mia: 'team-2' })).toEqual([
      { uid: 'bob', teamId: null },
      { uid: 'mia', teamId: 'team-2' },
    ])
  })

  it('writes nothing for a layout that matches the record', () => {
    const members = [{ uid: 'ada', teamId: 'team-1' }, { uid: 'mia' }]
    expect(assignmentWrites(members, { ada: 'team-1', mia: null })).toEqual([])
  })
})

describe('teamAssignmentProblem', () => {
  it('is null when every team has somebody and everybody has a team', () => {
    expect(
      teamAssignmentProblem(teamIds(2), [
        { uid: 'ada', teamId: 'team-1' },
        { uid: 'bob', teamId: 'team-1' },
        { uid: 'mia', teamId: 'team-2' },
      ])
    ).toBeNull()
  })

  it('refuses with no teams at all', () => {
    expect(teamAssignmentProblem([], [])).toBe('no-teams')
  })

  it('refuses a team nobody is on, before an unassigned member', () => {
    expect(
      teamAssignmentProblem(teamIds(2), [{ uid: 'ada', teamId: 'team-1' }, { uid: 'bob' }])
    ).toBe('team-empty')
  })

  it('refuses a member on no team', () => {
    expect(
      teamAssignmentProblem(teamIds(2), [
        { uid: 'ada', teamId: 'team-1' },
        { uid: 'bob', teamId: 'team-2' },
        { uid: 'mia' },
      ])
    ).toBe('member-unassigned')
  })

  it('treats a member on a team that does not exist as unassigned', () => {
    expect(
      teamAssignmentProblem(teamIds(1), [
        { uid: 'ada', teamId: 'team-1' },
        { uid: 'mia', teamId: 'team-7' },
      ])
    ).toBe('member-unassigned')
  })

  it('accepts a team with several players and one with a single player', () => {
    expect(
      teamAssignmentProblem(teamIds(2), [
        { uid: 'ada', teamId: 'team-1' },
        { uid: 'bob', teamId: 'team-1' },
        { uid: 'cy', teamId: 'team-1' },
        { uid: 'mia', teamId: 'team-2' },
      ])
    ).toBeNull()
  })
})
