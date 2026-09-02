import { t } from '../lib/i18n'
import { UserAvatar } from './UserAvatar'
import type { SeasonWinner } from '../lib/seasonCompletion'

interface ChampionTeam {
  uid: string
  teamName: string
  displayName: string
  photoUrl?: string
}

interface SeasonChampionProps {
  winner: SeasonWinner
  /** The winning teams, in the order they should be read. */
  teams: ChampionTeam[]
}

/** Ribbons, spread across the banner and started at staggered moments. */
const RIBBONS = [
  { left: '6%', delay: '0ms', color: 'bg-amber-400' },
  { left: '18%', delay: '380ms', color: 'bg-blue-500' },
  { left: '31%', delay: '120ms', color: 'bg-emerald-500' },
  { left: '44%', delay: '640ms', color: 'bg-rose-400' },
  { left: '57%', delay: '260ms', color: 'bg-violet-500' },
  { left: '70%', delay: '820ms', color: 'bg-amber-500' },
  { left: '83%', delay: '480ms', color: 'bg-cyan-500' },
  { left: '94%', delay: '180ms', color: 'bg-emerald-400' },
]

/**
 * The banner a closed season opens with.
 *
 * The celebration is deliberately short: the ribbons fall once and stop, and
 * only the trophy keeps moving. This sits above a leaderboard people have come
 * back to read, and a permanent party over the top of it would be something to
 * scroll past rather than something to enjoy.
 *
 * A tie is shared rather than broken — see seasonWinner — so this names every
 * team on the top score and says so.
 */
export function SeasonChampion({ winner, teams }: SeasonChampionProps) {
  if (teams.length === 0) return null

  return (
    <div
      className="champion-banner relative mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-amber-50 px-6 py-6"
      role="status"
    >
      {/* Decorative only: the heading below says who won. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {RIBBONS.map((ribbon, i) => (
          <span
            key={i}
            className={`champion-ribbon absolute top-0 h-3 w-1.5 rounded-full opacity-0 ${ribbon.color}`}
            style={{ left: ribbon.left, animationDelay: ribbon.delay }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-3 text-center">
        <span className="champion-trophy text-4xl" aria-hidden="true">
          {'\u{1F3C6}'}
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          {winner.tied ? t('season.champions') : t('season.champion')}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          {teams.map((team) => (
            <div key={team.uid} className="flex items-center gap-2">
              <UserAvatar displayName={team.displayName} photoUrl={team.photoUrl} />
              <div className="text-left">
                <p className="font-semibold text-gray-900">{team.teamName}</p>
                <p className="text-xs text-gray-500">{team.displayName}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-600">{t('season.championPoints', { n: winner.points })}</p>
      </div>
    </div>
  )
}
