import { describe, it, expect } from 'vitest'
import { scorecardState, type ScorecardInput } from './scorecard'

const base: ScorecardInput = {
  isAdmin: false,
  officiallyScored: false,
  isLocked: false,
  showingAsRecorded: false,
  proposalStatus: 'none',
  adminEditingProposal: false,
}

const state = (over: Partial<ScorecardInput>) => scorecardState({ ...base, ...over })

describe('scorecardState — an episode nobody has scored', () => {
  it('lets a member fill it in and offer it', () => {
    expect(state({})).toEqual({
      editable: true,
      actions: ['submitForApproval'],
      notice: null,
    })
  })

  it('lets an admin fill it in and score it outright', () => {
    expect(state({ isAdmin: true })).toEqual({ editable: true, actions: ['submit'], notice: null })
  })

  // A discarded suggestion is not a live one: the episode is open again, to the
  // person whose card was reset as much as anyone.
  it('is open again once a suggestion has been discarded', () => {
    expect(state({ proposalStatus: 'discarded' })).toEqual({
      editable: true,
      actions: ['submitForApproval'],
      notice: null,
    })
  })
})

describe('scorecardState — a suggestion awaiting a decision', () => {
  const pending = { proposalStatus: 'pending' } as const

  it('shows a member the card and no way to change it', () => {
    expect(state(pending)).toEqual({
      editable: false,
      actions: [],
      notice: 'pendingApproval',
    })
  })

  it('offers the admin the three decisions, over a card they cannot yet tick', () => {
    expect(state({ ...pending, isAdmin: true })).toEqual({
      editable: false,
      actions: ['approve', 'edit', 'reset'],
      notice: 'pendingApproval',
    })
  })

  it('becomes an ordinary editable card once the admin takes it on', () => {
    expect(state({ ...pending, isAdmin: true, adminEditingProposal: true })).toEqual({
      editable: true,
      actions: ['submit'],
      notice: null,
    })
  })
})

describe('scorecardState — an episode that has been scored', () => {
  const scored = { officiallyScored: true, isLocked: true } as const

  // No notice: a table of read-only marks with no buttons says as much on its
  // own, and the line that used to sit under it only restated that.
  it('is read-only for a member, with nothing to explain', () => {
    expect(state(scored)).toEqual({ editable: false, actions: [], notice: null })
  })

  it('offers an admin the unlock and nothing else', () => {
    expect(state({ ...scored, isAdmin: true })).toEqual({
      editable: false,
      actions: ['unlock'],
      notice: null,
    })
  })

  it('is editable again once unlocked', () => {
    expect(state({ officiallyScored: true, isAdmin: true })).toEqual({
      editable: true,
      actions: ['submit'],
      notice: null,
    })
  })

  it('stays read-only while it shows the rules it was recorded under', () => {
    expect(state({ officiallyScored: true, isAdmin: true, showingAsRecorded: true })).toEqual({
      editable: false,
      actions: [],
      notice: null,
    })
  })

  // A suggestion cannot outlive the answer it was a suggestion about.
  it('ignores a leftover suggestion once the episode has been scored', () => {
    expect(state({ ...scored, proposalStatus: 'pending' })).toEqual({
      editable: false,
      actions: [],
      notice: null,
    })
  })
})
