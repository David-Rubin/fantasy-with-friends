import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { logAuditEvent } from './audit'
import {
  diffRuleSets,
  draftToRule,
  ruleCoversEpisode,
  type EditableRule,
  type RuleDraft,
} from './scoringRules'
import { calcContestantEpisodePoints } from './scoring'
import type { ContestantScoreDoc, EpisodeScoreDoc, ScoringRule, ScoringRuleDoc } from './types'

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

/**
 * Commit a whole edited rule set, and bring unlocked episodes back in line.
 *
 * One batch, so the rules and the scores they govern never disagree: a failure
 * halfway would otherwise leave a season scored under rules that no longer
 * exist. Episodes that are submitted and *locked* are deliberately left alone —
 * their totals are a record, and an admin re-applies the new rules to them from
 * that episode's own page once they have unlocked it.
 *
 * The recalculation keeps every tick the admin already made and only recomputes
 * what those ticks are worth, dropping entries for rules that are gone.
 */
export async function saveRuleChanges(
  seasonId: string,
  leagueId: string,
  original: ScoringRule[],
  edited: EditableRule[]
): Promise<{ added: number; updated: number; deleted: number; episodesRescored: number }> {
  const { added, updated, deleted } = diffRuleSets(original, edited)
  const batch = writeBatch(db)
  const rulesRef = collection(db, 'seasons', seasonId, 'scoringRules')

  const finalRules: ScoringRule[] = []
  for (const rule of added) {
    const ref = doc(rulesRef)
    batch.set(ref, rule)
    finalRules.push({ id: ref.id, ...rule })
  }
  for (const rule of updated) {
    const { id, ...docFields } = rule
    batch.update(doc(rulesRef, id), { ...docFields })
    finalRules.push(rule)
  }
  const changedIds = new Set([...updated.map((r) => r.id), ...deleted.map((r) => r.id)])
  for (const rule of original) if (!changedIds.has(rule.id)) finalRules.push(rule)
  for (const rule of deleted) batch.delete(doc(rulesRef, rule.id))

  // Only the episodes whose scores are still open to change. A locked one keeps
  // what it was given.
  const episodesSnap = await getDocs(collection(db, 'seasons', seasonId, 'episodeScores'))
  const openEpisodes = episodesSnap.docs.filter((d) => !(d.data() as EpisodeScoreDoc).locked)

  for (const episode of openEpisodes) {
    const episodeNumber = parseInt(episode.id, 10)
    const applicable = finalRules.filter((r) => ruleCoversEpisode(r, episodeNumber))
    const scoresSnap = await getDocs(collection(episode.ref, 'contestantScores'))
    for (const scoreDoc of scoresSnap.docs) {
      const { scores } = scoreDoc.data() as ContestantScoreDoc
      // Ticks for rules that no longer apply would otherwise sit in the
      // document forever, scoring nothing but reappearing if the rule came back.
      const kept = Object.fromEntries(
        Object.entries(scores).filter(([ruleId]) => applicable.some((r) => r.id === ruleId))
      )
      batch.set(scoreDoc.ref, {
        scores: kept,
        totalPoints: calcContestantEpisodePoints(applicable, kept),
      } satisfies ContestantScoreDoc)
    }
    // These episodes have just been brought in line, so their snapshot becomes
    // the new rules — nothing is left pending on them.
    batch.update(episode.ref, {
      appliedRules: applicable.map((r) => ({ id: r.id, name: r.name, points: r.points })),
    })
  }

  await batch.commit()
  await logAuditEvent({
    action: 'scoring_rules_saved',
    seasonId,
    leagueId,
    newValue: {
      added: added.length,
      updated: updated.length,
      deleted: deleted.length,
      episodesRescored: openEpisodes.length,
    },
  })
  return {
    added: added.length,
    updated: updated.length,
    deleted: deleted.length,
    episodesRescored: openEpisodes.length,
  }
}
