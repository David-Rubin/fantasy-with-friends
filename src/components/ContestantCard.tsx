import type { Contestant } from '../lib/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { t } from '../lib/i18n'

interface ContestantCardProps {
  contestant: Contestant
  ownerName?: string
  canPick?: boolean
  canPickFor?: string // member display name for admin proxy
  onPick?: () => void
  onPickFor?: () => void
}

export function ContestantCard({
  contestant,
  ownerName,
  canPick,
  canPickFor,
  onPick,
  onPickFor,
}: ContestantCardProps) {
  const isDrafted = !!contestant.draftedByUid
  const isEliminated = contestant.eliminatedEpisode !== null

  return (
    <div
      className={[
        'rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity',
        isDrafted || isEliminated ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Photo */}
      <div className="relative h-40 w-full overflow-hidden rounded-t-xl bg-gray-100">
        {contestant.photoUrl ? (
          <img
            src={contestant.photoUrl}
            alt={contestant.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <svg className="h-16 w-16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        )}
        {isEliminated && (
          <div className="absolute top-2 right-2">
            <Badge variant="eliminated">{t('contestant.eliminated')}</Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900">{contestant.name}</h3>
        {contestant.bio && (
          <p className="mt-1 line-clamp-2 text-xs text-gray-500">{contestant.bio}</p>
        )}
        {ownerName && (
          <p className="mt-2 text-xs text-gray-400">{t('contestant.owner', { name: ownerName })}</p>
        )}

        {/* Actions */}
        {(canPick || canPickFor) && !isDrafted && !isEliminated && (
          <div className="mt-3 flex flex-col gap-2">
            {canPick && onPick && (
              <Button onClick={onPick} className="w-full">
                {t('draft.active.pickButton')}
              </Button>
            )}
            {canPickFor && onPickFor && (
              <Button variant="secondary" onClick={onPickFor} className="w-full text-xs">
                {t('draft.active.pickFor', { name: canPickFor })}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
