import type { AccentColor } from './types'
import { ACCENT_COLORS, accent } from './accentColor'

/**
 * The rules governing a team's colour, with no Firebase in sight — see
 * ./seasonDetails for why decisions live in modules like this one. The writing
 * is in ./seasonApi, and the constraint itself is in functions/src/index.ts:
 * "no two teams in a season share a colour" is a fact about the whole roster,
 * which a security rule cannot check.
 *
 * The palette is the same one leagues and seasons pick their accent from — see
 * ./accentColor, which is where the list and the retired names live.
 */
export const TEAM_COLORS: AccentColor[] = ACCENT_COLORS

/** The parts of a roster row this module needs. */
export interface TeamColorHolder {
  uid: string
  teamColor?: AccentColor
}

/**
 * Colours somebody else in this season has already claimed.
 *
 * `exceptUid` is the member doing the looking: their own colour is not taken
 * from them, or the picker would show their current choice as unavailable.
 *
 * Only stored colours count. A member whose document predates this field is
 * shown a fallback colour (see teamColorFor) but has claimed nothing, so
 * nobody is blocked from choosing it.
 */
export function takenTeamColors(members: TeamColorHolder[], exceptUid?: string): AccentColor[] {
  return members.filter((m) => m.uid !== exceptUid && m.teamColor).map((m) => accent(m.teamColor))
}

/**
 * A stable colour for a member whose document was written before teams had
 * one.
 *
 * Derived from the uid rather than picked at random so the same team is the
 * same colour on every screen and every reload. It claims nothing and can
 * therefore collide with a colour somebody else holds — the season member
 * trigger fills the real field in the first time anything writes to the
 * document, and this is only what gets drawn until then.
 */
export function fallbackTeamColor(uid: string): AccentColor {
  let hash = 0
  for (let i = 0; i < uid.length; i += 1) {
    hash = (hash * 31 + uid.charCodeAt(i)) % 1_000_003
  }
  return TEAM_COLORS[hash % TEAM_COLORS.length]
}

/** The colour a team is drawn in: what it holds, or its fallback. */
export function teamColorFor(member: TeamColorHolder): AccentColor {
  return member.teamColor ? accent(member.teamColor) : fallbackTeamColor(member.uid)
}

/**
 * The name of the team holding `color`, or undefined when it is free.
 *
 * `exceptUid` is the member doing the looking, for the same reason as in
 * takenTeamColors. Only a stored claim counts: a member drawn in a fallback
 * colour has claimed nothing and cannot make somebody else's swatch
 * unavailable.
 */
export function teamHoldingColor(
  members: (TeamColorHolder & { teamName: string })[],
  color: AccentColor,
  exceptUid?: string
): string | undefined {
  return members.find((m) => m.uid !== exceptUid && m.teamColor && accent(m.teamColor) === color)
    ?.teamName
}
