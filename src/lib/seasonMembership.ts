import type { SeasonState } from './types'

/**
 * Who may let themselves into a season, decided without Firebase in sight.
 *
 * Season rosters used to be written in exactly two places — when a season is
 * created, from the league roster as it stood at that moment, and when a join
 * request is approved, for that league's seasons still in `setup`. A member who
 * arrived after a season had moved on had no way in and no control to ask for
 * one; the season page simply refused them.
 *
 * `setup` is the whole gate. Pick order does not exist until the draft is
 * randomized, so somebody arriving now is indistinguishable from somebody who
 * was there when the season was created — no order to disturb, no team sizes to
 * unbalance. A season that has moved past setup is a different matter, which is
 * why reopenSeasonSetup exists: an admin who wants to take late arrivals undoes
 * the draft, and the season becomes joinable again by this same rule.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts for the reasoning) — the
 * decision is worth asserting on, the write in ./seasonApi is not.
 */
interface JoinableInput {
  state: SeasonState
  /** Membership of the league that owns the season. */
  isLeagueMember: boolean
  isSeasonMember: boolean
  /**
   * False while either membership is still loading. Without it the page would
   * flash a Join button at somebody who already belongs to the season.
   */
  resolved: boolean
}

export function canJoinSeason({
  state,
  isLeagueMember,
  isSeasonMember,
  resolved,
}: JoinableInput): boolean {
  if (!resolved) return false
  return state === 'setup' && isLeagueMember && !isSeasonMember
}
