import type { AccentColor } from '../lib/types'
import { accentBg } from './accentStyles'
import { t } from '../lib/i18n'

interface TeamColorDotProps {
  color: AccentColor
  /** The team it belongs to, for the label a screen reader gets. */
  teamName: string
}

/**
 * A team's colour where there is no edge to put it on.
 *
 * Most places a team appears get its colour as a border — a leaderboard row, a
 * roster card. A table cell has no border of its own to spare, so it gets this
 * instead: same colour, same meaning, one line high.
 *
 * The colour is decoration to anyone who can see it and nothing at all to
 * anyone who cannot, so the dot itself is hidden from the accessibility tree
 * and carries the team's name as text beside it instead.
 */
export function TeamColorDot({ color, teamName }: TeamColorDotProps) {
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full ${accentBg[color]}`}
      title={t('team.color.of', { team: teamName })}
      aria-hidden="true"
    />
  )
}
