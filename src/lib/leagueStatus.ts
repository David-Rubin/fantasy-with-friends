import type { SeasonState } from './types'

/**
 * Which of a league's seasons speaks for it, and what order the leagues go in.
 *
 * Free of any import that reaches ./firebase — see ./roster for why the sorting
 * a page does lives beside it rather than in it.
 */

/**
 * The states in the order a reader cares about them.
 *
 * A draft comes first because it is the only state with a clock: somebody is
 * on the board right now and a turn can expire. Active next, because it is
 * where a season spends most of its life. Setup is waiting on an admin and
 * complete is waiting on nobody.
 *
 * This replaces "whichever season was created last", which answered a question
 * nobody asked — a league that lined up next year's season while this year's
 * was still being scored reported itself as Setup, and the season people were
 * actually playing was invisible from the dashboard.
 */
export const SEASON_STATE_PRECEDENCE: SeasonState[] = ['draft', 'active', 'setup', 'complete']

/** Lower sorts first. A state nobody has heard of sorts after all of them. */
export function seasonStateRank(state: SeasonState): number {
  const rank = SEASON_STATE_PRECEDENCE.indexOf(state)
  return rank === -1 ? SEASON_STATE_PRECEDENCE.length : rank
}

/** What this module needs of a season. */
export interface RankableSeason {
  state: SeasonState
  createdAt: number
}

/**
 * The season a league is judged by: the one furthest up the precedence order,
 * and the newest of those where a league has two in the same state.
 *
 * The tie-break is done here rather than left to the order the caller happened
 * to fetch in, so the answer does not depend on a query's `orderBy` clause
 * surviving a later edit.
 */
export function leadingSeason<T extends RankableSeason>(seasons: readonly T[]): T | null {
  let leader: T | null = null
  for (const season of seasons) {
    if (leader === null) {
      leader = season
      continue
    }
    const difference = seasonStateRank(season.state) - seasonStateRank(leader.state)
    if (difference < 0 || (difference === 0 && season.createdAt > leader.createdAt)) {
      leader = season
    }
  }
  return leader
}

/** What this module needs of a league. */
export interface RankableLeague {
  league: { name: string }
  currentSeason: RankableSeason | null
}

/**
 * The dashboard's leagues, in the order they should be read: whatever is being
 * drafted, then whatever is being played, then what has not started, then what
 * is over. A league with no seasons at all has nothing going on and goes last.
 *
 * Leagues in the same state are ordered by name rather than by their season's
 * date. Within a group the dates mean nothing to a reader, and sorting by them
 * would reshuffle the list for reasons nobody watching it could see.
 *
 * Returns a new array; the caller's is left alone.
 */
export function sortLeaguesByStatus<T extends RankableLeague>(leagues: readonly T[]): T[] {
  return [...leagues].sort((a, b) => {
    const rankA = a.currentSeason ? seasonStateRank(a.currentSeason.state) : Number.MAX_SAFE_INTEGER
    const rankB = b.currentSeason ? seasonStateRank(b.currentSeason.state) : Number.MAX_SAFE_INTEGER
    if (rankA !== rankB) return rankA - rankB
    return a.league.name.localeCompare(b.league.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    })
  })
}
