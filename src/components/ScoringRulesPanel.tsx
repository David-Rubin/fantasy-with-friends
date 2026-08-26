import { useState } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import {
  emptyRuleDraft,
  ruleToDraft,
  validateRuleDraft,
  type RuleDraft,
  type RuleProblem,
} from '../lib/scoringRules'
import { addScoringRule, deleteScoringRule, updateScoringRule } from '../lib/scoringRulesApi'
import type { ScoringRule, ScoringRuleDoc } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * The scoring rules for a season: what they are, and — until the first episode
 * is scored — the forms to change them.
 *
 * Editing only: it lives in the season's Edit dialog, and is rendered there
 * solely while the rules are still open to change. Once the first episode is
 * scored the dialog drops it entirely rather than showing dead forms.
 *
 * Everyone reads the rules elsewhere — ScoringRulesDisclosure on the season
 * page — which is why the read-only rendering of a rule lives in RuleSummary
 * below and is shared between the two.
 */

/**
 * One rule, as a reader sees it. Shared with ScoringRulesDisclosure so the
 * rules read identically whether an admin is editing them or a player is
 * looking them up mid-season.
 */
export function RuleSummary({ rule }: { rule: ScoringRule }) {
  const typeKey = rule.type === 'bonus_challenge' ? 'bonusChallenge' : rule.type
  const scopeKey =
    rule.scope === 'per_episode'
      ? 'perEpisode'
      : rule.scope === 'specific_episodes'
        ? 'specificEpisode'
        : 'seasonLevel'
  return (
    <div className="text-sm text-gray-700">
      <span className="font-medium text-gray-900">{rule.name}</span>
      {' · '}
      {rule.points > 0 ? '+' : ''}
      {rule.points} {t('rules.pts')}
      {' · '}
      {t(`rules.type.${typeKey}`)}
      {rule.scope && ` · ${t(`rules.scope.${scopeKey}`)}`}
      {rule.episodeNumbers?.length ? ` (${rule.episodeNumbers.join(', ')})` : ''}
    </div>
  )
}

/** The stored shape of a rule, for the audit trail's "before" value. */
function withoutId({ type, name, points, scope, episodeNumbers }: ScoringRule): ScoringRuleDoc {
  return { type, name, points, scope, episodeNumbers }
}

const problemKey: Record<RuleProblem, string> = {
  'name-required': 'rules.errors.nameRequired',
  'points-not-a-number': 'rules.errors.pointsNotANumber',
  'scope-required': 'rules.errors.scopeRequired',
  'episodes-required': 'rules.errors.episodesRequired',
  'episodes-out-of-range': 'rules.errors.episodesOutOfRange',
}

interface ScoringRulesPanelProps {
  seasonId: string
  leagueId: string
  rules: ScoringRule[]
  episodeCount: number
}

function RuleFields({
  draft,
  onChange,
  episodeCount,
}: {
  draft: RuleDraft
  onChange: (next: RuleDraft) => void
  episodeCount: number
}) {
  return (
    <>
      <select
        value={draft.type}
        onChange={(e) => onChange({ ...draft, type: e.target.value as RuleDraft['type'] })}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label={t('rules.type')}
      >
        <option value="binary">{t('rules.type.binary')}</option>
        <option value="numeric">{t('rules.type.numeric')}</option>
        <option value="bonus_challenge">{t('rules.type.bonusChallenge')}</option>
      </select>
      <Input
        label={t('rules.name')}
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        className="flex-1 min-w-40"
      />
      <Input
        label={t('rules.points')}
        type="number"
        step="0.5"
        value={draft.points}
        onChange={(e) => onChange({ ...draft, points: e.target.value })}
        className="w-24"
      />
      {draft.type === 'bonus_challenge' && (
        <select
          value={draft.scope ?? ''}
          onChange={(e) =>
            onChange({ ...draft, scope: (e.target.value || null) as RuleDraft['scope'] })
          }
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={t('rules.scope')}
        >
          <option value="">{t('rules.scope.choose')}</option>
          <option value="per_episode">{t('rules.scope.perEpisode')}</option>
          <option value="specific_episodes">{t('rules.scope.specificEpisode')}</option>
          <option value="season_level">{t('rules.scope.seasonLevel')}</option>
        </select>
      )}
      {draft.type === 'bonus_challenge' && draft.scope === 'specific_episodes' && (
        <Input
          label={t('rules.episodeNumbers')}
          value={draft.episodeNumbers}
          onChange={(e) => onChange({ ...draft, episodeNumbers: e.target.value })}
          placeholder={`1, 2 … ${episodeCount}`}
          className="w-40"
        />
      )}
    </>
  )
}

