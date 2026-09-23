import { describe, it, expect } from 'vitest'
import {
  SEASON_QUERY_CHUNK,
  chunkIds,
  groupSeasonsByLeague,
  joinLeaguesWithSeasons,
  leagueIdKey,
} from './dashboardLeagues'

describe('chunkIds', () => {
  it('returns nothing for no ids, so a member of no league issues no query', () => {
    expect(chunkIds([])).toEqual([])
  })

  it('keeps a normal membership to a single query', () => {
    const ids = Array.from({ length: SEASON_QUERY_CHUNK }, (_, i) => `l${i}`)
    expect(chunkIds(ids)).toHaveLength(1)
  })

  it('splits at the disjunction limit rather than letting Firestore reject the query', () => {
    const ids = Array.from({ length: SEASON_QUERY_CHUNK + 1 }, (_, i) => `l${i}`)
    const chunks = chunkIds(ids)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(SEASON_QUERY_CHUNK)
    expect(chunks[1]).toEqual([`l${SEASON_QUERY_CHUNK}`])
    expect(chunks.flat()).toEqual(ids)
  })

  it('refuses a size that would loop forever', () => {
    expect(() => chunkIds(['a'], 0)).toThrow()
  })
})

describe('leagueIdKey', () => {
  it('is the same for the same set in a different order', () => {
    expect(leagueIdKey(['b', 'a'])).toBe(leagueIdKey(['a', 'b']))
  })

  it('changes when the membership does', () => {
    expect(leagueIdKey(['a'])).not.toBe(leagueIdKey(['a', 'b']))
  })

  it('is empty for no leagues', () => {
    expect(leagueIdKey([])).toBe('')
  })
})

describe('groupSeasonsByLeague', () => {
  it('collects the seasons of each league under its own id', () => {
    const grouped = groupSeasonsByLeague([
      { leagueId: 'a', id: '1' },
      { leagueId: 'b', id: '2' },
      { leagueId: 'a', id: '3' },
    ])
    expect(grouped.a.map((s) => s.id)).toEqual(['1', '3'])
    expect(grouped.b.map((s) => s.id)).toEqual(['2'])
  })

  it('has no entry for a league with no seasons', () => {
    expect(groupSeasonsByLeague([])).toEqual({})
  })
})

describe('joinLeaguesWithSeasons', () => {
  const traitors = { id: 'traitors', name: 'Traitors — Thursday Night Crew' }
  const survivor = { id: 'survivor', name: 'Survivor Superfans' }

  it('keeps only the leagues this user is a member of', () => {
    const rows = joinLeaguesWithSeasons(['traitors'], [traitors, survivor], {})
    expect(rows.map((r) => r.id)).toEqual(['traitors'])
  })

  it('picks the season that speaks for the league, not the newest', () => {
    const rows = joinLeaguesWithSeasons(['traitors'], [traitors], {
      traitors: [
        { state: 'setup', createdAt: 200 },
        { state: 'active', createdAt: 100 },
      ],
    })
    expect(rows[0].currentSeason).toEqual({ state: 'active', createdAt: 100 })
  })

  it('leaves a league with no seasons without one rather than dropping it', () => {
    const rows = joinLeaguesWithSeasons(['survivor'], [survivor], {})
    expect(rows).toHaveLength(1)
    expect(rows[0].currentSeason).toBeNull()
  })

  it('drops a membership whose league document has not arrived yet', () => {
    // The two listeners settle independently, so this is ordinary, not an error
    expect(joinLeaguesWithSeasons(['traitors'], [], {})).toEqual([])
  })
})
