import { useEffect, useRef, useState } from 'react'
import { t } from '../lib/i18n'

interface TimerBannerProps {
  pickerName: string
  pickerAvatarUrl?: string
  timerExpiresAt: number | null
  durationSeconds: number
  isYourTurn: boolean
}

export function TimerBanner({
  pickerName,
  timerExpiresAt,
  durationSeconds,
  isYourTurn,
}: TimerBannerProps) {
  const [secondsLeft, setSecondsLeft] = useState<number>(durationSeconds)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!timerExpiresAt) return
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [timerExpiresAt])

  const pct = timerExpiresAt ? (secondsLeft / durationSeconds) * 100 : 100
  const isLow = secondsLeft <= 10
  const isCritical = secondsLeft <= 5

  const barColor = isCritical
    ? 'bg-red-500'
    : isLow
      ? 'bg-amber-500'
      : 'bg-blue-500'

  const bannerBg = isCritical
    ? 'bg-red-50 border-red-200'
    : isLow
      ? 'bg-amber-50 border-amber-200'
      : 'bg-blue-50 border-blue-200'

  return (
    <div className={`rounded-xl border px-4 py-3 ${bannerBg}`} role="status" aria-live="polite">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-gray-800">
          {isYourTurn ? t('draft.active.youArePicking') : t('draft.active.nowPicking', { name: pickerName })}
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
