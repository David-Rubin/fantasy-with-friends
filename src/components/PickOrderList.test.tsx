import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PickOrderList } from './PickOrderList'

// The buttons, not the dragging: HTML5 drag events are a browser behaviour
// jsdom does not have, and the buttons are the same reorder either way — which
// is the point of having them. Dragging is checked in the browser.

const solo = (uid: string, displayName: string) => ({
  key: uid,
  label: displayName,
  players: [{ uid, displayName }],
})

const players = [solo('u1', 'Ada Owner'), solo('u2', 'Bob Member'), solo('u3', 'Mia Requester')]

describe('PickOrderList', () => {
  it('numbers the rows in the given order', () => {
    render(<PickOrderList rows={players} order={['u3', 'u1', 'u2']} onChange={() => {}} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Pick #1')
    expect(rows[0]).toContain('Mia Requester')
    expect(rows[2]).toContain('Bob Member')
  })

  it('moves a player earlier', async () => {
    const onChange = vi.fn()
    render(<PickOrderList rows={players} order={['u1', 'u2', 'u3']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Move Bob Member earlier'))
    expect(onChange).toHaveBeenCalledWith(['u2', 'u1', 'u3'])
  })

  it('moves a player later', async () => {
    const onChange = vi.fn()
    render(<PickOrderList rows={players} order={['u1', 'u2', 'u3']} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Move Bob Member later'))
    expect(onChange).toHaveBeenCalledWith(['u1', 'u3', 'u2'])
  })

  it('offers no move off either end', () => {
    render(<PickOrderList rows={players} order={['u1', 'u2', 'u3']} onChange={() => {}} />)
    expect(screen.getByLabelText('Move Ada Owner earlier')).toBeDisabled()
    expect(screen.getByLabelText('Move Mia Requester later')).toBeDisabled()
  })

  it('names a team by its team name, with its players after it', () => {
    const teams = [
      {
        key: 'team-1',
        label: 'Team 1',
        players: [
          { uid: 'u1', displayName: 'Ada Owner' },
          { uid: 'u2', displayName: 'Bob Member' },
        ],
      },
      { key: 'team-2', label: 'Team 2', players: [{ uid: 'u3', displayName: 'Mia Requester' }] },
    ]
    render(<PickOrderList rows={teams} order={['team-2', 'team-1']} onChange={() => {}} />)
    const rows = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(rows[0]).toContain('Team 2')
    expect(rows[1]).toContain('Team 1')
    expect(rows[1]).toContain('Ada Owner, Bob Member')
    expect(screen.getByLabelText('Move Team 1 earlier')).toBeEnabled()
  })

  it('says so when the roster is empty rather than drawing an empty list', () => {
    render(<PickOrderList rows={[]} order={[]} onChange={() => {}} />)
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.getByText(/Nobody has joined/)).toBeTruthy()
  })
})
