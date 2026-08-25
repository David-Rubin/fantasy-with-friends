import { t } from './i18n'

/**
 * The breadcrumb trails, built in one place so every page agrees on them.
 *
 * A trail always starts at the dashboard and ends on the page you are looking
 * at, which is never a link — clicking it would reload the page you are already
 * on. Everything between is a link to an ancestor.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts for the same reasoning):
 * the shape of a trail is worth testing, and nothing here should need
 * credentials to load. Names are passed in by the caller, which fetches them.
 */

export interface BreadcrumbItem {
  label: string
  /** Absent on the last item — the page you are on. */
  to?: string
}

/**
 * Names arrive asynchronously, so a trail has to be renderable before they do.
 * Falling back to a generic word keeps the crumb present and navigable rather
 * than having the trail grow a segment at a time as each document loads.
 */
const leagueLabel = (name: string | undefined) => name || t('nav.league')
const seasonLabel = (name: string | undefined) => name || t('nav.season')

export function dashboardTrail(): BreadcrumbItem[] {
  return [{ label: t('nav.dashboard') }]
}

export function adminUsersTrail(): BreadcrumbItem[] {
  return [{ label: t('nav.dashboard'), to: '/dashboard' }, { label: t('admin.users.title') }]
}

export function leagueTrail(leagueName: string | undefined): BreadcrumbItem[] {
  return [{ label: t('nav.dashboard'), to: '/dashboard' }, { label: leagueLabel(leagueName) }]
}

export function seasonTrail(
  leagueId: string | undefined,
  leagueName: string | undefined,
  seasonName: string | undefined
): BreadcrumbItem[] {
  return [
    { label: t('nav.dashboard'), to: '/dashboard' },
    { label: leagueLabel(leagueName), to: leagueId ? `/leagues/${leagueId}` : undefined },
    { label: seasonLabel(seasonName) },
  ]
}

/**
 * A page below a season — the draft room, episode scoring, season awards.
 * The season becomes a link and `current` names where you are.
 */
export function seasonChildTrail(
  leagueId: string | undefined,
  leagueName: string | undefined,
  seasonId: string | undefined,
  seasonName: string | undefined,
  current: string
): BreadcrumbItem[] {
  const trail = seasonTrail(leagueId, leagueName, seasonName)
  const season = trail[trail.length - 1]
  return [
    ...trail.slice(0, -1),
    {
      ...season,
      to: leagueId && seasonId ? `/leagues/${leagueId}/seasons/${seasonId}` : undefined,
    },
    { label: current },
  ]
}
