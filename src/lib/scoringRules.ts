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
}

export type RuleProblem = 'name-required' | 'points-not-a-whole-number' | 'points-zero'

export const emptyRuleDraft: RuleDraft = {
  name: '',
  points: '',
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
  return null
}

/** The stored rule for a draft that has already been validated. */
export function draftToRule(draft: RuleDraft): ScoringRuleDoc {
  return {
    type: 'binary',
    name: draft.name.trim(),
    points: parseInt(draft.points.trim(), 10),
  }
}

/** A stored rule back into a draft, for editing it. */
export function ruleToDraft(rule: ScoringRuleDoc): RuleDraft {
  return {
    name: rule.name,
    points: String(rule.points),
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
