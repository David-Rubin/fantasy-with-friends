import { UserAvatar } from './UserAvatar'
import type { AccentColor, PhotoCrop } from '../lib/types'
import { t } from '../lib/i18n'

/** The parts of a member an entry's player list needs. */
export interface EntryPlayer {
  uid: string
  displayName: string
  photoUrl?: string
  photoCrop?: PhotoCrop
}

/**
 * The people behind an entry, as a row of circles.
 *
 * One circle in a solo season, which is what every roster row was before
 * teams; several, overlapping, for a team. Overlapping rather than spaced so a
 * team of three takes the room of about two and the columns beside it stay
 * where they are. Decorative, as UserAvatar is — the names are always written
 * out beside it.
 */
export function PlayerAvatars({
  players,
  ringColor,
  size,
}: {
  players: EntryPlayer[]
  ringColor?: AccentColor
  size?: 'xs' | 'sm' | 'lg'
}) {
  if (players.length === 0) return null
  return (
    <span className="flex shrink-0 -space-x-2">
      {players.map((p) => (
        <UserAvatar
          key={p.uid}
          displayName={p.displayName}
          photoUrl={p.photoUrl}
          photoCrop={p.photoCrop}
          ringColor={ringColor}
          size={size}
        />
      ))}
    </span>
  )
}

/** "Ada Owner, Bob Member" — the players of an entry, as one line of text. */
export function playerNames(players: { displayName: string }[]): string {
  return players.map((p) => p.displayName).join(t('team.playersJoiner'))
}
