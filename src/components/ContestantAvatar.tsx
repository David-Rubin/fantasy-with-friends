import { CroppedPhoto } from './CroppedPhoto'
import { CONTESTANT_CROP_SHAPE } from '../lib/photoCrop'
import type { PhotoCrop } from '../lib/types'

/**
 * A contestant's photo at thumbnail size, for lists that put the picture beside
 * the name rather than above it.
 *
 * Shaped from the same constant as the card on the draft board, so this is that
 * card's photo made smaller and nothing else: the frame is the shape a
 * contestant is cropped to, which means CroppedPhoto's covering box lands
 * exactly on the frame and the picture is drawn at the zoom and offset somebody
 * chose. A round frame here would have cover-fitted that crop into a circle —
 * still a correct rendering, but a tighter one, and the roster and the board
 * would disagree about what a contestant's photo looks like.
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
      // The height is fixed and the width follows from the ratio, so a roster's
      // rows all stand the same height whatever the pictures are.
      style={{ aspectRatio: CONTESTANT_CROP_SHAPE.aspect }}
      // `relative`, because a cropped photo positions itself against the frame.
      className="relative flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100"
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
