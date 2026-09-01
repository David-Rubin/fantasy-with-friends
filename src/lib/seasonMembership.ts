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

/**
 * Who is offered the way into a running draft.
 *
 * Deliberately the same people the season page would have offered it to, since
 * that is where this button used to live: a season page is for that season's
 * members, plus a superadmin, who is cleared to read every season without
 * joining one. Anybody else sees the season on the league page as a card and
 * nothing more.
 *
 * Note this is not the mirror of canJoinSeason above. That one is about letting
 * yourself onto a roster, and so is closed to anyone already on it; this is a
 * door into a room, and being on the roster is exactly what opens it.
 */
interface DraftJoinableInput {
  state: SeasonState
  isSeasonMember: boolean
  /** Cleared to read any season without joining it — see useSeasonMembership. */
  isSuperadmin: boolean
  /** False while season membership is still loading; see JoinableInput.resolved. */
  resolved: boolean
}

export function canJoinDraft({
  state,
  isSeasonMember,
  isSuperadmin,
  resolved,
}: DraftJoinableInput): boolean {
  if (!resolved) return false
  return state === 'draft' && (isSeasonMember || isSuperadmin)
}
