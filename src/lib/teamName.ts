/**
 * The rules governing a member naming their own team, with no Firebase in
 * sight — see ./seasonDetails for why decisions live in modules like this one.
 * The writing is in ./seasonApi.
 *
 * There is no longer a question of *when* a member may rename: being in the
 * season is the whole test, in every state of it, which is what the roster's
 * `update` rule already asks. What is left here is what a name may be.
 */

/**
 * Long enough for a joke, short enough to sit in a leaderboard row beside a
 * points column without wrapping. The security rule enforces the same number;
 * changing one means changing both, and src/lib/rulesLimits.test.ts fails if
 * only one of them changes.
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
