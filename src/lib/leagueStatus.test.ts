import { describe, it, expect } from 'vitest'
import {
  SEASON_STATE_PRECEDENCE,
  leadingSeason,
  seasonStateRank,
  sortLeaguesByStatus,
} from './leagueStatus'
import type { SeasonState } from './types'

const season = (state: SeasonState, createdAt: number) => ({ state, createdAt })
const league = (name: string, currentSeason: { state: SeasonState; createdAt: number } | null) => ({
  league: { name },
  currentSeason,
})

describe('seasonStateRank', () => {
  it('ranks a draft above everything else', () => {
    for (const other of ['active', 'setup', 'complete'] as SeasonState[]) {
      expect(seasonStateRank('draft')).toBeLessThan(seasonStateRank(other))
    }
  })

  it('ranks a finished season below everything else', () => {
    for (const other of ['draft', 'active', 'setup'] as SeasonState[]) {
      expect(seasonStateRank('complete')).toBeGreaterThan(seasonStateRank(other))
    }
  })

  it('covers every state, so none can fall off the end unnoticed', () => {
    const states: SeasonState[] = ['setup', 'draft', 'active', 'complete']
    for (const state of states) expect(SEASON_STATE_PRECEDENCE).toContain(state)
    expect(SEASON_STATE_PRECEDENCE).toHaveLength(states.length)
  })
})

describe('leadingSeason', () => {
  it('is null for a league with no seasons', () => {
    expect(leadingSeason([])).toBeNull()
  })

  // The case the old "newest season wins" rule got wrong: lining up next
  // year's season hid the one people were actually playing.
  it('prefers a season being played to a newer one still being set up', () => {
    const active = season('active', 1)
    expect(leadingSeason([season('setup', 99), active])).toBe(active)
  })

  it('prefers a draft to a season already under way', () => {
    const draft = season('draft', 1)
    expect(leadingSeason([season('active', 99), draft])).toBe(draft)
  })

  it('prefers anything at all to a finished season', () => {
    const setup = season('setup', 1)
    expect(leadingSeason([season('complete', 99), setup])).toBe(setup)
  })

  it('takes the newest when two seasons are in the same state', () => {
    const newer = season('active', 50)
    expect(leadingSeason([season('active', 10), newer, season('active', 20)])).toBe(newer)
  })

  // Otherwise the answer would depend on a query's orderBy clause surviving.
  it('does not depend on the order it is given', () => {
    const seasons = [season('complete', 40), season('draft', 10), season('active', 30)]
    const forwards = leadingSeason(seasons)
    const backwards = leadingSeason([...seasons].reverse())
    expect(forwards).toEqual(backwards)
    expect(forwards!.state).toBe('draft')
  })

  it('falls back to the only season there is, whatever state it is in', () => {
    expect(leadingSeason([season('complete', 1)])!.state).toBe('complete')
  })
})

describe('sortLeaguesByStatus', () => {
  it('reads drafting, then playing, then not started, then over', () => {
    const sorted = sortLeaguesByStatus([
      league('Over', season('complete', 1)),
      league('Playing', season('active', 1)),
      league('Waiting', season('setup', 1)),
      league('Drafting', season('draft', 1)),
    ])
    expect(sorted.map((l) => l.league.name)).toEqual(['Drafting', 'Playing', 'Waiting', 'Over'])
  })

  it('puts a league with no seasons last', () => {
    const sorted = sortLeaguesByStatus([
      league('Empty', null),
      league('Finished', season('complete', 1)),
    ])
    expect(sorted.map((l) => l.league.name)).toEqual(['Finished', 'Empty'])
  })

  it('orders leagues in the same state by name, not by date', () => {
    const sorted = sortLeaguesByStatus([
      league('Survivor Superfans', season('active', 999)),
      league('Bake Off Club', season('active', 1)),
    ])
    expect(sorted.map((l) => l.league.name)).toEqual(['Bake Off Club', 'Survivor Superfans'])
  })

  it("leaves the caller's array alone", () => {
    const leagues = [league('B', season('complete', 1)), league('A', season('draft', 1))]
    sortLeaguesByStatus(leagues)
    expect(leagues.map((l) => l.league.name)).toEqual(['B', 'A'])
  })
})
