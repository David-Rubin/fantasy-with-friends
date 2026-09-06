import type {
  ScoringRuleDoc,
  ScoringRule,
  ScoringRuleType,
  ContestantScoreEntry,
  ContestantScoreDoc,
} from './types'

// ── Per-rule evaluators ───────────────────────────────────────────────────────

/** What a rule needs to be worth points: how it is answered, and what it pays. */
type ScorableRule = { id: string; points: number; type?: ScoringRuleType }

/**
 * How many times a rule counts for this contestant in this episode.
 *
 * One for a binary rule that was ticked, the recorded count for a `number`
 * rule, zero for anything untouched.
 *
 * Both stored shapes are read whatever the rule now says it is, because a rule's
 * type is editable and nothing rewrites the scores behind it. A tick found under
 * a rule that has become a count is one occurrence — the thing happened, and
 * once is what was recorded. A count found under a rule that has gone back to
 * binary is a tick when it is more than zero — it happened at least once. The
 * alternative is a scored episode silently dropping to nothing the moment an
 * admin changes a dropdown.
 *
 * A count is floored and never negative: the input only offers whole numbers
 * from zero up, and a hand-edited document should not be able to invent points
 * by going the other way.
 */
export function scoredCount(rule: ScorableRule, entry: ContestantScoreEntry): number {
  const recorded = entry[rule.id]
  if (recorded === true) return 1
  if (typeof recorded !== 'number' || !Number.isFinite(recorded)) return 0
  if (rule.type === 'number') return Math.max(0, Math.floor(recorded))
  return recorded > 0 ? 1 : 0
}

/** What a rule is worth to this contestant: its points, times how often it counted. */
export function evaluateRule(
  rule: ScorableRule | ScoringRule,
  entry: ContestantScoreEntry
): number {
  const count = scoredCount(rule, entry)
  // Zero returned flat rather than multiplied: `0 * -3` is -0, which is a
  // perfectly good zero everywhere except where something compares it, and
  // there is no reason to store one.
  return count === 0 ? 0 : count * rule.points
}

/**
 * Whether a rule takes points away rather than awarding them.
 *
 * What a scorecard cell means is decided entirely by the column it sits in: the
 * same tick — or the same count — is worth having under "Wins HOH" and worth
 * avoiding under "Sent to jury". The read-only card draws the two differently,
 * and this is the line between them.
 *
 * Zero is not a penalty. It takes nothing away, so it reads as the ordinary
 * mark — a rule worth no points is a strange thing to have written, but it is
 * not a punishment.
 *
 * Takes the points rather than the rule so that a recorded column — an entry in
 * EpisodeScoreDoc.appliedRules, which is not a ScoringRule — can be asked too.
 * The card draws those when an episode is showing as it was recorded.
 */
export function isPenalty(points: number): boolean {
  return points < 0
}

// ── Contestant totals ─────────────────────────────────────────────────────────

export function calcContestantEpisodePoints(
  rules: (ScoringRuleDoc & { id: string })[],
  entry: ContestantScoreEntry
): number {
  return rules.reduce((sum, rule) => sum + evaluateRule(rule, entry), 0)
}

export function calcContestantTotal(
  contestantId: string,
  // `locked` is deliberately not required: a locked episode counts the same as
  // an unlocked one, and demanding the field makes callers invent a value.
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>
): number {
  return episodeScoreDocs.reduce((sum, ep) => {
    const scoreDoc = ep.scores[contestantId]
    return sum + (scoreDoc?.totalPoints ?? 0)
  }, 0)
}

// ── Team totals ───────────────────────────────────────────────────────────────

export function calcTeamTotal(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
    locked: boolean
  }>
): number {
  return memberContestantIds.reduce(
    (sum, cid) => sum + calcContestantTotal(cid, episodeScoreDocs),
    0
  )
}

// ── Team totals across all episodes (for teamEpisodeTotals shape) ─────────────

export function calcTeamEpisodeTotals(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
    locked: boolean
  }>
): Record<string, number> {
  const sorted = [...episodeScoreDocs].sort((a, b) => a.episodeNumber - b.episodeNumber)

  let running = 0
  const result: Record<string, number> = {}
  for (const ep of sorted) {
    const epPoints = memberContestantIds.reduce((sum, cid) => {
      return sum + (ep.scores[cid]?.totalPoints ?? 0)
    }, 0)
    running += epPoints
    result[String(ep.episodeNumber)] = running
  }

  return result
}

/**
 * What a contestant scored in the most recently scored episode.
 *
 * "Most recent" is the highest episode number with a scores document, not the
 * last element of the array — episodes arrive from a listener in whatever order
 * Firestore hands them over, and a season can be scored out of order when an
 * admin goes back to fill one in.
 *
 * Null when nothing has been scored yet, which is different from a contestant
 * who was on screen and scored nothing: that is a real zero.
 */
export function latestEpisodePoints(
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>,
  contestantId: string
): number | null {
  if (episodeScoreDocs.length === 0) return null
  const latest = episodeScoreDocs.reduce((a, b) => (b.episodeNumber > a.episodeNumber ? b : a))
  return latest.scores[contestantId]?.totalPoints ?? 0
}
