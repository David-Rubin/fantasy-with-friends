/**
 * Entries — what a season is played between — mirrored from src/lib/entries.ts
 * and src/lib/teamAssignment.ts.
 *
 * In a solo season every member is an entry and the member's uid is its key.
 * In team mode the entries are the season's teams and the key is the team id;
 * a member's `teamId` says which one they play for. `pickOrder`,
 * `currentPickerUid`, `draftedByUid` and `teamTotals` all hold entry keys,
 * and every function in ./index that reads or writes them gets the key from
 * here.
 *
 * Kept as a standalone copy rather than shared with the client bundle, for
 * the same reason as the draft arithmetic: the client's version decides what
 * the screens show, this one decides what is written. If the two disagree the
 * server wins. functions/src/entries.test.ts asserts they do not.
 */

export interface EntryMember {
  uid: string
  teamId?: string
}

export interface EntryTeam {
  id: string
  number: number
}

export function isTeamMode(season: { teamMode?: unknown } | null | undefined): boolean {
  return season?.teamMode === true
}

/**
 * The entry keys, in the order they are listed before a draft assigns
 * positions: roster order in solo mode, team number in team mode.
 */
export function entryKeys(
  season: { teamMode?: unknown } | null | undefined,
  members: EntryMember[],
  teams: EntryTeam[]
): string[] {
  if (!isTeamMode(season)) return members.map((m) => m.uid)
  return [...teams].sort((a, b) => a.number - b.number).map((t) => t.id)
}

/**
 * The key of the entry a member plays for, or null when they play for none.
 * In team mode that is a member not yet put on a team — or, if the team
 * document has gone, on one that no longer exists.
 */
export function entryKeyFor(
  season: { teamMode?: unknown } | null | undefined,
  member: EntryMember | null | undefined,
  teams: EntryTeam[]
): string | null {
  if (!member) return null
  if (!isTeamMode(season)) return member.uid
  if (!member.teamId) return null
  return teams.some((t) => t.id === member.teamId) ? member.teamId : null
}

export type TeamAssignmentProblem = 'no-teams' | 'team-empty' | 'member-unassigned'

/**
 * Why a team layout cannot be drafted from, or null when it can. Mirrored
 * from src/lib/teamAssignment.ts; this is the copy startDraft refuses on.
 */
export function teamAssignmentProblem(
  teamIds: string[],
  members: EntryMember[]
): TeamAssignmentProblem | null {
  if (teamIds.length === 0) return 'no-teams'
  const known = new Set(teamIds)
  const filled = new Set(members.map((m) => m.teamId).filter((id): id is string => !!id))
  if (teamIds.some((id) => !filled.has(id))) return 'team-empty'
  if (members.some((m) => !m.teamId || !known.has(m.teamId))) return 'member-unassigned'
  return null
}
