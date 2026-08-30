import { describe, it, expect } from 'vitest'
import { userDeletionMessage, userDeletionProblem } from './deletion'
import type { MemberSeason } from './membership'

const season = (id: string, state: MemberSeason['state'], label = id): MemberSeason => ({
  id,
  state,
  label,
})

const subject = (over: Partial<Parameters<typeof userDeletionProblem>[0]> = {}) => ({
  isSelf: false,
  ownedLeagues: [],
  seasons: [],
  ...over,
})

describe('userDeletionProblem', () => {
  it('allows a user who owns nothing and plays nowhere', () => {
    expect(userDeletionProblem(subject())).toBeNull()
  })

  it('refuses a superadmin deleting their own account', () => {
    expect(userDeletionProblem(subject({ isSelf: true }))).toEqual({ kind: 'self' })
  })

  it('refuses a user who owns a league, naming it', () => {
    const problem = userDeletionProblem(
      subject({ ownedLeagues: [{ id: 'l1', name: 'Traitors — Thursday Night Crew' }] })
    )
    expect(problem).toEqual({ kind: 'owns-leagues', names: ['Traitors — Thursday Night Crew'] })
  })

  it('reports self before ownership, so the clearest refusal wins', () => {
    const problem = userDeletionProblem(
      subject({ isSelf: true, ownedLeagues: [{ id: 'l1', name: 'Survivor Superfans' }] })
    )
    expect(problem).toEqual({ kind: 'self' })
  })

  it('refuses a user drafting or playing an active season', () => {
    expect(
      userDeletionProblem(subject({ seasons: [season('s1', 'draft', 'The Traitors — Season 3')] }))
    ).toEqual({ kind: 'seasons-underway', labels: ['The Traitors — Season 3'] })

    expect(
      userDeletionProblem(subject({ seasons: [season('s2', 'active', 'Survivor — Season 50')] }))
    ).toEqual({ kind: 'seasons-underway', labels: ['Survivor — Season 50'] })
  })

  it('lists every season that blocks, not just the first', () => {
    const problem = userDeletionProblem(
      subject({
        seasons: [
          season('s1', 'draft', 'One'),
          season('s2', 'complete'),
          season('s3', 'active', 'Three'),
        ],
      })
    )
    expect(problem).toEqual({ kind: 'seasons-underway', labels: ['One', 'Three'] })
  })

  it('lets setup and complete seasons through', () => {
    expect(
      userDeletionProblem(subject({ seasons: [season('s1', 'setup'), season('s2', 'complete')] }))
    ).toBeNull()
  })

  it('reports ownership before seasons — the league is the bigger obstacle', () => {
    const problem = userDeletionProblem(
      subject({
        ownedLeagues: [{ id: 'l1', name: 'Survivor Superfans' }],
        seasons: [season('s1', 'active', 'Survivor — Season 50')],
      })
    )
    expect(problem).toEqual({ kind: 'owns-leagues', names: ['Survivor Superfans'] })
  })
})

describe('userDeletionMessage', () => {
  it('names the one league they own, in the singular', () => {
    expect(userDeletionMessage({ kind: 'owns-leagues', names: ['Survivor Superfans'] })).toBe(
      'They own Survivor Superfans. Transfer ownership or delete that league first.'
    )
  })

  it('reads a list of leagues aloud, in the plural', () => {
    expect(userDeletionMessage({ kind: 'owns-leagues', names: ['A', 'B', 'C'] })).toBe(
      'They own A, B and C. Transfer ownership or delete those leagues first.'
    )
  })

  it('says what to do about a season underway', () => {
    expect(
      userDeletionMessage({ kind: 'seasons-underway', labels: ['The Traitors — Season 3'] })
    ).toBe(
      'They are playing in The Traitors — Season 3. Accounts can only be deleted once a season has finished.'
    )
  })

  it('refuses self-deletion plainly', () => {
    expect(userDeletionMessage({ kind: 'self' })).toBe('You cannot delete your own account.')
  })
})
