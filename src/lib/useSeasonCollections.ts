import { useEffect, useState } from 'react'
import { collection } from 'firebase/firestore'
import { db } from './firebase'
import { listenQuery } from './listen'
import type {
  Contestant,
  ContestantDoc,
  DraftDoc,
  ScoringRule,
  ScoringRuleDoc,
  SeasonTeam,
  SeasonTeamDoc,
} from './types'

/**
 * The two collections every page below a season reads the same way.
 *
 * The season page, the draft room and the episode scorecard each held their own
 * copy of these listeners — three of the contestants one and two of the rules
 * one, identical but for the console label. A fourth copy was the price of
 * showing the cast in the draft lobby, so they moved here instead.
 *
 * Following useTrailNames: a hook in lib rather than a context, and duplicating
 * the listen where two of these are mounted at once costs nothing on the wire,
 * because the Firestore SDK serves a second onSnapshot on the same query from
 * the same watch.
 *
 * `canView` is the season-membership gate from SeasonMemberGate, not an admin
 * check — both collections are readable by any season member (see
 * firestore.rules), and passing it through means a page that has not yet
 * settled who is asking does not fire a read that would be denied.
 */

export function useSeasonContestants(seasonId: string | undefined, canView: boolean): Contestant[] {
  const [contestants, setContestants] = useState<Contestant[]>([])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'contestants'),
      'season contestants',
      (snap) => {
        setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
      }
    )
  }, [seasonId, canView])

  return contestants
}

export function useSeasonScoringRules(
  seasonId: string | undefined,
  canView: boolean
): ScoringRule[] {
  const [rules, setRules] = useState<ScoringRule[]>([])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'scoringRules'),
      'season rules',
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ScoringRuleDoc) })))
      }
    )
  }, [seasonId, canView])

  return rules
}

/**
 * The season's teams — empty for a solo season, which has none, and for a
 * season in team mode before the admin has saved a layout. Listened to in
 * every state rather than only in team mode, because the flag and the
 * documents arrive in separate snapshots and a page that waited for the flag
 * before opening the watch would draw a frame of a team-mode season with no
 * teams in it.
 */
export function useSeasonTeams(seasonId: string | undefined, canView: boolean): SeasonTeam[] {
  const [teams, setTeams] = useState<SeasonTeam[]>([])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(collection(db, 'seasons', seasonId, 'teams'), 'season teams', (snap) => {
      setTeams(snap.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonTeamDoc) })))
    })
  }, [seasonId, canView])

  return teams
}

/**
 * The season's draft document, and whether we have heard back about it yet.
 *
 * Read as a collection rather than a fixed id, and an empty result is
 * meaningful: a reset deletes the document, and that is what puts a season back
 * into its lobby. `loaded` is therefore not a nicety — without it "no draft" and
 * "no answer yet" are the same value, which is what made the room flash its
 * lobby on the way into a running draft.
 *
 * Called by DraftRoom, which is mounted only while a season is drafting — so a
 * season in setup, or one being read months after it finished, does not open a
 * watch on a document it will never show.
 */
export function useSeasonDraft(
  seasonId: string | undefined,
  canView: boolean
): { draft: DraftDoc | null; draftLoaded: boolean } {
  const [draft, setDraft] = useState<DraftDoc | null>(null)
  const [draftLoaded, setDraftLoaded] = useState(false)

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(collection(db, 'seasons', seasonId, 'draft'), 'season draft', (snap) => {
      setDraft(snap.empty ? null : (snap.docs[0].data() as DraftDoc))
      setDraftLoaded(true)
    })
  }, [seasonId, canView])

  return { draft, draftLoaded }
}
