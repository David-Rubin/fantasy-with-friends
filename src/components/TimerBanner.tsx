import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'

interface TimerBannerProps {
  pickerName: string
  pickerAvatarUrl?: string
  timerExpiresAt: number | null
  durationSeconds: number
  isYourTurn: boolean
}

/** What the clock reads now. `durationSeconds` stands in when it is not running. */
function remainingSeconds(expiresAt: number | null, durationSeconds: number): number {
  if (!expiresAt) return durationSeconds
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
}

export function TimerBanner({
  pickerName,
  timerExpiresAt,
  durationSeconds,
  isYourTurn,
}: TimerBannerProps) {
  // Seeded from the deadline, not from the full duration.
  //
  // This banner is unmounted while the clock is stopped — the paused state
  // renders a different block — so resuming mounts it afresh. Starting at the
  // duration meant the first paint was a full bar whatever the clock actually
  // said; the effect then corrected it a frame later and the width transition
  // animated the difference, so every resume swept the bar down from full to
  // where it had been paused. Computed here, the first paint is already right,
  // and a bar that is right on its first paint has nothing to animate from.
  const [secondsLeft, setSecondsLeft] = useState<number>(() =>
    remainingSeconds(timerExpiresAt, durationSeconds)
  )

  /**
   * The countdown, on a timer rather than a frame loop.
   *
   * requestAnimationFrame is not paced for this: it ran sixty times a second to
   * move a number that changes once a second. Both are throttled while the tab
   * is hidden — frames stop altogether, timers slow to as little as one a
   * minute — so neither keeps a backgrounded clock live, and each recomputes
   * from the deadline on the first tick back, which is what makes that
   * harmless. The saving is on the tab someone is actually watching.
   *
   * Every 250ms so the displayed second turns over promptly, wherever in the
   * second the deadline happens to fall.
   */
  useEffect(() => {
    if (!timerExpiresAt) return
    const id = setInterval(
      () => setSecondsLeft(remainingSeconds(timerExpiresAt, durationSeconds)),
      250
    )
    return () => clearInterval(id)
  }, [timerExpiresAt, durationSeconds])

  const pct = timerExpiresAt ? (secondsLeft / durationSeconds) * 100 : 100
  const isLow = secondsLeft <= 10
  const isCritical = secondsLeft <= 5

  const barColor = isCritical ? 'bg-red-500' : isLow ? 'bg-amber-500' : 'bg-blue-500'

  const bannerBg = isCritical
    ? 'bg-red-50 border-red-200'
    : isLow
      ? 'bg-amber-50 border-amber-200'
      : 'bg-blue-50 border-blue-200'

  return (
    <div className={`rounded-xl border px-4 py-3 ${bannerBg}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-800">
          {isYourTurn
            ? t('draft.active.youArePicking')
            : t('draft.active.nowPicking', { name: pickerName })}
        </span>
        {timerExpiresAt && (
          <span
            className={`text-sm font-mono font-bold ${isCritical ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-blue-600'}`}
          >
            {t('draft.active.timeRemaining', { n: secondsLeft })}
          </span>
        )}
      </div>
      {timerExpiresAt && (
        <div
          className="h-2 w-full rounded-full bg-gray-200 overflow-hidden"
          role="progressbar"
          aria-valuenow={secondsLeft}
          aria-valuemin={0}
          aria-valuemax={durationSeconds}
          aria-label={t('draft.active.timeRemaining', { n: secondsLeft })}
        >
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{
              width: `${pct}%`,
              transition: 'width 1s linear',
            }}
          />
        </div>
      )}
    </div>
  )
}
