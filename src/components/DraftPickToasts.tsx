import { useEffect } from 'react'
import { CroppedPhoto } from './CroppedPhoto'
import { CONTESTANT_CROP_SHAPE } from '../lib/photoCrop'
import { DRAFT_TOAST_MS, type DraftToast } from '../lib/draftToast'
import { t } from '../lib/i18n'

/**
 * The announcement every screen in a draft gets the moment somebody picks.
 *
 * What raises one is in src/lib/draftToast.ts; this is only the showing of it.
 * Two things about the placement are load-bearing:
 *
 * The stack is `fixed` and its container takes no pointer events, only the
 * cards do. A toast that swallowed clicks across the bottom of the screen
 * would have covered the pick buttons on a phone for five seconds after every
 * pick — which is the one thing a draft cannot afford, since the clock is
 * still running underneath it. Nothing here touches the timer: the countdown
 * is the draft document's deadline, read by TimerBanner, and a toast neither
 * writes to it nor unmounts the banner.
 *
 * It is full width at the bottom on a phone and a column in the corner from
 * `sm` up, with the safe-area inset added so it clears the home indicator.
 * The dismiss button is a full-height 44px target inside the card rather than
 * a corner cross, because a cross small enough to sit in a toast's corner is
 * smaller than a thumb.
 */
export function DraftPickToasts({
  toasts,
  onDismiss,
}: {
  toasts: DraftToast[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      // `polite`, not `alert`: a pick is news, not an emergency, and an
      // assertive region would cut across whatever a screen reader was
      // already reading out about the contestant list.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-3 pb-3 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end sm:px-0 sm:pb-0"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastCard({ toast, onDismiss }: { toast: DraftToast; onDismiss: (id: string) => void }) {
  /**
   * The toast retires itself. Keyed on the contestant id so a second toast
   * arriving does not restart this one's five seconds, and cleared on unmount
   * so dismissing by hand cannot leave a timer to fire against a gone card.
   */
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), DRAFT_TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const message = toast.mine
    ? t('draft.toast.yours', { contestant: toast.contestantName })
    : t('draft.toast.drafted', { contestant: toast.contestantName, team: toast.teamName })

  return (
    <div
      className={[
        'draft-toast pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl border shadow-lg',
        // The viewer's own pick is worth telling apart from everyone else's at
        // a glance, before the sentence has been read.
        toast.mine ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white',
      ].join(' ')}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          aria-hidden="true"
          style={{ aspectRatio: CONTESTANT_CROP_SHAPE.aspect }}
          // `relative`, because a cropped photo positions itself against the
          // frame it is given. Same shape as the draft board's card, so this
          // is that photo made small and not a different crop of it.
          className="draft-toast-photo relative flex h-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100"
        >
          {toast.photoUrl ? (
            <CroppedPhoto src={toast.photoUrl} crop={toast.photoCrop} />
          ) : (
            <svg className="h-7 w-7 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{toast.contestantName}</p>
          {/* Wraps rather than truncating: the team's name is the point of the
              sentence, and a long one cut off mid-word says nothing. */}
          <p className="mt-0.5 text-sm text-gray-600">{message}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="min-h-[44px] w-full cursor-pointer border-t border-gray-200 px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
      >
        {t('draft.toast.dismiss')}
      </button>
    </div>
  )
}
