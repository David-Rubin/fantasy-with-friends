import { describe, it, expect } from 'vitest'
import { DEFAULT_ROSTER_SORT, nextRosterSort, sortRosterRows, type RosterRowText } from './roster'

const row = (contestant: string, owner: string, status: string): RosterRowText => ({
  contestant,
  owner,
  status,
})

describe('DEFAULT_ROSTER_SORT', () => {
  it('opens the roster on contestant, ascending', () => {
    expect(DEFAULT_ROSTER_SORT).toEqual({ column: 'contestant', direction: 'asc' })
  })
})

describe('nextRosterSort', () => {
  it('starts a newly clicked column ascending', () => {
    expect(nextRosterSort({ column: 'contestant', direction: 'asc' }, 'owner')).toEqual({
      column: 'owner',
      direction: 'asc',
    })
  })

  it('does not carry a descending direction onto a new column', () => {
    expect(nextRosterSort({ column: 'contestant', direction: 'desc' }, 'status')).toEqual({
      column: 'status',
      direction: 'asc',
    })
  })

  it('flips the column that is already sorted', () => {
    const asc: ReturnType<typeof nextRosterSort> = { column: 'owner', direction: 'asc' }
    const desc = nextRosterSort(asc, 'owner')
    expect(desc).toEqual({ column: 'owner', direction: 'desc' })
    expect(nextRosterSort(desc, 'owner')).toEqual({ column: 'owner', direction: 'asc' })
  })
})

describe('sortRosterRows', () => {
  it('sorts by contestant ascending', () => {
    const rows = [row('Charlie', 'Ada', 'Active'), row('alice', 'Bob', 'Active')]
    expect(
      sortRosterRows(rows, { column: 'contestant', direction: 'asc' }).map((r) => r.contestant)
    ).toEqual(['alice', 'Charlie'])
  })

  it('reverses on descending', () => {
    const rows = [row('alice', 'Ada', 'Active'), row('Charlie', 'Bob', 'Active')]
    expect(
      sortRosterRows(rows, { column: 'contestant', direction: 'desc' }).map((r) => r.contestant)
    ).toEqual(['Charlie', 'alice'])
  })

  it('sorts by the owner name the reader sees', () => {
    const rows = [row('Ana', 'Zoe Member', 'Active'), row('Bea', 'Free agent', 'Active')]
    expect(sortRosterRows(rows, { column: 'owner', direction: 'asc' }).map((r) => r.owner)).toEqual(
      ['Free agent', 'Zoe Member']
    )
  })

  it('sorts by status text, so Active precedes Eliminated', () => {
    const rows = [row('Ana', 'Ada', 'Eliminated'), row('Bea', 'Bob', 'Active')]
    expect(
      sortRosterRows(rows, { column: 'status', direction: 'asc' }).map((r) => r.status)
    ).toEqual(['Active', 'Eliminated'])
  })

  it('breaks ties on contestant name, ascending, in both directions', () => {
    const rows = [
      row('Cara', 'Ada', 'Active'),
      row('Ana', 'Ada', 'Active'),
      row('Bea', 'Ada', 'Active'),
    ]
    expect(
      sortRosterRows(rows, { column: 'owner', direction: 'asc' }).map((r) => r.contestant)
    ).toEqual(['Ana', 'Bea', 'Cara'])
    expect(
      sortRosterRows(rows, { column: 'owner', direction: 'desc' }).map((r) => r.contestant)
    ).toEqual(['Ana', 'Bea', 'Cara'])
  })

  it('ignores case, so a lowercase name is not exiled to the end', () => {
    const rows = [
      row('bea', 'Ada', 'Active'),
      row('Ana', 'Ada', 'Active'),
      row('Cara', 'Ada', 'Active'),
    ]
    expect(
      sortRosterRows(rows, { column: 'contestant', direction: 'asc' }).map((r) => r.contestant)
    ).toEqual(['Ana', 'bea', 'Cara'])
  })

  it('orders numerals the way a person writes them', () => {
    const rows = [row('Player 10', 'Ada', 'Active'), row('Player 2', 'Ada', 'Active')]
    expect(
      sortRosterRows(rows, { column: 'contestant', direction: 'asc' }).map((r) => r.contestant)
    ).toEqual(['Player 2', 'Player 10'])
  })

  it('leaves the caller’s array alone', () => {
    const rows = [row('Cara', 'Ada', 'Active'), row('Ana', 'Ada', 'Active')]
    sortRosterRows(rows, { column: 'contestant', direction: 'asc' })
    expect(rows.map((r) => r.contestant)).toEqual(['Cara', 'Ana'])
  })
})
