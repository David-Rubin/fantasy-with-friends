/**
 * Handing out and guarding team colours.
 *
 * No two teams in a season may hold the same colour. That is a fact about the
 * whole roster, and a security rule cannot query a collection to establish it —
 * so `teamColor` is closed to clients in firestore.rules and everything that
 * writes it goes through this module's callers in ./index.
 *
 * The palette is duplicated from src/lib/teamColor.ts, which the browser bundle
 * uses: the two trees do not import each other, and src/lib/teamColor.test.ts
 * fails if the lists drift apart.
 */
export type TeamColor =
  | 'violet'
  | 'lavender'
  | 'pink'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'sage'
  | 'cyan'
  | 'blue'
  | 'brown'
  | 'slate'

export const TEAM_COLORS: TeamColor[] = [
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

export function isTeamColor(value: unknown): value is TeamColor {
  return typeof value === 'string' && (TEAM_COLORS as string[]).includes(value)
}

/**
 * A colour for somebody joining: one nobody in the season holds, chosen at
 * random so a roster is not twelve teams in palette order.
 *
 * `random` is injected so the choice can be asserted on; callers pass
 * Math.random.
 *
 * The palette has twelve colours and a league can have more members than that.
 * Once every colour is spoken for there is no unique answer to give, and the
 * least-used colour is a better outcome than a team with no colour at all —
 * uniqueness is a promise this makes where it can keep it, and a deliberate
 * change to a taken colour is still refused (see takenBy).
 */
export function pickTeamColor(taken: TeamColor[], random: () => number = Math.random): TeamColor {
  const counts = new Map<TeamColor, number>(TEAM_COLORS.map((c) => [c, 0]))
  for (const color of taken) {
    if (counts.has(color)) counts.set(color, (counts.get(color) ?? 0) + 1)
  }

  const fewest = Math.min(...counts.values())
  const candidates = TEAM_COLORS.filter((c) => counts.get(c) === fewest)
  return candidates[Math.floor(random() * candidates.length) % candidates.length]
}

/**
 * Which member is holding `color`, ignoring the one asking for it. Null when it
 * is free.
 */
export function takenBy(
  members: { uid: string; teamColor?: string }[],
  color: TeamColor,
  askingUid: string
): string | null {
  const holder = members.find((m) => m.uid !== askingUid && m.teamColor === color)
  return holder ? holder.uid : null
}
