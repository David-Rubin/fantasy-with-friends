import type { SeasonState } from './types'

/**
 * Closing a season, and who won it.
 *
 * Kept free of Firebase (see ./seasonDetails for the reasoning) — the two
 * decisions worth asserting on are when the season may be closed and which team
 * the closed page celebrates, and neither needs a database to make.
 */

/**
 * Whether an admin may close the season.
 *
 * Every episode has to be scored *and* locked. Scored but unlocked means an
 * admin is still working on it, and closing the season around an episode
 * somebody is mid-edit would freeze it half-finished.
 *
 * `episodeCount` is the season's own idea of how long it is, so raising it
 * reopens the question — which is right: an admin who adds a nineteenth episode
 * to an eighteen-episode season has decided the season is not over.
 */
export function canCompleteSeason(
  state: SeasonState,
  episodeCount: number,
  /** episodeNumber → locked, exactly as the season page holds it. */
  episodeStatuses: Record<string, boolean>
): boolean {
  if (state !== 'active') return false
  if (episodeCount < 1) return false
  for (let episode = 1; episode <= episodeCount; episode++) {
    if (episodeStatuses[String(episode)] !== true) return false
  }
  return true
}

export interface SeasonWinner {
  /** Entry keys of every team on the top score — more than one when they tie. */
  keys: string[]
  points: number
  tied: boolean
}

/**
 * The team the closed season celebrates, or null when there is nothing to
 * celebrate yet.
 *
 * Ties are shared rather than broken. The app has no tiebreak rule and inventing
 * one here would decide a league's season on a technicality nobody agreed to;
 * naming both is honest, and the people involved can settle it between them.
 *
 * An entry with nothing in `teamTotals` counts as zero — that is what the
 * leaderboard already shows it as — so a season where nobody scored has
 * everyone tied on nothing rather than no winner at all.
 *
 * `entryKeys` are uids, or team ids in team mode — see ./entries.
 */
export function seasonWinner(
  entryKeys: string[],
  teamTotals: Record<string, number>
): SeasonWinner | null {
  if (entryKeys.length === 0) return null

  const points = Math.max(...entryKeys.map((key) => teamTotals[key] ?? 0))
  const keys = entryKeys.filter((key) => (teamTotals[key] ?? 0) === points)

  return { keys, points, tied: keys.length > 1 }
}
