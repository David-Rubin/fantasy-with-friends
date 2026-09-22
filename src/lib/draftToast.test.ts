import { describe, it, expect } from 'vitest'
import {
  DRAFT_TOAST_MAX,
  draftedOwners,
  mergeDraftToasts,
  newDraftToasts,
  type DraftToast,
} from './draftToast'
import type { Entry } from './entries'
import type { Contestant } from './types'

function contestant(id: string, draftedByUid: string | null): Contestant {
  return {
    id,
    name: `Contestant ${id}`,
    photoUrl: `https://example.test/${id}.jpg`,
    bio: '',
    draftedByUid,
    draftedRound: draftedByUid ? 1 : null,
    eliminatedEpisode: null,
  }
}

function entry(key: string, teamName: string): Entry {
  return { key, teamName, pickPosition: 1, label: teamName, players: [] }
}

const entries = [entry('ada', "Ada's Traitors"), entry('bob', 'Bob and Co')]

describe('newDraftToasts', () => {
  it('announces nothing on the first snapshot, however much has been drafted', () => {
    const cast = [contestant('c1', 'ada'), contestant('c2', 'bob')]
    expect(newDraftToasts(null, cast, entries, 'ada')).toEqual([])
  })

  it('announces a contestant that has just gone from undrafted to drafted', () => {
    const before = draftedOwners([contestant('c1', null), contestant('c2', null)])
    const after = [contestant('c1', 'bob'), contestant('c2', null)]

    const toasts = newDraftToasts(before, after, entries, 'ada')
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      id: 'c1',
      contestantName: 'Contestant c1',
      teamName: 'Bob and Co',
      mine: false,
    })
  })

  // The wording turns on this: the picking team reads "You chose", everyone
  // else reads who got them. In team mode every member of the team is "you",
  // including the ones who only watched.
  it('marks the pick as the viewer own when they play for the picking entry', () => {
    const before = draftedOwners([contestant('c1', null)])
    const toasts = newDraftToasts(before, [contestant('c1', 'ada')], entries, 'ada')
    expect(toasts[0].mine).toBe(true)
  })

  it('says nothing about a contestant who was already drafted', () => {
    const before = draftedOwners([contestant('c1', 'ada')])
    expect(newDraftToasts(before, [contestant('c1', 'ada')], entries, 'bob')).toEqual([])
  })

  // An admin moving somebody between teams while settling the bench is a
  // correction, not a pick.
  it('says nothing when a drafted contestant changes hands', () => {
    const before = draftedOwners([contestant('c1', 'ada')])
    expect(newDraftToasts(before, [contestant('c1', 'bob')], entries, 'bob')).toEqual([])
  })

  it('skips a pick by an entry this client cannot name yet', () => {
    const before = draftedOwners([contestant('c1', null)])
    expect(newDraftToasts(before, [contestant('c1', 'ghost')], entries, 'ada')).toEqual([])
  })

  it('announces every pick that landed between two snapshots', () => {
    const before = draftedOwners([contestant('c1', null), contestant('c2', null)])
    const toasts = newDraftToasts(
      before,
      [contestant('c1', 'ada'), contestant('c2', 'bob')],
      entries,
      null
    )
    expect(toasts.map((t) => t.id)).toEqual(['c1', 'c2'])
    expect(toasts.every((t) => t.mine)).toBe(false)
  })
})

describe('draftedOwners', () => {
  it('records only the contestants somebody holds', () => {
    expect(draftedOwners([contestant('c1', 'ada'), contestant('c2', null)])).toEqual({ c1: 'ada' })
  })
})

// A query listener's first snapshot can arrive empty and be filled a moment
// later. Priming from that empty one recorded an empty board and then
// announced every pick already taken — three toasts at once for a draft
// somebody had only just opened.
describe('the first snapshots', () => {
  it('announces nothing when the cast has not arrived yet', () => {
    expect(newDraftToasts({}, [], entries, 'ada')).toEqual([])
  })

  it('announces nothing for picks already taken when the cast does arrive', () => {
    const cast = [contestant('c1', 'ada'), contestant('c2', 'bob')]
    // What the effect does: an empty snapshot records nothing, so the first
    // snapshot with a cast in it is still compared against null.
    expect(newDraftToasts(null, cast, entries, 'ada')).toEqual([])
  })
})

describe('mergeDraftToasts', () => {
  const a = { id: 'c1' } as DraftToast
  const b = { id: 'c2' } as DraftToast
  const c = { id: 'c3' } as DraftToast

  it('keeps one toast per contestant, however often the pick is re-delivered', () => {
    expect(mergeDraftToasts([a, b], [{ ...a }])).toEqual([b, a])
  })

  it('drops the oldest rather than growing past what a short screen holds', () => {
    const merged = mergeDraftToasts([a, b], [c])
    expect(merged.map((toast) => toast.id)).toEqual(['c2', 'c3'])
    expect(merged.length).toBe(DRAFT_TOAST_MAX)
  })
})
