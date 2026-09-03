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
export type SeasonDetails = Pick<SeasonDoc, 'label' | 'episodeCount'>

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

/**
 * The bounds on a draft pick timer, in seconds.
 *
 * Five is the floor because a turn has to be long enough to read the board and
 * click once; ten minutes is the ceiling because a draft everyone is sitting
 * through has to keep moving. Exported so the input's min/max and the clamp
 * below cannot drift apart.
 */
export const TIMER_SECONDS_MIN = 5
export const TIMER_SECONDS_MAX = 600

/**
 * A pick timer brought inside its bounds.
 *
 * The min/max on a number input only bind the stepper and native form
 * validation, and the setup panel's buttons are plain clicks rather than a
 * submit — so a typed 9999 would otherwise be saved as written. Applied when
 * the field loses focus, never mid-keystroke: clamping as you type turns the
 * "1" on the way to "15" into a "5".
 */
export function clampTimerSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return TIMER_SECONDS_MIN
  return Math.min(TIMER_SECONDS_MAX, Math.max(TIMER_SECONDS_MIN, Math.round(seconds)))
}
