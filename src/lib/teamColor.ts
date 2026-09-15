import type { AccentColor } from './types'
import { ACCENT_COLORS, accent } from './accentColor'

/**
 * The rules governing a team's colour, with no Firebase in sight — see
 * ./seasonDetails for why decisions live in modules like this one. The writing
 * is in ./seasonApi, and the constraint itself is in functions/src/index.ts:
 * "no two teams in a season share a colour" is a fact about the whole roster,
 * which a security rule cannot check.
 *
 * The palette lives in ./accentColor. Leagues and seasons drew their accent
 * from the same list until that was removed; a team is the only thing with a
 * colour now.
 */
export const TEAM_COLORS: AccentColor[] = ACCENT_COLORS

/**
 * The parts of an entry this module needs. `key` is an entry key — a uid, or a
 * team id in team mode (see ./entries) — so a roster of members and a roster
 * of teams both fit.
 */
export interface TeamColorHolder {
  key: string
  teamColor?: AccentColor
}

/**
 * Colours somebody else in this season has already claimed.
 *
 * `exceptKey` is the entry doing the looking: its own colour is not taken
 * from it, or the picker would show the current choice as unavailable.
 *
 * Only stored colours count. A member whose document predates this field is
 * shown a fallback colour (see teamColorFor) but has claimed nothing, so
 * nobody is blocked from choosing it.
 */
export function takenTeamColors(entries: TeamColorHolder[], exceptKey?: string): AccentColor[] {
  return entries.filter((e) => e.key !== exceptKey && e.teamColor).map((e) => accent(e.teamColor))
}

/**
 * A stable colour for a member whose document was written before teams had
 * one.
 *
 * Derived from the entry key rather than picked at random so the same team is
 * the same colour on every screen and every reload. It claims nothing and can
 * therefore collide with a colour somebody else holds — the season member
 * trigger fills the real field in the first time anything writes to the
 * document, and this is only what gets drawn until then.
 */
export function fallbackTeamColor(key: string): AccentColor {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) % 1_000_003
  }
  return TEAM_COLORS[hash % TEAM_COLORS.length]
}

/** The colour a team is drawn in: what it holds, or its fallback. */
export function teamColorFor(entry: TeamColorHolder): AccentColor {
  return entry.teamColor ? accent(entry.teamColor) : fallbackTeamColor(entry.key)
}

/**
 * The name of the team holding `color`, or undefined when it is free.
 *
 * `exceptKey` is the entry doing the looking, for the same reason as in
 * takenTeamColors. Only a stored claim counts: a member drawn in a fallback
 * colour has claimed nothing and cannot make somebody else's swatch
 * unavailable.
 */
export function teamHoldingColor(
  entries: (TeamColorHolder & { teamName: string })[],
  color: AccentColor,
  exceptKey?: string
): string | undefined {
  return entries.find((e) => e.key !== exceptKey && e.teamColor && accent(e.teamColor) === color)
    ?.teamName
}
