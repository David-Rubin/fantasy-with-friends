import { CroppedPhoto } from './CroppedPhoto'
import type { PhotoCrop } from '../lib/types'

/**
 * A contestant's photo at thumbnail size, for lists that put the picture beside
 * the name rather than above it.
 *
 * Decorative, deliberately: it always sits next to the name it belongs to, so
 * it carries no alt text and is hidden from screen readers. Giving it the name
 * would make every roster row announce the contestant twice.
 *
 * A missing photo falls back to a silhouette rather than collapsing, so the
 * names in the column stay on one vertical line whether or not the cast has
 * pictures.
 */
export function ContestantAvatar({
  photoUrl,
  photoCrop,
}: {
  photoUrl: string
  /** Which part of it to show. Absent means all of it — see CroppedPhoto. */
  photoCrop?: PhotoCrop
}) {
  return (
    <span
      aria-hidden="true"
      // `relative`, because a cropped photo positions itself against the frame.
      className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100"
    >
      {photoUrl ? (
        <CroppedPhoto src={photoUrl} crop={photoCrop} />
      ) : (
        <svg className="h-5 w-5 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
      )}
    </span>
  )
}
