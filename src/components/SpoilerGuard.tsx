import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { t } from '../lib/i18n'
import type { SpoilerHorizon, SpoilerPhase } from '../lib/spoilers'

/**
 * How long the check may take before it says so. Under this it passes for the
 * page loading, which it is part of; a message that flashed up and vanished on
 * every visit would be noise.
 */
const CHECK_NOTICE_DELAY_MS = 400

function useElapsed(running: boolean, ms: number): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!running) return
    const timer = setTimeout(() => setElapsed(true), ms)
    return () => {
      clearTimeout(timer)
      setElapsed(false)
    }
  }, [running, ms])
  return running && elapsed
}

/**
 * The part of a page that can give a result away, blurred while the viewer is
 * being asked about it or while the check is still running.
 *
 * What is under the blur is never the result: a guarded page is drawn as of
 * where the viewer is caught up to (see viewThrough), so this is a veil over
 * the season they have already seen, not over the spoiler. `inert` takes it
 * out of the tab order and away from the pointer and screen readers alike.
 */
export function SpoilerShield({ phase, children }: { phase: SpoilerPhase; children: ReactNode }) {
  const veiled = phase === 'checking' || phase === 'prompt'
  const slow = useElapsed(phase === 'checking', CHECK_NOTICE_DELAY_MS)

  return (
    <div className="relative" aria-busy={phase === 'checking'}>
      <div
        inert={veiled}
        className={veiled ? 'pointer-events-none select-none blur-md transition-[filter]' : ''}
      >
        {children}
      </div>
      {slow && (
        <div className="absolute inset-0 flex items-start justify-center pt-12">
          <p
            role="status"
            className="rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow"
          >
            {t('spoilers.checking')}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The question asked on arrival when something has been scored past where the
 * viewer is caught up to.
 *
 * Closing it any other way — Escape, the cross, the backdrop — counts as "not
 * yet". Somebody dismissing a dialog without reading it has not told us they
 * watched anything.
 */
export function SpoilerPrompt({
  open,
  horizon,
  busy,
  onConfirm,
  onDecline,
}: {
  open: boolean
  horizon: SpoilerHorizon | null
  busy: boolean
  onConfirm: () => void
  onDecline: () => void
}) {
  // Held through the closing fade: the horizon goes the moment the viewer
  // catches up, and the dialog would otherwise empty itself on the way out.
  const [shown, setShown] = useState(horizon)
  if (horizon && (horizon.through !== shown?.through || horizon.kind !== shown?.kind)) {
    setShown(horizon)
  }
  const n = shown?.through ?? 0

  return (
    <Modal
      open={open}
      onClose={onDecline}
      title={t('spoilers.prompt.title')}
      footer={
        <>
          <Button variant="secondary" onClick={onDecline}>
            {t('spoilers.prompt.notCaughtUp')}
          </Button>
          <Button loading={busy} onClick={onConfirm}>
            {t('spoilers.prompt.caughtUp', { n })}
          </Button>
        </>
      }
    >
      <p className="text-gray-600">
        {t(shown?.kind === 'suggested' ? 'spoilers.prompt.suggested' : 'spoilers.prompt.scored', {
          n,
        })}
      </p>
    </Modal>
  )
}

/**
 * The standing notice while a viewer is looking at the season as it was.
 *
 * Persistent — there is no dismiss — because it is the only thing on the page
 * saying that what is on it is out of date. `message` carries a `{refresh}`
 * placeholder where the control goes, so a translation can put it wherever its
 * sentence needs it.
 *
 * Fixed to the bottom of the screen, one layer below a dialog as the draft's
 * toasts are, with a spacer in the page's own flow the same height so the last
 * thing on the page is never stuck underneath it.
 */
export function SpoilerToast({
  message,
  busy,
  onRefresh,
}: {
  message: string
  busy: boolean
  onRefresh: () => void
}) {
  const [before, after = ''] = message.split('{refresh}')

  return (
    <>
      <div aria-hidden="true" className="h-28" />
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <p
          role="status"
          className="pointer-events-auto w-full max-w-md rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-lg"
        >
          {before}
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="cursor-pointer rounded font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60"
          >
            {t('spoilers.toast.refresh')}
          </button>
          {after}
        </p>
      </div>
    </>
  )
}
