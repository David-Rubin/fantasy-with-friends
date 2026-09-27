import { highestScoredEpisode } from './seasonDetails'

/**
 * Keeping a season's results from somebody who has not watched them yet.
 *
 * The whole of what is stored per person is one number: the episode they have
 * said they are caught up through (see WatchProgressDoc). Everything they are
 * shown until they move it is worked out from that number and data the season
 * already has — totals through episode N are `teamEpisodeTotals[key][N]`, and a
 * contestant who went out after N was still in as far as they know. So "the
 * season as you last saw it" needs no snapshot of what they last saw, and it
 * reads the same on every device they open it on.
 *
 * An episode number rather than a timestamp, because a spoiler is about an
 * episode you have not watched. An admin correcting episode 3 after you
 * watched episode 5 has told you nothing new about the show.
 *
 * Kept free of Firebase so it can be tested — see src/lib/seasonDetails.ts.
 */

/**
 * `scored` — an admin has submitted the episode, so it moves the leaderboard.
 * `suggested` — a member has filled a card in and nothing is counted yet; it
 * is a spoiler only on that episode's own scorecard.
 */
export type SpoilerKind = 'scored' | 'suggested'

/** What there is to see beyond where the viewer is caught up to. */
export interface SpoilerHorizon {
  /** The episode confirming "caught up" would move them to. */
  through: number
  kind: SpoilerKind
}

/**
 * The season page's question: has anything been scored past where this viewer
 * is caught up to? Suggestions are not counted here — they move no total, so
 * the season page has nothing of theirs to hide.
 */
export function seasonSpoiler(
  caughtUpThrough: number,
  scoredEpisodes: Iterable<string | number>
): SpoilerHorizon | null {
  const latest = highestScoredEpisode(scoredEpisodes)
  return latest > caughtUpThrough ? { through: latest, kind: 'scored' } : null
}

/**
 * Whether an episode is one the viewer has watched. Such an episode's card
 * shows nothing past it — its own scores, and who was still in by then — so
 * this alone settles that the card has nothing to hide, without knowing what
 * else has been scored or suggested.
 */
export function alreadyWatched(caughtUpThrough: number, episode: number): boolean {
  return episode <= caughtUpThrough
}

/**
 * One episode's scorecard: is there anything on it, or behind it, that the
 * viewer has not watched?
 *
 * Its own result, if it has one — scored, or suggested and waiting on an
 * admin. And any episode scored between where they are and this one, because
 * the card lists only the contestants still in, and who has gone out since is
 * precisely what they have not seen. A later episode is none of this card's
 * business.
 *
 * `through` is this episode when the card itself has something on it, since
 * that is what the viewer is looking at; otherwise it is the latest of those
 * in between.
 */
export function episodeSpoiler(
  caughtUpThrough: number,
  episode: number,
  scoredEpisodes: Iterable<string | number>,
  suggested: boolean
): SpoilerHorizon | null {
  if (alreadyWatched(caughtUpThrough, episode)) return null
  const between = [...scoredEpisodes]
    .map((n) => (typeof n === 'number' ? n : parseInt(n, 10)))
    .filter((n) => n > caughtUpThrough && n <= episode)
  const latest = highestScoredEpisode(between)
  if (latest === episode) return { through: episode, kind: 'scored' }
  if (suggested) return { through: episode, kind: 'suggested' }
  if (latest > 0) return { through: latest, kind: 'scored' }
  return null
}

/**
 * Where a viewer is in a guarded page.
 *
 * `checking` — what they have seen, or what there is, has not been heard yet.
 * `prompt` — there is something new and they are being asked about it.
 * `hidden` — there is something new and they are looking at the season as it
 *   was, with a way to catch up.
 * `clear` — nothing is hidden.
 */
export type SpoilerPhase = 'checking' | 'prompt' | 'hidden' | 'clear'

/**
 * Whether the question is being asked. `unsettled` until the first answer,
 * because the question is only asked about what was waiting when the page
 * opened: a result that lands while somebody is reading gets the quieter
 * notice, not a dialog over what they are in the middle of.
 */
export type PromptState = 'unsettled' | 'open' | 'closed'

export function settlePrompt(
  prompt: PromptState,
  ready: boolean,
  horizon: SpoilerHorizon | null
): PromptState {
  if (!ready) return prompt
  if (prompt === 'unsettled') return horizon ? 'open' : 'closed'
  // Caught up from somewhere else — another tab — while it was up. Closed for
  // good, so the next result to arrive is a notice rather than this again.
  if (prompt === 'open' && !horizon) return 'closed'
  return prompt
}

export function spoilerPhase(
  ready: boolean,
  horizon: SpoilerHorizon | null,
  prompt: PromptState
): SpoilerPhase {
  if (!ready) return 'checking'
  if (!horizon) return 'clear'
  return settlePrompt(prompt, ready, horizon) === 'open' ? 'prompt' : 'hidden'
}

/**
 * The episode a guarded page is drawn through, or null for everything.
 *
 * While the check is still running this is where the viewer was last known to
 * be — zero before even that has arrived — so nothing drawn under the blur can
 * be the thing the blur is for.
 */
export function viewThrough(phase: SpoilerPhase, caughtUpThrough: number): number | null {
  return phase === 'clear' ? null : caughtUpThrough
}

/** Whether an episode is past what the page is drawn through. */
export function isAhead(episode: number | string, through: number | null): boolean {
  if (through === null) return false
  const n = typeof episode === 'number' ? episode : parseInt(episode, 10)
  return n > through
}

/**
 * Contestants as they stood after episode `through`: one who went out later
 * was still in. Null leaves them as they are.
 */
export function contestantsAsOf<T extends { eliminatedEpisode: number | null }>(
  contestants: T[],
  through: number | null
): T[] {
  if (through === null) return contestants
  return contestants.map((c) =>
    c.eliminatedEpisode !== null && c.eliminatedEpisode > through
      ? { ...c, eliminatedEpisode: null }
      : c
  )
}

/** Keys of a map keyed by episode number, without those past `through`. */
export function episodesAsOf<V>(
  byEpisode: Record<string, V>,
  through: number | null
): Record<string, V> {
  if (through === null) return byEpisode
  return Object.fromEntries(Object.entries(byEpisode).filter(([ep]) => !isAhead(ep, through)))
}

/**
 * One entry's place on the leaderboard as of episode `through`.
 *
 * `total` for the live board is `teamTotals`, as it always was. For an earlier
 * one it is the running total through the last scored episode at or before
 * `through` — which is what `teamEpisodeTotals` holds, and is the same number
 * the live board showed at the time. `delta` is what that episode added.
 */
export function standingAsOf(
  teamTotal: number | undefined,
  episodeTotals: Record<string, number> | undefined,
  through: number | null
): { total: number; delta: number | null } {
  const scored = Object.keys(episodeTotals ?? {})
    .map(Number)
    .filter((n) => through === null || n <= through)
    .sort((a, b) => a - b)
  const last = scored[scored.length - 1]
  const prev = scored[scored.length - 2]
  const at = (ep: number | undefined) => (ep === undefined ? 0 : (episodeTotals?.[ep] ?? 0))
  const delta = last === undefined ? null : at(last) - at(prev)
  const total = through === null ? (teamTotal ?? 0) : at(last)
  return { total, delta }
}
