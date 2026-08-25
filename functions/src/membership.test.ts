import { describe, it, expect } from 'vitest'
import { planRemoval, canRemove, blockingReason, type MemberSeason } from './membership'

const season = (id: string, state: MemberSeason['state']): MemberSeason => ({
  id,
  state,
  label: `${id} label`,
})

describe('planRemoval', () => {
  it('lets a member go when they are in nothing', () => {
    const plan = planRemoval([])
    expect(canRemove(plan)).toBe(true)
    expect(plan.leaving).toEqual([])
    expect(plan.keeping).toEqual([])
  })

  it('blocks on a season that is drafting', () => {
    const plan = planRemoval([season('s1', 'draft')])
    expect(canRemove(plan)).toBe(false)
    expect(plan.blocking.map((s) => s.id)).toEqual(['s1'])
  })

  it('blocks on a season that is active', () => {
    const plan = planRemoval([season('s1', 'active')])
    expect(canRemove(plan)).toBe(false)
  })

  it('drops the member from seasons still in setup', () => {
    const plan = planRemoval([season('s1', 'setup'), season('s2', 'setup')])
    expect(canRemove(plan)).toBe(true)
    expect(plan.leaving.map((s) => s.id)).toEqual(['s1', 's2'])
  })

  it('leaves completed seasons alone — past results are not rewritten', () => {
    const plan = planRemoval([season('s1', 'complete')])
    expect(canRemove(plan)).toBe(true)
    expect(plan.keeping.map((s) => s.id)).toEqual(['s1'])
    expect(plan.leaving).toEqual([])
  })

  it('blocks even when only one of several seasons is underway', () => {
    const plan = planRemoval([
      season('done', 'complete'),
      season('upcoming', 'setup'),
      season('live', 'active'),
    ])
    expect(canRemove(plan)).toBe(false)
    // The refusal names the season standing in the way, and nothing else.
    expect(blockingReason(plan)).toBe('live label')
  })

  it('names every blocking season in the reason', () => {
    const plan = planRemoval([season('drafting', 'draft'), season('live', 'active')])
    expect(blockingReason(plan)).toBe('drafting label, live label')
  })
})
