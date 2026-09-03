import type { ReactNode } from 'react'

/**
 * The tones a badge comes in.
 *
 * Named for what they mean rather than for a colour, so a badge is asked for
 * the thing it is saying and the palette stays this file's business. Anything
 * that needs a *team's* colour is not a badge — see accentStyles.
 */
const tones = {
  /** Nothing in particular. Also what a badge with no tone gets. */
  neutral: 'bg-gray-100 text-gray-700',
  /** Under way, and worth glancing at. */
  info: 'bg-blue-100 text-blue-800',
  /** Running normally. */
  success: 'bg-emerald-100 text-emerald-800',
  /** Finished, or otherwise no longer moving. */
  muted: 'bg-slate-100 text-slate-800',
  /** Out of the running — dimmer than muted, because it marks a loss. */
  eliminated: 'bg-gray-100 text-gray-500',
} as const

export type BadgeTone = keyof typeof tones

interface BadgeProps {
  children: ReactNode
  tone?: BadgeTone
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
