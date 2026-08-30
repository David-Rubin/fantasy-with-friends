import { useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import { RuleFields, RuleSummary } from './ScoringRulesPanel'
import {
  allEpisodeNumbers,
  draftToRule,
  emptyRuleDraft,
  ruleToDraft,
  validateRuleDraft,
  type EditableRule,
  type RuleDraft,
  type RuleProblem,
} from '../lib/scoringRules'
import { saveRuleChanges } from '../lib/scoringRulesApi'
import type { ScoringRule } from '../lib/types'
import { t } from '../lib/i18n'

const problemKey: Record<RuleProblem, string> = {
  'name-required': 'rules.errors.nameRequired',
  'points-not-a-whole-number': 'rules.errors.pointsNotAWholeNumber',
  'points-zero': 'rules.errors.pointsZero',
  'episodes-required': 'rules.errors.episodesRequired',
}

/**
 * The season's scoring rules, and — for an admin — the way to change them.
 *
 * Read-only by default, because that is what everyone but an admin is here for
 * and what an admin wants most of the time too. Editing is a mode you enter
 * deliberately and leave by saving or cancelling.
 *
 * Nothing is written until Save changes. The setup panel saves each rule as it
 * is added, which is right when nothing has been scored yet; once a season is
 * running, a half-finished edit would be a half-changed season, so the whole
 * set is staged here and committed at once.
 */
export function ScoringRulesCard({
  seasonId,
  leagueId,
  rules,
  episodeCount,
  canEdit,
}: {
  seasonId: string
  leagueId: string
  rules: ScoringRule[]
  episodeCount: number
  canEdit: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<Array<{ id?: string; draft: RuleDraft }>>([])
  const [problems, setProblems] = useState<Record<number, RuleProblem>>({})
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const episodeNumbers = allEpisodeNumbers(episodeCount)

  function startEditing() {
    setDrafts(rules.map((r) => ({ id: r.id, draft: ruleToDraft(r, episodeCount) })))
    setProblems({})
    setSaveError('')
    setEditing(true)
  }

  function validate(): boolean {
    const found: Record<number, RuleProblem> = {}
    drafts.forEach(({ draft }, i) => {
      const problem = validateRuleDraft(draft)
      if (problem) found[i] = problem
    })
    setProblems(found)
    return Object.keys(found).length === 0
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const edited: EditableRule[] = drafts.map(({ id, draft }) => ({
        ...draftToRule(draft, episodeCount),
        ...(id ? { id } : {}),
      }))
      await saveRuleChanges(seasonId, leagueId, rules, edited)
      setConfirming(false)
      setEditing(false)
    } catch (error) {
      console.error('Failed to save scoring rules', error)
      setSaveError(t('common.error'))
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="mb-6 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-sm font-medium text-gray-700">
            {t('rules.heading', { n: rules.length })}
          </span>
          {canEdit && (
            <Button
              variant="secondary"
              className="!min-h-0 !px-3 !py-1 text-xs"
              onClick={startEditing}
            >
              {t('common.edit')}
            </Button>
          )}
        </div>
        <div className="border-t border-gray-100 px-5 py-4">
          {rules.length === 0 ? (
            <p className="text-sm text-gray-400">{t('rules.none')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rules.map((rule) => (
                <li key={rule.id}>
                  <RuleSummary rule={rule} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/40">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-sm font-medium text-gray-700">
          {t('rules.heading', { n: drafts.length })}
        </span>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="!min-h-0 !px-3 !py-1 text-xs"
            onClick={() => setEditing(false)}
          >
            {t('common.cancel')}
          </Button>
          <Button
            className="!min-h-0 !px-3 !py-1 text-xs"
            onClick={() => validate() && setConfirming(true)}
          >
            {t('rules.saveChanges')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-blue-100 px-5 py-4">
        {drafts.map(({ id, draft }, index) => (
          <div key={id ?? `new-${index}`} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-end gap-2">
              <RuleFields
                draft={draft}
                onChange={(next) =>
                  setDrafts((d) => d.map((row, i) => (i === index ? { ...row, draft: next } : row)))
                }
                episodeNumbers={episodeNumbers}
              />
              <Button
                variant="ghost"
                className="!min-h-0 !px-3 !py-1 text-xs !text-red-600 hover:!bg-red-50"
                onClick={() => setDrafts((d) => d.filter((_, i) => i !== index))}
              >
                {t('common.delete')}
              </Button>
            </div>
            {problems[index] && (
              <p className="text-sm text-red-600">{t(problemKey[problems[index]])}</p>
            )}
          </div>
        ))}

        <div>
          <Button
            variant="secondary"
            className="!min-h-0 !px-3 !py-1 text-xs"
            onClick={() => setDrafts((d) => [...d, { draft: emptyRuleDraft(episodeCount) }])}
          >
            {t('rules.add')}
          </Button>
        </div>
        {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('rules.confirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSave} loading={saving}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t('rules.confirmBody')}</p>
        <p className="mt-3 text-sm text-gray-600">{t('rules.confirmLocked')}</p>
      </Modal>
    </div>
  )
}
