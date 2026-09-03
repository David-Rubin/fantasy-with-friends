import type { AccentColor } from './types'

/**
 * The one palette leagues, seasons and teams all pick from.
 *
 * Twelve colours chosen to stay apart from one another at the sizes they are
 * actually seen at: a 32px swatch, a 4px border down the side of a row, a ring
 * around an avatar. Colours that read as the same at that size are worse than
 * useless here, because a team's colour is how it is picked out of a list.
 *
 * functions/src/teamColor.ts carries the same list for the server side of the
 * uniqueness check; src/lib/teamColor.test.ts asserts the two still agree.
 */
export const ACCENT_COLORS: AccentColor[] = [
  'violet',
  'lavender',
  'pink',
  'rose',
  'orange',
  'amber',
  'emerald',
  'sage',
  'cyan',
  'blue',
  'brown',
  'slate',
]

/** What anything unrecognised is drawn in. */
export const DEFAULT_ACCENT: AccentColor = 'blue'

/**
 * A stored accent colour, as one of the twelve.
 *
 * A team's colour is a plain string in Firestore, and the palette has been
 * changed once since teams got one: lavender, sage and brown
 * replaced three colours too close to their neighbours to tell apart. Nothing
 * went back and rewrote those documents, and nothing translates the old names
 * either — a name the palette no longer offers is a name that should not be in
 * the codebase, and rewriting live data to avoid three lines of code is a poor
 * trade.
 *
 * This is what makes that safe. A value the palette does not know reaches a
 * class map as `undefined` and draws no colour at all, which looks like a bug;
 * it gets the default instead, so the worst a stale record can do is be the
 * wrong colour. That also covers a document edited by hand or restored from a
 * backup, which a one-off migration would not have.
 *
 * Applied inside AccentColorPicker and in ./teamColor, which between them are
 * every place a stored colour turns into a class name. A badge no longer takes
 * one: it colours itself from what it is saying — see SeasonStateBadge.
 */
export function accent(color: AccentColor | string | undefined | null): AccentColor {
  return ACCENT_COLORS.includes(color as AccentColor) ? (color as AccentColor) : DEFAULT_ACCENT
}
