import { useCallback, useLayoutEffect, useState } from 'react'
import type { Contestant } from '../lib/types'
import { Badge } from './Badge'
import { Button } from './Button'
import { t } from '../lib/i18n'
import { useTooltipDisclosure } from '../lib/useTooltipDisclosure'

/**
 * A contestant's bio, clipped to two lines, with the whole of it on hover.
 *
 * The card has to stay a fixed, scannable size on a draft board of twenty, but
 * a bio runs to 300 characters and a pick is made on what it says. So: two
 * lines on the card, the rest in a panel.
 *
 * The panel opens *upward*. Below the bio sit the Pick buttons, and covering an
 * irreversible action with a floating panel — on a page with a running clock —
 * is how somebody drafts the wrong person.
 *
 * It is only interactive when the text is actually clipped, measured rather
 * than guessed from the character count: how much fits depends on the column
 * width, and a short bio that opened a panel repeating itself would be an
 * affordance promising something it does not have.
 */
function ContestantBio({ contestant }: { contestant: Contestant }) {
  const { open, id, wrapRef, triggerProps } = useTooltipDisclosure<HTMLDivElement>()
  const [clipped, setClipped] = useState(false)

  // A callback ref rather than useRef: the clamped paragraph is measured the
  // moment it exists, and again whenever the card is resized.
  const [bioEl, setBioEl] = useState<HTMLParagraphElement | null>(null)
  const measure = useCallback(() => {
    if (bioEl) setClipped(bioEl.scrollHeight > bioEl.clientHeight + 1)
  }, [bioEl])

  useLayoutEffect(() => {
    if (!bioEl) return
    // No initial measure() call: observing fires the callback once straight
    // away, which is the first measurement.
    const observer = new ResizeObserver(measure)
    observer.observe(bioEl)
    return () => observer.disconnect()
  }, [bioEl, measure])

  const clampedBio = (
    <p
      ref={setBioEl}
      // pre-wrap so the line breaks the author typed survive: HTML otherwise
      // collapses them and runs the whole bio together.
      className="line-clamp-2 whitespace-pre-wrap text-left text-xs text-gray-500"
    >
      {contestant.bio}
    </p>
  )

  if (!clipped) return <div className="mt-1">{clampedBio}</div>

  return (
    <div ref={wrapRef} className="relative mt-1">
      <button
        // Never a submit button, and never the card's own Pick: this only
        // reveals text.
        type="button"
        aria-label={t('contestant.readBio', { name: contestant.name })}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        className="block w-full cursor-help rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        {...triggerProps}
      >
        {clampedBio}
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute bottom-full left-0 z-30 mb-2 max-h-48 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-900 px-3 py-2 text-left text-xs leading-snug text-white shadow-lg"
        >
          {contestant.bio}
        </div>
      )}
    </div>
  )
}

interface ContestantCardProps {
  contestant: Contestant
  ownerName?: string
  canPick?: boolean
  canPickFor?: string // member display name for admin proxy
  onPick?: () => void
  onPickFor?: () => void
  /**
   * A smaller card, for the season setup panel. Same card, less of it: setup
   * shows the whole cast at once to check it over, where the draft board shows
   * a few at a time to choose between.
   */
  compact?: boolean
  /** Renders an Edit control. Setup only — a drafted cast is settled. */
  onEdit?: () => void
}

export function ContestantCard({
  contestant,
  ownerName,
  canPick,
  canPickFor,
  onPick,
  onPickFor,
  compact,
  onEdit,
}: ContestantCardProps) {
  const isDrafted = !!contestant.draftedByUid
  const isEliminated = contestant.eliminatedEpisode !== null

  return (
    <div
      className={[
        'rounded-xl border border-gray-200 bg-white shadow-sm transition-opacity',
        // Equal heights across a row, with the Edit button pinned to the
        // bottom: a cast with bios of different lengths otherwise leaves the
        // buttons at five different heights. Compact only — the draft board is
        // left exactly as it was.
        compact ? 'flex h-full flex-col' : '',
        isDrafted || isEliminated ? 'opacity-50' : '',
      ].join(' ')}
    >
      {/* Photo */}
      <div
        className={[
          'relative w-full overflow-hidden rounded-t-xl bg-gray-100',
          compact ? 'h-24' : 'h-40',
        ].join(' ')}
      >
        {contestant.photoUrl ? (
          <img
            src={contestant.photoUrl}
            alt={contestant.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300">
            <svg
              className={compact ? 'h-10 w-10' : 'h-16 w-16'}
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
            </svg>
          </div>
        )}
        {isEliminated && (
          <div className="absolute top-2 right-2">
            <Badge tone="eliminated">{t('contestant.eliminated')}</Badge>
          </div>
        )}
      </div>

      {/* Info */}
      <div className={compact ? 'flex flex-1 flex-col p-3' : 'p-4'}>
        <h3 className={['font-semibold text-gray-900', compact ? 'text-sm' : ''].join(' ')}>
          {contestant.name}
        </h3>
        {contestant.bio && <ContestantBio contestant={contestant} />}
        {ownerName && (
          <p className="mt-2 text-xs text-gray-400">{t('contestant.owner', { name: ownerName })}</p>
        )}

        {onEdit && (
          <Button
            variant="secondary"
            onClick={onEdit}
            className="mt-auto w-full pt-2 !min-h-0 !px-3 !py-1 text-xs"
          >
            {t('common.edit')}
          </Button>
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
