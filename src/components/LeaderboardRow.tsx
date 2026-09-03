import { useState } from 'react'
import type { AccentColor, Contestant } from '../lib/types'
import { Badge } from './Badge'
import { t } from '../lib/i18n'
import { UserAvatar } from './UserAvatar'
import { accentLeftBorder } from './accentStyles'

interface ContestantBreakdown {
  contestant: Contestant
  /** Everything this contestant has earned their team this season. */
  seasonTotal: number
  /** Null when no episode has been scored yet; 0 means they scored nothing. */
  latestEpisodePoints: number | null
}

interface LeaderboardRowProps {
  rank: number
  teamName: string
  playerName: string
  /** The player's picture, when they have uploaded one. */
  playerPhotoUrl?: string
  totalPoints: number
  delta: number | null
  /**
   * The team's own colour, not the season's. Every row on this board is a
   * different colour, which is what makes a team recognisable at a glance
   * here and on every other panel of the season.
   */
  teamColor: AccentColor
  contestants: ContestantBreakdown[]
  /** The episode "Latest Episode" refers to, or null before any are scored. */
  latestEpisodeNumber: number | null
}

export function LeaderboardRow({
  rank,
  teamName,
  playerName,
  playerPhotoUrl,
  totalPoints,
  delta,
  teamColor,
  contestants,
  latestEpisodeNumber,
}: LeaderboardRowProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`rounded-xl border-l-4 border border-gray-200 bg-white shadow-sm ${accentLeftBorder[teamColor]}`}
    >
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 rounded-xl"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
      >
        <span className="w-8 text-lg font-bold text-gray-400">#{rank}</span>
        <UserAvatar displayName={playerName} photoUrl={playerPhotoUrl} ringColor={teamColor} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{teamName}</p>
          <p className="text-xs text-gray-500 truncate">{playerName}</p>
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
            <p className="text-sm text-gray-400">{t('leaderboard.noContestants')}</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400">
                  <th className="pb-2 font-medium">{t('leaderboard.contestant')}</th>
                  {/* One column, not one per episode. A column per episode grew
                      with the season until the card was unreadable, and what a
                      reader wants from a breakdown is what just happened and
                      what it adds up to. */}
                  <th className="pb-2 px-2 font-medium text-right">
                    {t('leaderboard.latestEpisode')}
                    {latestEpisodeNumber !== null && (
                      <span className="block font-normal text-gray-300">
                        {t('nav.episode', { n: latestEpisodeNumber })}
                      </span>
                    )}
                  </th>
                  <th className="pb-2 px-2 font-medium text-right">
                    {t('leaderboard.seasonTotal')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {contestants.map(({ contestant, seasonTotal, latestEpisodePoints }) => (
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
                    <td className="py-1.5 px-2 text-right text-gray-600">
                      {latestEpisodePoints ?? '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-semibold text-gray-800">
                      {seasonTotal}
                    </td>
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
