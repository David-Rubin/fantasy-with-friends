import type {
  ScoringRuleDoc,
  ContestantScoreEntry,
  ContestantScoreDoc,
  SeasonAwardDoc,
} from './types'

// ── Per-rule evaluators ───────────────────────────────────────────────────────

export function evaluateRule(
  rule: ScoringRuleDoc,
  entry: ContestantScoreEntry,
  contestantId: string,
): number {
  const value = entry[rule.id ?? '']
  switch (rule.type) {
    case 'binary':
      return value === true ? rule.points : 0
    case 'numeric':
      return typeof value === 'number' ? value * rule.points : 0
    case 'bonus_challenge':
      return value === contestantId ? rule.points : 0
    default:
      return 0
  }
}

// ── Contestant totals ─────────────────────────────────────────────────────────

export function calcContestantEpisodePoints(
  rules: (ScoringRuleDoc & { id: string })[],
  entry: ContestantScoreEntry,
  contestantId: string,
): number {
  return rules.reduce((sum, rule) => sum + evaluateRule(rule, entry, contestantId), 0)
}

export function calcContestantTotal(
  contestantId: string,
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
    locked: boolean
  }>,
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
  }>,
  seasonAwards: SeasonAwardDoc[],
  awardRules: (ScoringRuleDoc & { id: string })[],
): number {
  const episodePoints = memberContestantIds.reduce(
    (sum, cid) => sum + calcContestantTotal(cid, episodeScoreDocs),
    0,
  )

  const awardPoints = seasonAwards
    .filter((a) => memberContestantIds.includes(a.contestantId))
    .reduce((sum, award) => {
      const rule = awardRules.find((r) => r.id === award.ruleId)
      return sum + (rule?.points ?? 0)
    }, 0)

  return episodePoints + awardPoints
}

// ── Team totals across all episodes (for teamEpisodeTotals shape) ─────────────

export function calcTeamEpisodeTotals(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
    locked: boolean
  }>,
  seasonAwards: SeasonAwardDoc[],
  awardRules: (ScoringRuleDoc & { id: string })[],
): Record<string, number> {
  const sorted = [...episodeScoreDocs].sort((a, b) => a.episodeNumber - b.episodeNumber)
  const awardPoints = seasonAwards
    .filter((a) => memberContestantIds.includes(a.contestantId))
    .reduce((sum, award) => {
      const rule = awardRules.find((r) => r.id === award.ruleId)
      return sum + (rule?.points ?? 0)
    }, 0)

  let running = 0
  const result: Record<string, number> = {}
  for (const ep of sorted) {
    const epPoints = memberContestantIds.reduce((sum, cid) => {
      return sum + (ep.scores[cid]?.totalPoints ?? 0)
    }, 0)
    running += epPoints
    result[String(ep.episodeNumber)] = running
  }

  // Season awards are added to the final episode total
  const lastEp = sorted[sorted.length - 1]
  if (lastEp && awardPoints > 0) {
    result[String(lastEp.episodeNumber)] =
      (result[String(lastEp.episodeNumber)] ?? 0) + awardPoints
  }

  return result
}
