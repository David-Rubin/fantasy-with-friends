import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamAssignmentBoard } from './TeamAssignmentBoard'
import type { SeasonMember } from '../lib/types'

// The selects, not the dragging: HTML5 drag events are a browser behaviour
// jsdom does not have, and the select is the same move either way — which is
// the point of having it. Dragging is checked in the browser.

const member = (uid: string, displayName: string): SeasonMember => ({
  uid,
  displayName,
  teamName: `${displayName}'s Team`,
  pickPosition: null,
  joinedAt: 0,
})

const members = [
  member('u1', 'Ada Owner'),
  member('u2', 'Bob Member'),
  member('u3', 'Mia Requester'),
]

describe('TeamAssignmentBoard', () => {
  it('draws a box per team plus one for the unassigned, with people where they are', () => {
    render(
      <TeamAssignmentBoard
        members={members}
        teamCount={2}
        assignments={{ u1: 'team-1', u2: 'team-1', u3: null }}
        teamNames={{ 'team-1': 'Round Table Rejects' }}
        onAssign={() => {}}
      />
    )
    const team1 = screen.getByRole('region', { name: 'Round Table Rejects' })
    expect(within(team1).getByText('Ada Owner')).toBeTruthy()
    expect(within(team1).getByText('Bob Member')).toBeTruthy()
    const team2 = screen.getByRole('region', { name: 'Team 2' })
    expect(within(team2).getByText('No players yet')).toBeTruthy()
    const unassigned = screen.getByRole('region', { name: 'Unassigned' })
    expect(within(unassigned).getByText('Mia Requester')).toBeTruthy()
  })

  it('moves a player onto a team through the select', async () => {
    const onAssign = vi.fn()
    render(
      <TeamAssignmentBoard
        members={members}
        teamCount={2}
        assignments={{ u1: null, u2: null, u3: null }}
        teamNames={{}}
        onAssign={onAssign}
      />
    )
    await userEvent.selectOptions(screen.getByLabelText('Team for Mia Requester'), 'team-2')
    expect(onAssign).toHaveBeenCalledWith('u3', 'team-2')
  })

  it('takes a player off a team through the select', async () => {
    const onAssign = vi.fn()
    render(
      <TeamAssignmentBoard
        members={members}
        teamCount={2}
        assignments={{ u1: 'team-1', u2: null, u3: null }}
        teamNames={{}}
        onAssign={onAssign}
      />
    )
    await userEvent.selectOptions(screen.getByLabelText('Team for Ada Owner'), '')
    expect(onAssign).toHaveBeenCalledWith('u1', null)
  })

  it('offers exactly the teams there are', () => {
    render(
      <TeamAssignmentBoard
        members={[members[0]]}
        teamCount={3}
        assignments={{ u1: null }}
        teamNames={{}}
        onAssign={() => {}}
      />
    )
    const options = within(screen.getByLabelText('Team for Ada Owner'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toEqual(['Unassigned', 'Team 1', 'Team 2', 'Team 3'])
  })
})
