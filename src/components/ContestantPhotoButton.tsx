import { ContestantAvatar } from './ContestantAvatar'
import type { PhotoCrop } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * A contestant's photo, as the way in to changing it.
 *
 * The picture is the control. Somebody who can see that a face sits badly in
 * its frame is looking at the thing they want to move, so that is what they
 * press — and an empty frame is a control too: it is where a contestant who has
 * never had a photo gets one.
 *
 * Wherever the same frame is only being looked at — by a member, or on a season
 * that is finished — the caller renders ContestantAvatar directly and gets no
 * affordance at all.
 */
export function ContestantPhotoButton({
  name,
  photoUrl,
  photoCrop,
  onClick,
  disabled = false,
}: {
  /** Whose photo this is, for the label a screen reader hears. */
  name: string
  photoUrl: string
  photoCrop?: PhotoCrop
  onClick: () => void
  disabled?: boolean
}) {
  // The avatar is decorative and hidden from screen readers, so without this
  // the button would be announced as an empty one. Which label depends on what
  // pressing it will actually offer.
  const label = t(photoUrl ? 'contestant.adjustPhotoFor' : 'contestant.addPhotoFor', { name })

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      // `cursor-pointer` because the control is a photograph: a button that
      // looks like a button says so by looking like one, and this does not.
      className="shrink-0 cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50"
    >
      <ContestantAvatar photoUrl={photoUrl} photoCrop={photoCrop} />
    </button>
  )
}