export function ScoringRulesPanel({
  seasonId,
  leagueId,
  rules,
  episodeCount,
}: ScoringRulesPanelProps) {
  const [addDraft, setAddDraft] = useState<RuleDraft>(emptyRuleDraft)
  const [adding, setAdding] = useState(false)
  const [addProblem, setAddProblem] = useState<RuleProblem | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<RuleDraft>(emptyRuleDraft)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editProblem, setEditProblem] = useState<RuleProblem | null>(null)

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const problem = validateRuleDraft(addDraft, episodeCount)
    setAddProblem(problem)
    if (problem) return
    setAdding(true)
    try {
      await addScoringRule(seasonId, leagueId, addDraft)
      setAddDraft(emptyRuleDraft)
    } catch (error) {
      console.error('Failed to add scoring rule', error)
      setAddProblem('points-not-a-number')
    } finally {
      setAdding(false)
    }
  }

  async function handleSaveEdit(rule: ScoringRule) {
    const problem = validateRuleDraft(editDraft, episodeCount)
    setEditProblem(problem)
    if (problem) return
    setSavingEdit(true)
    try {
      await updateScoringRule(seasonId, leagueId, rule.id, withoutId(rule), editDraft)
      setEditingId(null)
    } catch (error) {
      console.error('Failed to update scoring rule', error)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(rule: ScoringRule) {
    setDeleting(true)
    try {
      await deleteScoringRule(seasonId, leagueId, rule.id, withoutId(rule))
      setConfirmDelete(null)
    } catch (error) {
      console.error('Failed to delete scoring rule', error)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section>
      <h3 className="mb-3 font-medium text-gray-700">{t('rules.heading', { n: rules.length })}</h3>

      {rules.length === 0 ? (
        <p className="mb-3 text-sm text-gray-400">{t('rules.none')}</p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2">
          {rules.map((rule) => (
            <li key={rule.id} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              {editingId === rule.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <RuleFields
                      draft={editDraft}
                      onChange={setEditDraft}
                      episodeCount={episodeCount}
                    />
                    <div className="flex items-end gap-2">
                      <Button loading={savingEdit} onClick={() => handleSaveEdit(rule)}>
                        {t('common.save')}
                      </Button>
                      <Button variant="secondary" onClick={() => setEditingId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </div>
                  {editProblem && (
                    <p className="text-sm text-red-600">{t(problemKey[editProblem])}</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <RuleSummary rule={rule} />
                  {confirmDelete === rule.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">{t('rules.deleteConfirm')}</span>
                      <Button
                        variant="danger"
                        loading={deleting}
                        className="!min-h-0 !px-3 !py-1 text-xs"
                        onClick={() => handleDelete(rule)}
                      >
                        {t('common.delete')}
                      </Button>
                      <Button
                        variant="secondary"
                        className="!min-h-0 !px-3 !py-1 text-xs"
                        onClick={() => setConfirmDelete(null)}
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        className="!min-h-0 !px-3 !py-1 text-xs"
                        onClick={() => {
                          setEditProblem(null)
                          setEditDraft(ruleToDraft(rule))
                          setEditingId(rule.id)
                        }}
                      >
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        className="!min-h-0 !px-3 !py-1 text-xs !text-red-600 hover:!bg-red-50"
                        onClick={() => setConfirmDelete(rule.id)}
                      >
                        {t('common.delete')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <RuleFields draft={addDraft} onChange={setAddDraft} episodeCount={episodeCount} />
          <div className="flex items-end">
            <Button type="submit" loading={adding}>
              {t('rules.add')}
            </Button>
          </div>
        </div>
        {addProblem && <p className="text-sm text-red-600">{t(problemKey[addProblem])}</p>}
      </form>
    </section>
  )
}
