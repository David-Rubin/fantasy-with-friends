import { avatarInitial } from '../lib/initial'

/**
 * A signed-in person's initial in a circle.
 *
 * Decorative: it always sits beside the name it stands for, so it is hidden
 * from screen readers rather than announcing the same person twice — the same
 * reasoning as ContestantAvatar.
 */
export function UserAvatar({ displayName }: { displayName: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
    >
      {avatarInitial(displayName)}
    </span>
  )
}
