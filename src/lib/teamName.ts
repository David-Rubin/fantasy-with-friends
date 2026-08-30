import type { SeasonDoc } from './types'

/**
 * The rules governing a member naming their own team, with no Firebase in
 * sight — see ./seasonDetails for why decisions live in modules like this one.
 * The writing is in ./seasonApi.
 */

/**
 * Long enough for a joke, short enough to sit in a leaderboard row beside a
 * points column without wrapping. The security rule enforces the same number;
 * changing one means changing both.
 */
export const TEAM_NAME_MAX_LENGTH = 40

/**
 * A team name as it gets stored: trimmed, with runs of whitespace collapsed.
 *
 * Applied on save rather than on every keystroke — collapsing as you type eats
 * the space you are still on your way through.
 */
export function normalizeTeamName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export type TeamNameProblem = 'empty' | 'too-long'

/** Why a team name cannot be saved, or null when it is fine. */
export function teamNameProblem(name: string): TeamNameProblem | null {
  const normalized = normalizeTeamName(name)
  if (normalized.length === 0) return 'empty'
  if (normalized.length > TEAM_NAME_MAX_LENGTH) return 'too-long'
  return null
}

/**
 * Whether a member may still name their team.
 *
 * The product rule is that naming happens in the draft room — before the draft
 * opens, while it runs, and while the "Draft complete!" banner is still up —
 * and stops once the season is under way. That last boundary is a place, not a
 * fact: `closeDraft` moves the season to `active` at the moment the draft ends,
 * so the banner a member is still looking at is already an active season, and
 * nothing stored distinguishes "just finished, still on the draft page" from
 * "came back to the draft page in week six".
 *
 * So the line drawn here is the nearest durable one: a season stops being
 * nameable once it has a score against it. A security rule can check exactly
 * this with one get(), which means it is a constraint rather than advice, and
 * it never contradicts the product rule — every phase the draft room offers
 * the field in is a phase where nothing has been scored yet.
 *
 * `firstEpisodeScoredAt` is optional here because a season document written
 * before the field existed has no value for it; absent reads as unscored, the
 * same as null.
 */
export function canRenameTeam(
  season: Pick<SeasonDoc, 'state'> & { firstEpisodeScoredAt?: number | null }
): boolean {
  if (season.state === 'complete') return false
  return !season.firstEpisodeScoredAt
}
