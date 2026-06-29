import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, collection, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import type { SeasonDoc, ContestantDoc, ScoringRuleDoc, SeasonAwardDoc, Contestant, ScoringRule } from '../lib/types'
import { t } from '../lib/i18n'
import { logAuditEvent } from '../lib/audit'
import { trackEvent } from '../lib/analytics'

export function SeasonAwardsPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [awards, setAwards] = useState<SeasonAwardDoc[]>([])
  const [selections, setSelections] = useState<Record<string, string>>({}) // ruleId -> contestantId
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'contestants'), (snap) => {
      setContestants(snap.docs.map((d) => ({ id: d.id, ...d.data() as ContestantDoc })))
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'scoringRules'), (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() as ScoringRuleDoc }))
      setRules(all.filter((r) => r.type === 'bonus_challenge' && r.scope === 'season_level'))
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'seasonAwards'), (snap) => {
      const list = snap.docs.map((d) => d.data() as SeasonAwardDoc)
      setAwards(list)
      // Pre-fill selections
      const sel: Record<string, string> = {}
      list.forEach((a) => { sel[a.ruleId] = a.contestantId })
      setSelections(sel)
    })
  }, [seasonId])

  async function handleSave() {
    if (!seasonId || !user) return
    setSaving(true)
    try {
      for (const [ruleId, contestantId] of Object.entries(selections)) {
        if (!contestantId) continue
        await setDoc(doc(db, 'seasons', seasonId, 'seasonAwards', ruleId), {
          ruleId,
          contestantId,
          awardedAt: Date.now(),
          awardedBy: user.uid,
        } satisfies SeasonAwardDoc)
      }
      await logAuditEvent({ action: 'season_awards_submitted', seasonId })
      trackEvent('episode_scored', { season_id: seasonId ?? '', episode_number: 0 })
      navigate(`/leagues/${leagueId}/seasons/${seasonId}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('awards.title')}</h1>

      {rules.length === 0 ? (
        <p className="text-gray-400">No season-level awards defined.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {rules.map((rule) => {
            const existing = awards.find((a) => a.ruleId === rule.id)
            const winner = existing ? contestants.find((c) => c.id === existing.contestantId) : null
            return (
              <div key={rule.id} className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-gray-900">{rule.name}</p>
                    <p className="text-sm text-gray-500">{rule.points > 0 ? '+' : ''}{rule.points} pts</p>
                    {winner && (
                      <p className="mt-1 text-sm text-green-600 font-medium">
                        {t('awards.awarded', { name: winner.name })}
                      </p>
                    )}
                  </div>
                  <select
                    value={selections[rule.id] ?? ''}
                    onChange={(e) => setSelections((prev) => ({ ...prev, [rule.id]: e.target.value }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`${t('awards.award')} — ${rule.name}`}
                  >
                    <option value="">{t('awards.award')}…</option>
                    {contestants.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )
          })}
          <Button onClick={handleSave} loading={saving}>{t('common.save')}</Button>
        </div>
      )}
    </Layout>
  )
}
