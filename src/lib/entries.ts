import type { AccentColor, SeasonDoc, SeasonMember, SeasonTeam } from './types'

/**
 * Entries: the things a season is played between.
 *
 * In a solo season every member is an entry, and the member document is where
 * its name, colour and pick position live. In team mode the entries are the
 * season's teams, each of which several members play for. Everything the
 * draft and the leaderboard key "by uid" — `pickOrder`, `currentPickerUid`,
 * `draftedByUid`, `teamTotals` — is really keyed by *entry key*: a uid in one
 * mode, a team id in the other. The values are opaque strings compared for
 * equality, so nothing downstream needs to know which, provided it gets the
 * key from here and nowhere else.
 *
 * This module is the one place that decides. It imports nothing that reaches
 * Firebase, so it can be tested, and it is mirrored in functions/src/entries.ts
 * for the same reason the draft arithmetic is: the client's copy decides what
 * the screens show, the server's decides what is written.
 */

export interface Entry {
  /** A uid, or a team id. What every keyed field on the season holds. */
  key: string
  teamName: string
  teamColor?: AccentColor
  pickPosition: number | null
  /**
   * What to call the entry in a sentence — "it's Ada's turn", "it's Team 2's
   * turn". A member's display name in solo mode, the team's name in team mode.
   */
  label: string
  /** One member in solo mode; the team's members in team mode, possibly none. */
  players: SeasonMember[]
}

/** Only `true` switches team mode on — see SeasonDoc.teamMode. */
export function isTeamMode(season: Pick<SeasonDoc, 'teamMode'> | null | undefined): boolean {
  return season?.teamMode === true
}

/**
 * The season's entries, in the order they should be listed before a draft
 * assigns positions: roster order in solo mode, team number in team mode.
 */
export function seasonEntries(
  season: Pick<SeasonDoc, 'teamMode'> | null | undefined,
  members: SeasonMember[],
  teams: SeasonTeam[]
): Entry[] {
  if (!isTeamMode(season)) {
    return members.map((m) => ({
      key: m.uid,
      teamName: m.teamName,
      teamColor: m.teamColor,
      pickPosition: m.pickPosition,
      label: m.displayName,
      players: [m],
    }))
  }
  return [...teams]
    .sort((a, b) => a.number - b.number)
    .map((team) => ({
      key: team.id,
      teamName: team.teamName,
      teamColor: team.teamColor,
      pickPosition: team.pickPosition,
      label: team.teamName,
      players: members.filter((m) => m.teamId === team.id),
    }))
}

/**
 * The key of the entry a member plays for, or null when they play for none —
 * a member in team mode who has not been put on a team yet.
 */
export function entryKeyFor(
  season: Pick<SeasonDoc, 'teamMode'> | null | undefined,
  member: Pick<SeasonMember, 'uid' | 'teamId'> | null | undefined
): string | null {
  if (!member) return null
  if (!isTeamMode(season)) return member.uid
  return member.teamId ?? null
}

export function entryByKey(entries: Entry[], key: string | null | undefined): Entry | undefined {
  if (!key) return undefined
  return entries.find((e) => e.key === key)
}

/**
 * Members on no team, in team mode: never assigned, or assigned to a team
 * that no longer exists. Empty in solo mode, where the question does not
 * arise.
 */
export function unassignedMembers(
  season: Pick<SeasonDoc, 'teamMode'> | null | undefined,
  members: SeasonMember[],
  teams: Pick<SeasonTeam, 'id'>[]
): SeasonMember[] {
  if (!isTeamMode(season)) return []
  const known = new Set(teams.map((t) => t.id))
  return members.filter((m) => !m.teamId || !known.has(m.teamId))
}
