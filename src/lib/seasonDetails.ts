import type { SeasonDoc } from './types'

/**
 * The rules governing an edit to a season's details, with no Firebase in sight.
 *
 * Deliberately free of any import that reaches ./firebase: that module builds a
 * Firebase app at import time and throws without the VITE_FIREBASE_* variables,
 * so anything it touches can only be tested in an environment that has them. CI
 * has none. Keeping the decisions here means they are testable anywhere, and the
 * writing lives in ./seasonApi.
 */

/**
 * The parts of a season an admin can correct after the fact.
 *
 * The show name is not among them — it belongs to the league now, and is edited
 * there. See LeagueDoc.showName.
 */
export type SeasonDetails = Pick<SeasonDoc, 'label' | 'episodeCount' | 'accentColor'>

/**
 * The highest episode number that already has a scores document.
 *
 * Lowering `episodeCount` past this would strand those episodes: the season page
 * lists episodes by counting up to `episodeCount`, so the scores would vanish
 * from the UI while still counting toward every team's total — a leaderboard
 * nobody can explain or correct.
 */
export function highestScoredEpisode(episodeNumbers: Iterable<string | number>): number {
  let highest = 0
  for (const value of episodeNumbers) {
    const episode = typeof value === 'number' ? value : parseInt(value, 10)
    if (Number.isFinite(episode) && episode > highest) highest = episode
  }
  return highest
}

/**
 * Why an episode count is not allowed, or null when it is fine.
 *
 * Note what is absent: the season's state. Details are editable in `setup`,
 * `draft`, `active` and `complete` alike — only real scores constrain the count.
 */
export function episodeCountProblem(
  episodeCount: number,
  scoredEpisodeNumbers: Iterable<string | number>
): 'not-a-number' | 'too-few' | 'below-scored' | null {
  if (!Number.isFinite(episodeCount)) return 'not-a-number'
  if (episodeCount < 1) return 'too-few'
  if (episodeCount < highestScoredEpisode(scoredEpisodeNumbers)) return 'below-scored'
  return null
}
