import type { SeasonMember } from './types'

/**
 * Putting members on teams during season setup, with no Firebase in sight.
 *
 * The setup panel edits a layout in local state — drags that have not been
 * saved — over the layout the roster already records, in the same way it
 * edits `adminPickOrder` against a live roster (see reconcilePickOrder in
 * ./draft). The writing is in ./seasonApi; the check that actually holds,
 * that every team has somebody and nobody is left out, is in the startDraft
 * Cloud Function, and is mirrored here so the button can say why it is
 * disabled. See functions/src/entries.ts.
 */

/**
 * Bounds on the number of teams. One team would be nobody to draft against;
 * the ceiling is the pick-order list's tolerance for a long roster, not a
 * fact about the game.
 */
export const TEAM_COUNT_MIN = 2
export const TEAM_COUNT_MAX = 24

/**
 * A team count brought inside its bounds. Applied on blur, as the pick timer
 * is (see clampTimerSeconds): clamping mid-keystroke turns the "1" on the
 * way to "12" into a "2".
 */
export function clampTeamCount(count: number): number {
  if (!Number.isFinite(count)) return TEAM_COUNT_MIN
  return Math.min(TEAM_COUNT_MAX, Math.max(TEAM_COUNT_MIN, Math.round(count)))
}

/** The document id of the n-th team: "Team 3" is `team-3`. */
export function teamIdFor(number: number): string {
  return `team-${number}`
}

/** `team-1` … `team-{count}`. */
export function teamIds(count: number): string[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => teamIdFor(i + 1))
}

/** The number a team id names, or null for anything that is not one. */
export function teamNumberOf(teamId: string): number | null {
  const match = /^team-(\d+)$/.exec(teamId)
  return match ? Number(match[1]) : null
}

/** uid → team id, or null for unassigned. */
export type Assignments = Record<string, string | null>

/**
 * The layout as it stands: what the roster records, with this session's
 * unsaved drags laid over it.
 *
 * Three things can put the two out of step, and each resolves the same way
 * the pick order does — by trusting the roster for who exists and the drags
 * for where they go. A member who joined after the admin started dragging is
 * present and unassigned. A member who left is gone, however they were
 * dragged. A member recorded on a team past `teamCount` — the admin lowered
 * the number — is unassigned, which is what the save will write.
 */
export function effectiveAssignments(
  members: Pick<SeasonMember, 'uid' | 'teamId'>[],
  overrides: Assignments,
  teamCount: number
): Assignments {
  const valid = new Set(teamIds(teamCount))
  const result: Assignments = {}
  for (const member of members) {
    const teamId = member.uid in overrides ? overrides[member.uid] : (member.teamId ?? null)
    result[member.uid] = teamId && valid.has(teamId) ? teamId : null
  }
  return result
}

/**
 * What a save has to write: only the members whose recorded team differs
 * from the layout. A `null` team id means clear the field.
 */
export function assignmentWrites(
  members: Pick<SeasonMember, 'uid' | 'teamId'>[],
  effective: Assignments
): { uid: string; teamId: string | null }[] {
  const writes: { uid: string; teamId: string | null }[] = []
  for (const member of members) {
    const next = effective[member.uid] ?? null
    const stored = member.teamId ?? null
    if (next !== stored) writes.push({ uid: member.uid, teamId: next })
  }
  return writes
}

export type TeamAssignmentProblem = 'no-teams' | 'team-empty' | 'member-unassigned'

/**
 * Why the layout cannot be drafted from, or null when it can.
 *
 * Every team needs somebody, or a turn would come round to nobody; and
 * everybody needs a team, or a member of the season would have no roster to
 * be on. Checked in this order so the reason is the earliest one to fix.
 *
 * Mirrored in functions/src/entries.ts, where startDraft refuses on the same
 * grounds; functions/src/entries.test.ts fails if the two disagree.
 */
export function teamAssignmentProblem(
  teamIds: string[],
  members: Pick<SeasonMember, 'uid' | 'teamId'>[]
): TeamAssignmentProblem | null {
  if (teamIds.length === 0) return 'no-teams'
  const known = new Set(teamIds)
  const filled = new Set(members.map((m) => m.teamId).filter((id): id is string => !!id))
  if (teamIds.some((id) => !filled.has(id))) return 'team-empty'
  if (members.some((m) => !m.teamId || !known.has(m.teamId))) return 'member-unassigned'
  return null
}
