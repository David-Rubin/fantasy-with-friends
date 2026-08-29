import type { ScoringRuleDoc } from './types'

/**
 * Turning what an admin typed into a scoring rule, and deciding when the rules
 * are still theirs to change.
 *
 * Free of Firebase so it can be tested without credentials; the writing lives in
 * ./scoringRulesApi.
 */

/** The form an admin fills in, before anything is parsed. */
export interface RuleDraft {
  name: string
  /** Text, because a half-typed "-" or "1." is not yet a number. */
  points: string
  /**
   * Always the concrete set of ticked episodes, never a "means all" sentinel —
   * a checkbox list has no way to render one. The sentinel is applied on the
   * way out, in draftToRule.
   */
  episodeNumbers: number[]
}

export type RuleProblem =
  'name-required' | 'points-not-a-whole-number' | 'points-zero' | 'episodes-required'

/** Episodes 1..episodeCount, which is what a season's rules are chosen from. */
export function allEpisodeNumbers(episodeCount: number): number[] {
  if (!Number.isFinite(episodeCount) || episodeCount < 1) return []
  return Array.from({ length: Math.floor(episodeCount) }, (_, i) => i + 1)
}

/** A blank rule, starting out covering the whole season. */
export function emptyRuleDraft(episodeCount: number): RuleDraft {
  return {
    name: '',
    points: '',
    episodeNumbers: allEpisodeNumbers(episodeCount),
  }
}

/**
 * Whether a rule is scored in a given episode.
 *
 * Absent and null both mean every episode — absent because rules written
 * before the field existed do not carry it, and reading those as "no episodes"
 * would silently empty every scoring table in the app.
 */
export function ruleCoversEpisode(
  rule: Pick<ScoringRuleDoc, 'episodeNumbers'>,
  episodeNumber: number
): boolean {
  if (!rule.episodeNumbers) return true
  return rule.episodeNumbers.includes(episodeNumber)
}

/**
 * Points are whole numbers, and never zero.
 *
 * Matched against the whole string rather than handed to parseFloat, which
 * reads "5 points" as 5 and would store a rule the admin never typed. Negative
 * is allowed and deliberately so — a penalty is a rule like any other.
 */
const WHOLE_NUMBER = /^-?\d+$/

/** Why this draft is not yet a rule, or null when it is fine. */
export function validateRuleDraft(draft: RuleDraft): RuleProblem | null {
  if (!draft.name.trim()) return 'name-required'
  const points = draft.points.trim()
  if (!WHOLE_NUMBER.test(points)) return 'points-not-a-whole-number'
  // Covers "0" and "-0". A rule worth nothing scores nothing, so it is a row in
  // the scoring table that can only waste the admin's time every episode.
  if (parseInt(points, 10) === 0) return 'points-zero'
  // Deselecting every episode is allowed while the admin is working — a rule
  // scored nowhere is only a problem once they try to keep it.
  if (draft.episodeNumbers.length === 0) return 'episodes-required'
  return null
}

/**
 * The stored rule for a draft that has already been validated.
 *
 * A selection covering the whole season is stored as `null` rather than the
 * list: see ScoringRuleDoc.episodeNumbers for why the two are not the same.
 */
export function draftToRule(draft: RuleDraft, episodeCount: number): ScoringRuleDoc {
  const episodes = [...new Set(draft.episodeNumbers)].sort((a, b) => a - b)
  const coversEverything = episodes.length >= allEpisodeNumbers(episodeCount).length
  return {
    type: 'binary',
    name: draft.name.trim(),
    points: parseInt(draft.points.trim(), 10),
    episodeNumbers: coversEverything ? null : episodes,
  }
}

/**
 * A stored rule back into a draft, for editing it.
 *
 * Episodes outside the season are dropped: a count lowered after the rule was
 * written leaves numbers behind that no longer name anything, and the checkbox
 * list has nowhere to show them.
 */
export function ruleToDraft(rule: ScoringRuleDoc, episodeCount: number): RuleDraft {
  const all = allEpisodeNumbers(episodeCount)
  return {
    name: rule.name,
    points: String(rule.points),
    episodeNumbers: rule.episodeNumbers ? all.filter((n) => rule.episodeNumbers!.includes(n)) : all,
  }
}

/**
 * Whether the scoring rules may still be changed.
 *
 * The cutoff is the first episode being scored, not the season's state: rules
 * stay editable through setup, the draft, and a season that has started but has
 * no scores yet. Once any episode is scored, changing a point value would
 * silently restate every score already recorded under the old one, so the rules
 * are fixed for the rest of the season.
 *
 * The security rules enforce the same thing — this is what the UI reads to know
 * whether to offer the forms at all.
 */
export function rulesAreEditable(firstEpisodeScoredAt: number | null | undefined): boolean {
  return !firstEpisodeScoredAt
}
