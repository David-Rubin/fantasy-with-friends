import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './audit'
import { draftToRule, type RuleDraft } from './scoringRules'
import type { ScoringRuleDoc } from './types'

/**
 * Writing a season's scoring rules.
 *
 * Plain client writes: the security rule authorises exactly what should be
 * allowed — a season admin, and only while the season has no scores yet — so
 * there is nothing here a rule cannot already express. What a draft becomes is
 * decided in ./scoringRules, which stays free of Firebase.
 *
 * Every change is audited. A rule's point value is the one thing that silently
 * rewrites what a score is worth, so it is worth knowing who changed it.
 */

export async function addScoringRule(
  seasonId: string,
  leagueId: string,
  draft: RuleDraft,
  episodeCount: number
): Promise<void> {
  const rule = draftToRule(draft, episodeCount)
  await addDoc(collection(db, 'seasons', seasonId, 'scoringRules'), rule satisfies ScoringRuleDoc)
  await logAuditEvent({ action: 'scoring_rule_added', seasonId, leagueId, newValue: rule })
}

export async function updateScoringRule(
  seasonId: string,
  leagueId: string,
  ruleId: string,
  previous: ScoringRuleDoc,
  draft: RuleDraft,
  episodeCount: number
): Promise<void> {
  const rule = draftToRule(draft, episodeCount)
  await updateDoc(doc(db, 'seasons', seasonId, 'scoringRules', ruleId), { ...rule })
  await logAuditEvent({
    action: 'scoring_rule_updated',
    seasonId,
    leagueId,
    oldValue: previous,
    newValue: rule,
  })
}

export async function deleteScoringRule(
  seasonId: string,
  leagueId: string,
  ruleId: string,
  removed: ScoringRuleDoc
): Promise<void> {
  await deleteDoc(doc(db, 'seasons', seasonId, 'scoringRules', ruleId))
  await logAuditEvent({ action: 'scoring_rule_deleted', seasonId, leagueId, oldValue: removed })
}
