// Shared scoring logic — used by Cloud Functions and front-end unit tests

export interface ScoringRule {
  id: string
  type: 'binary' | 'numeric' | 'bonus_challenge'
  name: string
  points: number
  scope: 'per_episode' | 'specific_episodes' | 'season_level' | null
  episodeNumbers: number[] | null
}

export type ContestantScoreEntry = Record<string, boolean | number | string>

export interface ContestantScoreDoc {
  scores: ContestantScoreEntry
  totalPoints: number
}

export interface SeasonAwardDoc {
  ruleId: string
  contestantId: string
  awardedAt: number
  awardedBy: string
}

export function evaluateRule(
  rule: ScoringRule,
  entry: ContestantScoreEntry,
  contestantId: string,
): number {
  const value = entry[rule.id]
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

export function calcTeamTotal(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>,
  seasonAwards: SeasonAwardDoc[],
  awardRules: ScoringRule[],
): number {
  const episodePoints = memberContestantIds.reduce((sum, cid) => {
    return sum + episodeScoreDocs.reduce((s2, ep) => s2 + (ep.scores[cid]?.totalPoints ?? 0), 0)
  }, 0)

  const awardPoints = seasonAwards
    .filter((a) => memberContestantIds.includes(a.contestantId))
    .reduce((sum, award) => {
      const rule = awardRules.find((r) => r.id === award.ruleId)
      return sum + (rule?.points ?? 0)
    }, 0)

  return episodePoints + awardPoints
}

export function calcTeamEpisodeTotals(
  memberContestantIds: string[],
  episodeScoreDocs: Array<{
    episodeNumber: number
    scores: Record<string, ContestantScoreDoc>
  }>,
  seasonAwards: SeasonAwardDoc[],
  awardRules: ScoringRule[],
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
    const epPoints = memberContestantIds.reduce(
      (sum, cid) => sum + (ep.scores[cid]?.totalPoints ?? 0),
      0,
    )
    running += epPoints
    result[String(ep.episodeNumber)] = running
  }

  const lastEp = sorted[sorted.length - 1]
  if (lastEp && awardPoints > 0) {
    result[String(lastEp.episodeNumber)] = (result[String(lastEp.episodeNumber)] ?? 0) + awardPoints
  }

  return result
}
