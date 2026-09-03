import type { ReactNode } from 'react'
import type { AccentColor } from '../lib/types'
import { accent } from '../lib/accentColor'

// See accentStyles for why these are spelled out rather than assembled. A
// badge is text on a tint, so it takes the 100 and 800 steps rather than the
// single shade the borders and swatches use.
const accentClasses: Record<AccentColor, string> = {
  violet: 'bg-violet-100 text-violet-800',
  lavender: 'bg-purple-100 text-purple-800',
  pink: 'bg-pink-100 text-pink-800',
  rose: 'bg-rose-100 text-rose-800',
  orange: 'bg-orange-100 text-orange-800',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  sage: 'bg-sage-100 text-sage-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  blue: 'bg-blue-100 text-blue-800',
  brown: 'bg-brown-100 text-brown-800',
  slate: 'bg-slate-100 text-slate-800',
}

interface BadgeProps {
  children: ReactNode
  accent?: AccentColor
  variant?: 'default' | 'eliminated'
}

// The prop is renamed on the way in so it does not shadow the accent() guard —
// a badge is one of the two places a colour straight off a document becomes a
// class name, so it is one of the two places that guard has to be applied.
export function Badge({ children, accent: accentProp, variant = 'default' }: BadgeProps) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  const colorClass =
    variant === 'eliminated'
      ? 'bg-gray-100 text-gray-500'
      : accent
        ? accentClasses[accent(accentProp)]
        : 'bg-gray-100 text-gray-700'

  return <span className={`${base} ${colorClass}`}>{children}</span>
}
