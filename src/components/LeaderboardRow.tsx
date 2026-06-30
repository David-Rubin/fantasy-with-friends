import { useState } from 'react'
import type { AccentColor, Contestant } from '../lib/types'
import { Badge } from './Badge'
import { t } from '../lib/i18n'

const accentBorder: Record<AccentColor, string> = {
  violet: 'border-l-violet-600',
  purple: 'border-l-purple-600',
  pink: 'border-l-pink-600',
  rose: 'border-l-rose-600',
  orange: 'border-l-orange-600',
  amber: 'border-l-amber-500',
  emerald: 'border-l-emerald-600',
  teal: 'border-l-teal-600',
  cyan: 'border-l-cyan-500',
  blue: 'border-l-blue-600',
  indigo: 'border-l-indigo-600',
  slate: 'border-l-slate-600',
}

interface ContestantBreakdown {
  contestant: Contestant
  totalPoints: number
  episodePoints: Record<string, number>
}

interface LeaderboardRowProps {
  rank: number
  teamName: string
  playerName: string
  totalPoints: number
  delta: number | null
  accentColor: AccentColor
  contestants: ContestantBreakdown[]
  episodeNumbers: number[]
}

export function LeaderboardRow({
  rank,
  teamName,
  playerName,
  totalPoints,
  delta,
  accentColor,
  contestants,
  episodeNumbers,
}: LeaderboardRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-xl border-l-4 border border-gray-200 bg-white shadow-sm ${accentBorder[accentColor]}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-xl"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="w-8 text-lg font-bold text-gray-400">#{rank}</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{teamName}</p>
          <p className="text-xs text-gray-500">{playerName}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-gray-900">{totalPoints} pts</p>
          {delta !== null && (
            <p
              className={`text-xs ${delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-400'}`}
            >
              {delta > 0 ? `+${delta}` : delta === 0 ? '—' : delta} this ep
            </p>
          )}
        </div>
        <svg
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {contestants.length === 0 ? (
            <p className="text-sm text-gray-400">No contestants drafted.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-2 font-medium">Contestant</th>
                  {episodeNumbers.map((n) => (
                    <th key={n} className="pb-2 px-2 font-medium text-center">
                      Ep {n}
                    </th>
                  ))}
                  <th className="pb-2 px-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contestants.map(({ contestant, totalPoints: cTotal, episodePoints }) => (
                  <tr
                    key={contestant.id}
                    className={contestant.eliminatedEpisode !== null ? 'opacity-40' : ''}
                  >
                    <td className="py-1.5 pr-2 font-medium text-gray-700">
                      <span>{contestant.name}</span>
                      {contestant.eliminatedEpisode !== null && (
                        <Badge variant="eliminated" aria-label={t('contestant.eliminated')}>
                          {t('contestant.eliminated')}
                        </Badge>
                      )}
                    </td>
                    {episodeNumbers.map((n) => (
                      <td key={n} className="py-1.5 px-2 text-center text-gray-600">
                        {episodePoints[String(n)] ?? '—'}
                      </td>
                    ))}
                    <td className="py-1.5 px-2 text-right font-semibold text-gray-800">{cTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
