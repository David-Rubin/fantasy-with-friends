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
  type: ScoringRuleDoc['type']
  name: string
  /** Text, because a half-typed "-" or "1." is not yet a number. */
  points: string
  scope: ScoringRuleDoc['scope']
  /** Comma-separated, e.g. "1, 4, 9". */
  episodeNumbers: string
}

export type RuleProblem =
  | 'name-required'
  | 'points-not-a-number'
  | 'scope-required'
  | 'episodes-required'
  | 'episodes-out-of-range'

export const emptyRuleDraft: RuleDraft = {
  type: 'binary',
  name: '',
  points: '',
  scope: null,
  episodeNumbers: '',
}

/**
 * Episode numbers from a comma-separated list.
 *
 * Deliberately not `.filter(Boolean)`, which the first version of this used:
 * that silently drops episode 0 *and* anything unparseable, so a typo became a
 * rule quietly scoped to fewer episodes than the admin listed. Anything that is
 * not a positive whole number is reported instead, by leaving NaN in the result
 * for the validator to catch.
 */
export function parseEpisodeNumbers(input: string): number[] {
  return input
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (/^\d+$/.test(part) ? parseInt(part, 10) : NaN))
}

/** Why this draft is not yet a rule, or null when it is fine. */
export function validateRuleDraft(draft: RuleDraft, episodeCount: number): RuleProblem | null {
  if (!draft.name.trim()) return 'name-required'
  if (!Number.isFinite(parseFloat(draft.points))) return 'points-not-a-number'

  if (draft.type === 'bonus_challenge') {
    if (!draft.scope) return 'scope-required'
    if (draft.scope === 'specific_episodes') {
      const episodes = parseEpisodeNumbers(draft.episodeNumbers)
      if (episodes.length === 0) return 'episodes-required'
      if (episodes.some((n) => !Number.isFinite(n) || n < 1 || n > episodeCount)) {
        return 'episodes-out-of-range'
      }
    }
  }
  return null
}

/** The stored rule for a draft that has already been validated. */
export function draftToRule(draft: RuleDraft): ScoringRuleDoc {
  const scope = draft.type === 'bonus_challenge' ? draft.scope : null
  return {
    type: draft.type,
    name: draft.name.trim(),
    points: parseFloat(draft.points),
    scope,
    episodeNumbers:
      scope === 'specific_episodes' ? parseEpisodeNumbers(draft.episodeNumbers) : null,
  }
}

/** A stored rule back into a draft, for editing it. */
export function ruleToDraft(rule: ScoringRuleDoc): RuleDraft {
  return {
    type: rule.type,
    name: rule.name,
    points: String(rule.points),
    scope: rule.scope,
    episodeNumbers: rule.episodeNumbers?.join(', ') ?? '',
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
