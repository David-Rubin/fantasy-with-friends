import type { AccentColor } from '../lib/types'

/**
 * The palette as Tailwind class names.
 *
 * Spelled out rather than built from a template, because Tailwind reads the
 * source for literal class names and generates only what it finds — a class
 * assembled as `border-l-${color}-600` exists at runtime and nowhere in the
 * stylesheet, which is a border that silently does not appear.
 *
 * One shade per colour across all four maps, so a team's dot, its border, its
 * row edge and the ring round its avatar are the same colour rather than four
 * near-misses. The shade is not the same number for every colour: amber and
 * cyan go muddy at 600, and lavender and pink are only lavender and pink at
 * 400 — the point is that they look right beside each other, not that they
 * share an index.
 *
 * `brown` and `sage` are not Tailwind colours; they are declared in
 * src/index.css.
 */
export const accentLeftBorder: Record<AccentColor, string> = {
  violet: 'border-l-violet-600',
  lavender: 'border-l-purple-400',
  pink: 'border-l-pink-400',
  rose: 'border-l-rose-600',
  orange: 'border-l-orange-600',
  amber: 'border-l-amber-500',
  emerald: 'border-l-emerald-600',
  sage: 'border-l-sage-500',
  cyan: 'border-l-cyan-500',
  blue: 'border-l-blue-600',
  brown: 'border-l-brown-500',
  slate: 'border-l-slate-600',
}

export const accentBorder: Record<AccentColor, string> = {
  violet: 'border-violet-600',
  lavender: 'border-purple-400',
  pink: 'border-pink-400',
  rose: 'border-rose-600',
  orange: 'border-orange-600',
  amber: 'border-amber-500',
  emerald: 'border-emerald-600',
  sage: 'border-sage-500',
  cyan: 'border-cyan-500',
  blue: 'border-blue-600',
  brown: 'border-brown-500',
  slate: 'border-slate-600',
}

export const accentBg: Record<AccentColor, string> = {
  violet: 'bg-violet-600',
  lavender: 'bg-purple-400',
  pink: 'bg-pink-400',
  rose: 'bg-rose-600',
  orange: 'bg-orange-600',
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-600',
  sage: 'bg-sage-500',
  cyan: 'bg-cyan-500',
  blue: 'bg-blue-600',
  brown: 'bg-brown-500',
  slate: 'bg-slate-600',
}

export const accentRing: Record<AccentColor, string> = {
  violet: 'ring-violet-600',
  lavender: 'ring-purple-400',
  pink: 'ring-pink-400',
  rose: 'ring-rose-600',
  orange: 'ring-orange-600',
  amber: 'ring-amber-500',
  emerald: 'ring-emerald-600',
  sage: 'ring-sage-500',
  cyan: 'ring-cyan-500',
  blue: 'ring-blue-600',
  brown: 'ring-brown-500',
  slate: 'ring-slate-600',
}
