import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './audit'
import type { ContestantScoreEntry, ScoreProposalDoc } from './types'

/**
 * Writing a scorecard somebody has suggested.
 *
 * The thin writer beside src/lib/scorecard.ts, which decides who may do this.
 *
 * Nothing here touches a total. A suggestion lives at
 * `seasons/{id}/scoreProposals/{episode}`, which no trigger watches — see
 * ScoreProposalDoc — so saving one leaves the leaderboard, the rosters and the
 * standings exactly as they were. Scoring an episode remains one write by an
 * admin to `episodeScores`, which is what the totals are built from.
 */

function proposalRef(seasonId: string, episodeNumber: string) {
  return doc(db, 'seasons', seasonId, 'scoreProposals', episodeNumber)
}

/** Offer a filled-in card for an admin to decide on. */
export async function proposeScores(
  seasonId: string,
  leagueId: string,
  episodeNumber: string,
  proposer: { uid: string; displayName: string },
  scores: Record<string, ContestantScoreEntry>,
  eliminations: string[]
): Promise<void> {
  await setDoc(proposalRef(seasonId, episodeNumber), {
    status: 'pending',
    scores,
    eliminations,
    submittedBy: proposer.uid,
    // Denormalized so the card can say whose suggestion it is: an admin cannot
    // read anybody else's user document. See LeagueMemberDoc.displayName.
    submittedByName: proposer.displayName,
    submittedAt: Date.now(),
    decidedAt: null,
    decidedBy: null,
  } satisfies ScoreProposalDoc)

  await logAuditEvent({
    action: 'episode_scores_proposed',
    seasonId,
    leagueId,
    episodeNumber: parseInt(episodeNumber, 10),
    targetUid: proposer.uid,
  })
}

/**
 * An admin's decision on a suggestion, recorded rather than deleted.
 *
 * `discarded` is the reset: the card is cleared and the episode is open to be
 * suggested again. `approved` is written after the episode has actually been
 * scored, so the suggestion is closed out rather than left looking live.
 *
 * Kept rather than removed because it is a record of somebody's work, and
 * because "who suggested what, and what did the admin do about it" is exactly
 * the sort of thing a league argues about later.
 */
export async function decideProposal(
  seasonId: string,
  leagueId: string,
  episodeNumber: string,
  decision: 'approved' | 'discarded',
  adminUid: string
): Promise<void> {
  await updateDoc(proposalRef(seasonId, episodeNumber), {
    status: decision,
    decidedAt: Date.now(),
    decidedBy: adminUid,
  })

  await logAuditEvent({
    action: decision === 'approved' ? 'episode_proposal_approved' : 'episode_proposal_discarded',
    seasonId,
    leagueId,
    episodeNumber: parseInt(episodeNumber, 10),
  })
}
