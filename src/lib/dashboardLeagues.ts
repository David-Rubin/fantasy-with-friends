import { leadingSeason, type RankableSeason } from './leagueStatus'

/**
 * Assembling the dashboard's "my leagues" list.
 *
 * Free of any import that reaches ./firebase — see ./leagueStatus for why the
 * decisions a page makes live beside it rather than in it.
 *
 * The dashboard used to read, for every league the signed-in user belongs to,
 * the league document and then that league's seasons — sequentially, one
 * awaited round trip after another, and from scratch on every membership
 * snapshot. Ten leagues meant twenty serial reads, and any write to any member
 * document (a renamed player, a changed avatar) started them again. That is
 * what made the page occasionally take an unreasonable time to settle.
 *
 * Two things fix it, and both live here rather than in the page:
 *  - the league documents are already streaming in through the browse
 *    listener, so they need not be fetched again per league;
 *  - the seasons of many leagues can be asked for at once, with `leagueId in
 *    [...]`, which Firestore caps at `SEASON_QUERY_CHUNK` values per query.
 */

/**
 * How many league ids one `where('leagueId', 'in', [...])` query may carry.
 *
 * Firestore's limit for a disjunctive filter is 30 values; a query built with
 * more is rejected outright rather than truncated, so the page chunks to this
 * and runs the chunks in parallel. A user in 30 leagues or fewer — which is
 * everybody — therefore pays exactly one round trip for every badge on the
 * page.
 */
export const SEASON_QUERY_CHUNK = 30

/** Split `ids` into runs of at most `size`. Empty in, empty out. */
export function chunkIds(ids: readonly string[], size: number = SEASON_QUERY_CHUNK): string[][] {
  if (size < 1) throw new Error('chunk size must be at least 1')
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

/**
 * A stable identity for a set of league ids.
 *
 * The seasons effect keys off this so that a membership snapshot which changes
 * a member's name — but not which leagues they are in — re-runs nothing. Sorted
 * because the collection group query's order is not guaranteed, and a reordered
 * set is the same set.
 */
export function leagueIdKey(ids: readonly string[]): string {
  return [...ids].sort().join(',')
}

/** Group seasons by the league they belong to. */
export function groupSeasonsByLeague<T extends { leagueId: string }>(
  seasons: readonly T[]
): Record<string, T[]> {
  const byLeague: Record<string, T[]> = {}
  for (const season of seasons) {
    ;(byLeague[season.leagueId] ??= []).push(season)
  }
  return byLeague
}

/**
 * The rows of the "my leagues" list: one per league this user is a member of,
 * carrying the season that speaks for it.
 *
 * A league id with no document in `allLeagues` is dropped rather than rendered
 * blank — the membership listener and the league listener settle
 * independently, so a moment where a membership is known and its league is not
 * is ordinary, not an error.
 */
export function joinLeaguesWithSeasons<L extends { id: string }, S extends RankableSeason>(
  myLeagueIds: readonly string[],
  allLeagues: readonly L[],
  seasonsByLeague: Readonly<Record<string, readonly S[]>>
): { id: string; league: L; currentSeason: S | null }[] {
  const mine = new Set(myLeagueIds)
  return allLeagues
    .filter((league) => mine.has(league.id))
    .map((league) => ({
      id: league.id,
      league,
      currentSeason: leadingSeason(seasonsByLeague[league.id] ?? []),
    }))
}
