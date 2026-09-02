import type { ScoreProposalStatus } from './types'

/**
 * Who may do what to an episode's scorecard.
 *
 * The page had two states — an admin editing, everybody else reading — and now
 * has seven, because a season member may fill a card in and offer it, and an
 * admin meets that offer with a decision rather than an empty table. Deciding
 * it inline meant a growing pile of conditions in the markup, each of which had
 * to be read alongside every other to know what a given person would see.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts for the reasoning): this
 * is the part worth asserting on, and none of it needs a database to decide.
 */

/** Buttons the footer may offer. `submit` is the write that scores an episode. */
export type ScorecardAction =
  'submit' | 'submitForApproval' | 'approve' | 'edit' | 'reset' | 'unlock'

/**
 * The line under the table explaining why it cannot be edited, if it cannot.
 *
 * Only the one. A scored episode used to carry "Scores are entered by a league
 * admin", which said the obvious about a table of read-only marks and is gone;
 * a card that has been offered and not yet decided on is the case where the
 * reason is not visible from the card itself.
 */
export type ScorecardNotice = 'pendingApproval' | null

export interface ScorecardInput {
  isAdmin: boolean
  /** An episodeScores document exists: this episode has been scored for real. */
  officiallyScored: boolean
  isLocked: boolean
  /** Drawn under the rules it was recorded with; nothing may be ticked. */
  showingAsRecorded: boolean
  proposalStatus: ScoreProposalStatus | 'none'
  /** The admin pressed Edit or Reset, and is now working on the suggestion. */
  adminEditingProposal: boolean
}

export interface ScorecardState {
  /** Checkboxes rather than marks, and a footer that can write something. */
  editable: boolean
  actions: ScorecardAction[]
  notice: ScorecardNotice
}

export function scorecardState({
  isAdmin,
  officiallyScored,
  isLocked,
  showingAsRecorded,
  proposalStatus,
  adminEditingProposal,
}: ScorecardInput): ScorecardState {
  // Already scored. A suggestion cannot apply to an episode that has an answer,
  // so this branch is exactly what it was before proposals existed.
  if (officiallyScored) {
    if (!isAdmin) return { editable: false, actions: [], notice: null }
    if (isLocked) return { editable: false, actions: ['unlock'], notice: null }
    // Unlocked, but still showing the rules it was recorded under: ticking a
    // box against a column that no longer exists would store a score under a
    // rule nobody chose.
    if (showingAsRecorded) return { editable: false, actions: [], notice: null }
    return { editable: true, actions: ['submit'], notice: null }
  }

  // Somebody has offered a card and nobody has decided on it.
  if (proposalStatus === 'pending') {
    // One suggestion at a time. Without this the last person to press the
    // button would quietly overwrite everyone before them, and the admin would
    // never know there had been a disagreement.
    if (!isAdmin) return { editable: false, actions: [], notice: 'pendingApproval' }
    if (adminEditingProposal) return { editable: true, actions: ['submit'], notice: null }
    return { editable: false, actions: ['approve', 'edit', 'reset'], notice: 'pendingApproval' }
  }

  // Nothing scored and no live suggestion: anyone in the season may fill it in.
  // What differs is what the button does when they have — an admin's write is
  // the score, anybody else's is a suggestion.
  return {
    editable: true,
    actions: [isAdmin ? 'submit' : 'submitForApproval'],
    notice: null,
  }
}
