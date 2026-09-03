import { Badge, type BadgeTone } from './Badge'
import type { SeasonState } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * Where a season has got to, as a pill.
 *
 * The colour comes from the state itself. It used to come from an accent the
 * season's creator picked, which meant the pill said "Active" in whatever
 * colour somebody chose months ago — so two seasons at the same stage looked
 * different and one season looked the same at every stage. A status badge that
 * takes its colour from its status is the thing this always wanted to be.
 *
 * Wording and colour are decided together here rather than at each of the three
 * places this appears, which is what stops them drifting apart.
 */
const tones: Record<SeasonState, BadgeTone> = {
  setup: 'neutral',
  draft: 'info',
  active: 'success',
  complete: 'muted',
}

export function SeasonStateBadge({ state }: { state: SeasonState }) {
  return <Badge tone={tones[state]}>{t(`season.states.${state}`)}</Badge>
}
