import { describe, it, expect } from 'vitest'
import {
  dashboardTrail,
  adminUsersTrail,
  leagueTrail,
  seasonTrail,
  seasonChildTrail,
} from './breadcrumbs'
import type { BreadcrumbItem } from './breadcrumbs'

/** The invariant every trail shares: you are never a link to yourself. */
const lastIsNotALink = (trail: BreadcrumbItem[]) => trail[trail.length - 1].to === undefined

describe('dashboardTrail', () => {
  it('is a single crumb with nowhere to go', () => {
    const trail = dashboardTrail()
    expect(trail).toEqual([{ label: 'Dashboard' }])
    expect(lastIsNotALink(trail)).toBe(true)
  })
})

describe('adminUsersTrail', () => {
  it('hangs the directory off the dashboard, not off a league', () => {
    const trail = adminUsersTrail()
    expect(trail).toEqual([{ label: 'Dashboard', to: '/dashboard' }, { label: 'All users' }])
    expect(lastIsNotALink(trail)).toBe(true)
  })
})

describe('leagueTrail', () => {
  it('links back to the dashboard and ends on the league', () => {
    const trail = leagueTrail('Bravo League')
    expect(trail).toEqual([{ label: 'Dashboard', to: '/dashboard' }, { label: 'Bravo League' }])
    expect(lastIsNotALink(trail)).toBe(true)
  })

  it('stays readable before the name has loaded', () => {
    expect(leagueTrail(undefined)[1].label).toBe('League')
  })
})

describe('seasonTrail', () => {
  it('puts a link to the league between the dashboard and the season', () => {
    const trail = seasonTrail('league-1', 'Bravo League', 'Survivor')
    expect(trail).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Bravo League', to: '/leagues/league-1' },
      { label: 'Survivor' },
    ])
    expect(lastIsNotALink(trail)).toBe(true)
  })

  it('falls back on both names while they load, keeping the league navigable', () => {
    const trail = seasonTrail('league-1', undefined, undefined)
    expect(trail[1]).toEqual({ label: 'League', to: '/leagues/league-1' })
    expect(trail[2]).toEqual({ label: 'Season' })
  })

  it('does not offer a link it cannot build', () => {
    expect(seasonTrail(undefined, 'Bravo League', 'Survivor')[1].to).toBeUndefined()
  })
})

describe('seasonChildTrail', () => {
  it('promotes the season to a link and ends on the current page', () => {
    const trail = seasonChildTrail('league-1', 'Bravo League', 'season-1', 'Survivor', 'Draft')
    expect(trail).toEqual([
      { label: 'Dashboard', to: '/dashboard' },
      { label: 'Bravo League', to: '/leagues/league-1' },
      { label: 'Survivor', to: '/leagues/league-1/seasons/season-1' },
      { label: 'Draft' },
    ])
    expect(lastIsNotALink(trail)).toBe(true)
  })

  it('leaves the season unlinked when there is no season to link to', () => {
    const trail = seasonChildTrail('league-1', 'Bravo League', undefined, 'Survivor', 'Draft')
    expect(trail[2].to).toBeUndefined()
    expect(trail[2].label).toBe('Survivor')
  })

  it('names the current page verbatim, so callers control the wording', () => {
    const trail = seasonChildTrail('l', 'L', 's', 'S', 'Episode 4')
    expect(trail[3]).toEqual({ label: 'Episode 4' })
  })
})
