import { deleteDoc, doc, setDoc } from 'firebase/firestore'
import { db } from './firebase'
import type { ContestantScoreEntry, ScorecardDraftDoc } from './types'

/**
 * Reading and writing the scorecard somebody is still working on.
 *
 * A draft is private to its author and scores nothing — see ScorecardDraftDoc
 * for both, and firestore.rules for where that is actually enforced. The path
 * is nested under the uid so the rule is `request.auth.uid == uid` on the path
 * itself: a member cannot even ask for another member's draft, rather than
 * asking and being refused a document that exists.
 *
 * No audit event. Nothing here is a decision anybody else can be affected by —
 * the audited moments are still submitting a score and offering a suggestion.
 */

/** Where one person's half-finished card for one episode lives. */
export function scorecardDraftRef(seasonId: string, uid: string, episodeNumber: string) {
  return doc(db, 'seasons', seasonId, 'scorecardDrafts', uid, 'episodes', episodeNumber)
}

/** Keep the card as it stands, for this person only. */
export async function saveScorecardDraft(
  seasonId: string,
  uid: string,
  episodeNumber: string,
  scores: Record<string, ContestantScoreEntry>,
  eliminations: string[]
): Promise<void> {
  await setDoc(scorecardDraftRef(seasonId, uid, episodeNumber), {
    scores,
    eliminations,
    uid,
    savedAt: Date.now(),
  } satisfies ScorecardDraftDoc)
}

/**
 * Throw the draft away, once its author has actually submitted or suggested
 * the card. Left behind it would be a second, staler answer to an episode that
 * now has a real one, waiting to reappear if the suggestion is ever reset.
 */
export async function clearScorecardDraft(
  seasonId: string,
  uid: string,
  episodeNumber: string
): Promise<void> {
  await deleteDoc(scorecardDraftRef(seasonId, uid, episodeNumber))
}
