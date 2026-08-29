// Shared scoring logic — used by Cloud Functions and front-end unit tests

export interface ScoringRule {
  id: string
  type: 'binary'
  name: string
  points: number
}

export type ContestantScoreEntry = Record<string, boolean>

export interface ContestantScoreDoc {
  scores: ContestantScoreEntry
  totalPoints: number
}

export function evaluateRule(rule: ScoringRule, entry: ContestantScoreEntry): number {
  return entry[rule.id] === true ? rule.points : 0
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
