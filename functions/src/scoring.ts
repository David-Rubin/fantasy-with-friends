// Shared scoring logic — used by Cloud Functions and front-end unit tests

export type ScoringRuleType = 'binary' | 'number'

export interface ScoringRule {
  id: string
  /** Absent on rules written before the field existed; those are all binary. */
  type?: ScoringRuleType
  name: string
  points: number
}

/** A tick for a binary rule, a count for a `number` one. See src/lib/types.ts. */
export type ContestantScoreEntry = Record<string, boolean | number>

export interface ContestantScoreDoc {
  scores: ContestantScoreEntry
  totalPoints: number
}

/**
 * How many times a rule counted. Mirrors scoredCount in src/lib/scoring.ts,
 * including its tolerance of either stored shape under either kind of rule —
 * a rule's type is editable and nothing rewrites the scores behind it.
 */
export function scoredCount(rule: ScoringRule, entry: ContestantScoreEntry): number {
  const recorded = entry[rule.id]
  if (recorded === true) return 1
  if (typeof recorded !== 'number' || !Number.isFinite(recorded)) return 0
  if (rule.type === 'number') return Math.max(0, Math.floor(recorded))
  return recorded > 0 ? 1 : 0
}

export function evaluateRule(rule: ScoringRule, entry: ContestantScoreEntry): number {
  const count = scoredCount(rule, entry)
  // See src/lib/scoring.ts: `0 * -3` is -0, and nothing should store one.
  return count === 0 ? 0 : count * rule.points
}

export function calcTeamTotal(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>
): number {
  return memberContestantIds.reduce((sum, cid) => {
    return sum + episodeScoreDocs.reduce((s2, ep) => s2 + (ep.scores[cid]?.totalPoints ?? 0), 0)
  }, 0)
}

export function calcTeamEpisodeTotals(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>
): Record<string, number> {
  const sorted = [...episodeScoreDocs].sort((a, b) => a.episodeNumber - b.episodeNumber)

  let running = 0
  const result: Record<string, number> = {}
  for (const ep of sorted) {
    const epPoints = memberContestantIds.reduce(
      (sum, cid) => sum + (ep.scores[cid]?.totalPoints ?? 0),
      0
    )
    running += epPoints
    result[String(ep.episodeNumber)] = running
  }

  return result
}
