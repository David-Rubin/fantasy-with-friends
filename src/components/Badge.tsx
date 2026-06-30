import type { ReactNode } from 'react'
import type { AccentColor } from '../lib/types'

const accentClasses: Record<AccentColor, string> = {
  violet: 'bg-violet-100 text-violet-800',
  purple: 'bg-purple-100 text-purple-800',
  pink: 'bg-pink-100 text-pink-800',
  rose: 'bg-rose-100 text-rose-800',
  orange: 'bg-orange-100 text-orange-800',
  amber: 'bg-amber-100 text-amber-800',
  emerald: 'bg-emerald-100 text-emerald-800',
  teal: 'bg-teal-100 text-teal-800',
  cyan: 'bg-cyan-100 text-cyan-800',
  blue: 'bg-blue-100 text-blue-800',
  indigo: 'bg-indigo-100 text-indigo-800',
  slate: 'bg-slate-100 text-slate-800',
}

interface BadgeProps {
  children: ReactNode
  accent?: AccentColor
  variant?: 'default' | 'eliminated'
}

export function Badge({ children, accent, variant = 'default' }: BadgeProps) {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
  const colorClass =
    variant === 'eliminated'
      ? 'bg-gray-100 text-gray-500'
      : accent
        ? accentClasses[accent]
        : 'bg-gray-100 text-gray-700'

  return <span className={`${base} ${colorClass}`}>{children}</span>
}
