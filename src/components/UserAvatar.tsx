import { avatarInitial } from '../lib/initial'
import { accentRing } from './accentStyles'
import { CroppedPhoto } from './CroppedPhoto'
import type { AccentColor, PhotoCrop } from '../lib/types'

const sizes = {
  sm: 'h-8 w-8 text-sm',
  lg: 'h-20 w-20 text-2xl',
} as const

interface UserAvatarProps {
  displayName: string
  /** An uploaded picture. Falls back to the initial when absent. */
  photoUrl?: string
  /** Which part of it to show. Absent means all of it — see CroppedPhoto. */
  photoCrop?: PhotoCrop
  size?: keyof typeof sizes
  /**
   * A team colour to ring the circle in. A ring rather than a border so the
   * picture keeps its size and nothing beside it shifts when one is added.
   */
  ringColor?: AccentColor
}

/**
 * A signed-in person, as a circle: their picture if they have uploaded one,
 * otherwise their initial.
 *
 * Decorative: it always sits beside the name it stands for, so it is hidden
 * from screen readers rather than announcing the same person twice — the same
 * reasoning as ContestantAvatar.
 */
export function UserAvatar({
  displayName,
  photoUrl,
  photoCrop,
  size = 'sm',
  ringColor,
}: UserAvatarProps) {
  return (
    <span
      aria-hidden="true"
      // `relative`, because a cropped photo positions itself against the frame.
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-600 font-semibold text-white ${sizes[size]} ${
        ringColor ? `ring-2 ring-offset-2 ${accentRing[ringColor]}` : ''
      }`}
    >
      {photoUrl ? <CroppedPhoto src={photoUrl} crop={photoCrop} /> : avatarInitial(displayName)}
    </span>
  )
}
