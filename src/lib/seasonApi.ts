import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './audit'
import type { SeasonDoc } from './types'

/** The parts of a season an admin can correct after the fact. */
export type SeasonDetails = Pick<SeasonDoc, 'showName' | 'label' | 'episodeCount' | 'accentColor'>

/**
 * Editing a season's details, in any state it happens to be in.
 *
 * Deliberately not gated on `state`: a show name typo or a season that turned
 * out to run two episodes longer than announced needs fixing whether the draft
 * is open, the season is halfway scored, or it finished last year. The security
 * rule already scopes this to `isSeasonAdmin`, which resolves to the league's
 * owner and admins plus any superadmin.
 *
 * Draft settings (pick order, timer) are not here — those belong to the draft
 * and are edited from the setup panel while a season is still `setup`.
 */

/**
 * The highest episode number that already has a scores document.
 *
 * Lowering `episodeCount` past this would strand those episodes: the season page
 * lists episodes by counting up to `episodeCount`, so the scores would vanish
 * from the UI while still counting toward every team's total — a leaderboard
 * nobody can explain or correct. Callers refuse the edit rather than orphan them.
 */
export function highestScoredEpisode(episodeNumbers: Iterable<string | number>): number {
  let highest = 0
  for (const value of episodeNumbers) {
    const episode = typeof value === 'number' ? value : parseInt(value, 10)
    if (Number.isFinite(episode) && episode > highest) highest = episode
  }
  return highest
}

/** Why an episode count is not allowed, or null when it is fine. */
export function episodeCountProblem(
  episodeCount: number,
  scoredEpisodeNumbers: Iterable<string | number>
): 'not-a-number' | 'too-few' | 'below-scored' | null {
  if (!Number.isFinite(episodeCount)) return 'not-a-number'
  if (episodeCount < 1) return 'too-few'
  if (episodeCount < highestScoredEpisode(scoredEpisodeNumbers)) return 'below-scored'
  return null
}

export async function updateSeasonDetails(
  seasonId: string,
  leagueId: string,
  previous: SeasonDetails,
  next: SeasonDetails
): Promise<void> {
  await updateDoc(doc(db, 'seasons', seasonId), {
    showName: next.showName,
    label: next.label,
    episodeCount: next.episodeCount,
    accentColor: next.accentColor,
  })

  await logAuditEvent({
    action: 'season_details_updated',
    seasonId,
    leagueId,
    oldValue: previous,
    newValue: next,
  })
}
