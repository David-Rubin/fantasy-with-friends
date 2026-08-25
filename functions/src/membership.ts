/**
 * What removing someone from a league does to their season memberships.
 *
 * Kept apart from Firestore so the rule itself is testable: the interesting
 * part is not the deleting, it is deciding which seasons block a removal and
 * which ones quietly let go.
 */

export type SeasonState = 'setup' | 'draft' | 'active' | 'complete'

export interface MemberSeason {
  id: string
  state: SeasonState
  /** For the error message when a season blocks the removal. */
  label: string
}

export interface RemovalPlan {
  /** Seasons underway. Their presence means the member cannot be removed. */
  blocking: MemberSeason[]
  /** Seasons the member should be dropped from along with the league. */
  leaving: MemberSeason[]
  /** Seasons the member stays in even after leaving the league. */
  keeping: MemberSeason[]
}

/**
 * Sort a member's seasons into the three outcomes a removal can have.
 *
 * A season that is drafting or active blocks removal outright. Pick order is
 * fixed to a list of uids when the draft is randomized, and episode scores are
 * keyed by uid; deleting a member out from under either leaves a draft that
 * cannot complete or a leaderboard with a hole in it. The owner has to wait for
 * the season to finish.
 *
 * A season still in `setup` has none of that state yet, so the member leaves it
 * with the league — the mirror of joining, which enrolls a new member in exactly
 * these seasons.
 *
 * A `complete` season is history and is deliberately left alone. Their team and
 * their scores are part of a result other people played for, and removing
 * someone from the league should not quietly rewrite a past standing.
 */
export function planRemoval(seasons: MemberSeason[]): RemovalPlan {
  return {
    blocking: seasons.filter((s) => s.state === 'draft' || s.state === 'active'),
    leaving: seasons.filter((s) => s.state === 'setup'),
    keeping: seasons.filter((s) => s.state === 'complete'),
  }
}

/** Whether the plan permits the removal to go ahead. */
export function canRemove(plan: RemovalPlan): boolean {
  return plan.blocking.length === 0
}

/** Human-readable reason a removal was refused, for the error surfaced to the owner. */
export function blockingReason(plan: RemovalPlan): string {
  return plan.blocking.map((s) => s.label).join(', ')
}
