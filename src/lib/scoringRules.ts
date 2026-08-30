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
 * A working copy of one rule while an admin edits the set.
 *
 * `id` is absent on a rule that has not been written yet — the editor holds
 * every change locally until Save, so a new rule has no document to name.
 */
export type EditableRule = ScoringRuleDoc & { id?: string }

/**
 * The scoring-relevant identity of the rules that apply to one episode.
 *
 * Only what changes a score goes in: which rules cover the episode and what
 * each is worth. A rule renamed, or one whose episodes changed so it no longer
 * covers this one, both land correctly — the first is not a scoring change and
 * leaves the fingerprint alone, the second drops out of it.
 *
 * Stored on an episode when its scores are submitted, then compared against the
 * live rules to tell whether that episode's recorded totals still reflect them.
 */
export function rulesFingerprint(
  rules: Array<Pick<ScoringRuleDoc, 'points' | 'episodeNumbers'> & { id: string }>,
  episodeNumber: number
): string {
  return fingerprintOf(rules.filter((r) => ruleCoversEpisode(r, episodeNumber)))
}

/**
 * The same identity, for a set already narrowed to one episode — a stored
 * snapshot, say, which carries no episode numbers because every rule in it
 * covered the episode by definition.
 */
export function fingerprintOf(rules: Array<{ id: string; points: number }>): string {
  return rules
    .map((r) => `${r.id}:${r.points}`)
    .sort()
    .join('|')
}

/**
 * What has to be written to turn the stored rules into the edited ones.
 *
 * Deletions are worked out from the original set rather than tracked as the
 * admin clicks, so a rule added and then removed before saving never reaches
 * Firestore at all.
 */
export function diffRuleSets(
  original: Array<ScoringRuleDoc & { id: string }>,
  edited: EditableRule[]
): {
  added: ScoringRuleDoc[]
  updated: Array<ScoringRuleDoc & { id: string }>
  deleted: Array<ScoringRuleDoc & { id: string }>
} {
  const keptIds = new Set(edited.map((r) => r.id).filter(Boolean))
  const byId = new Map(original.map((r) => [r.id, r]))
  const same = (a: ScoringRuleDoc, b: ScoringRuleDoc) =>
    a.name === b.name &&
    a.points === b.points &&
    a.type === b.type &&
    JSON.stringify(a.episodeNumbers ?? null) === JSON.stringify(b.episodeNumbers ?? null)

  const added: ScoringRuleDoc[] = []
  const updated: Array<ScoringRuleDoc & { id: string }> = []
  for (const rule of edited) {
    const { id, ...doc } = rule
    if (!id) {
      added.push(doc)
      continue
    }
    const before = byId.get(id)
    if (before && !same(before, doc)) updated.push({ id, ...doc })
  }
  return {
    added,
    updated,
    deleted: original.filter((r) => !keptIds.has(r.id)),
  }
}
