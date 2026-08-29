import type { ScoringRuleDoc, ScoringRule, ContestantScoreEntry, ContestantScoreDoc } from './types'

// ── Per-rule evaluators ───────────────────────────────────────────────────────

export function evaluateRule(rule: ScoringRule, entry: ContestantScoreEntry): number {
  return entry[rule.id] === true ? rule.points : 0
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
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
    locked: boolean
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
