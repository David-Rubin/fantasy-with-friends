import { ContestantCard, type ContestantCardProps } from './ContestantCard'
import type { Contestant } from '../lib/types'

/** What a caller may set per card. The contestant and the density are ours. */
type ExtraCardProps = Omit<ContestantCardProps, 'contestant' | 'compact'>

/** The board's section heading: the draft room's own, and the lobby's. */
const BOARD_HEADING = 'mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500'

/**
 * A headed grid of contestant cards.
 *
 * The card was already shared; the grid around it was not, and three copies had
 * drifted — the draft board ran three to a row at `gap-4`, the setup panel five
 * at `gap-3`, and each picked its column count independently of the card size it
 * was passing. Here `compact` decides both, so the denser grid and the smaller
 * card cannot come apart again.
 *
 * `cardProps` rather than a prop per feature: the lobby wants a plain read-only
 * card, the draft board wants pick handlers that depend on whose turn it is, and
 * the setup panel wants an Edit button. Threading all of those through would make
 * this grid know about drafting, which it has no reason to.
 *
 * Typography is the caller's, because these headings do not all belong to the
 * same page furniture: the board's are small grey capitals over a full-width
 * grid, while the setup panel's sit in a column beside "Scoring rules" and
 * "Draft settings" and have to match those rather than the board.
 */
export function ContestantGrid({
  heading,
  contestants,
  compact = false,
  cardProps,
  headingClassName = BOARD_HEADING,
  className = '',
}: {
  /** Already translated, count included. */
  heading: string
  contestants: Contestant[]
  /** Smaller cards, more of them to a row. See ContestantCard.compact. */
  compact?: boolean
  cardProps?: (contestant: Contestant) => ExtraCardProps
  headingClassName?: string
  className?: string
}) {
  return (
    <section className={className}>
      <h3 className={headingClassName}>{heading}</h3>
      <div
        className={
          compact
            ? 'grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5'
            : 'grid grid-cols-2 gap-4 sm:grid-cols-3'
        }
      >
        {contestants.map((contestant) => (
          <ContestantCard
            key={contestant.id}
            contestant={contestant}
            compact={compact}
            {...cardProps?.(contestant)}
          />
        ))}
      </div>
    </section>
  )
}
