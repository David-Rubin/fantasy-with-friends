import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, collection, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import type {
  SeasonDoc,
  ContestantDoc,
  ScoringRuleDoc,
  EpisodeScoreDoc,
  ContestantScoreDoc,
  ContestantScoreEntry,
  ScoringRule,
  Contestant,
} from '../lib/types'
import { evaluateRule } from '../lib/scoring'
import { t } from '../lib/i18n'
import { logAuditEvent } from '../lib/audit'
import { trackEvent } from '../lib/analytics'

export function EpisodeScoringPage() {
  const { leagueId, seasonId, episodeNumber } = useParams<{
    leagueId: string
    seasonId: string
    episodeNumber: string
  }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const epNum = parseInt(episodeNumber ?? '1', 10)

  const [season, setSeason] = useState<SeasonDoc | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [existingScore, setExistingScore] = useState<EpisodeScoreDoc | null>(null)

  // Form state: contestantId -> ruleId -> value
  const [scores, setScores] = useState<Record<string, ContestantScoreEntry>>({})
  // Elimination toggles
  const [eliminations, setEliminations] = useState<Record<string, boolean>>({})
  const [eliminationConfirm, setEliminationConfirm] = useState<string | null>(null)
  const [unlockConfirm, setUnlockConfirm] = useState(false)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(doc(db, 'seasons', seasonId), (snap) => {
      if (snap.exists()) setSeason(snap.data() as SeasonDoc)
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'contestants'), (snap) => {
      setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'scoringRules'), (snap) => {
      setRules(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ScoringRuleDoc) })))
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId || !episodeNumber) return
    const epDoc = doc(db, 'seasons', seasonId, 'episodeScores', episodeNumber)
    const unsubEp = onSnapshot(epDoc, (snap) => {
      setExistingScore(snap.exists() ? (snap.data() as EpisodeScoreDoc) : null)
    })

    const unsubScores = onSnapshot(
      collection(db, 'seasons', seasonId, 'episodeScores', episodeNumber, 'contestantScores'),
      (snap) => {
        const map: Record<string, ContestantScoreDoc> = {}
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as ContestantScoreDoc
        })
        setScores(Object.fromEntries(Object.entries(map).map(([cid, sc]) => [cid, sc.scores])))
      }
    )

    return () => {
      unsubEp()
      unsubScores()
    }
  }, [seasonId, episodeNumber])

  // Active contestants for this episode (not eliminated before this episode)
  const activeContestants = contestants.filter(
    (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= epNum
  )

  // Rules applicable to this episode
  const episodeRules = rules.filter((r) => {
    if (r.type !== 'bonus_challenge') return true
    if (r.scope === 'season_level') return false
    if (r.scope === 'specific_episodes') {
      return r.episodeNumbers?.includes(epNum) ?? false
    }
    return true // per_episode
  })

  function setScore(contestantId: string, ruleId: string, value: boolean | number | string) {
    setScores((prev) => ({
      ...prev,
      [contestantId]: { ...(prev[contestantId] ?? {}), [ruleId]: value },
    }))
  }

  function calcTotalForContestant(contestantId: string): number {
    const entry = scores[contestantId] ?? {}
    return episodeRules.reduce((sum, rule) => sum + evaluateRule(rule, entry, contestantId), 0)
  }

  async function handleSubmit() {
    if (!seasonId || !episodeNumber || !user) return
    setSubmitting(true)
    try {
      const batch = writeBatch(db)

      // Write episode score doc
      batch.set(doc(db, 'seasons', seasonId, 'episodeScores', episodeNumber), {
        submittedAt: Date.now(),
        submittedBy: user.uid,
        locked: true,
      } satisfies EpisodeScoreDoc)

      // Write per-contestant scores
      for (const contestant of activeContestants) {
        const entry = scores[contestant.id] ?? {}
        const totalPoints = calcTotalForContestant(contestant.id)
        batch.set(
          doc(
            db,
            'seasons',
            seasonId,
            'episodeScores',
            episodeNumber,
            'contestantScores',
            contestant.id
          ),
          { scores: entry, totalPoints } satisfies ContestantScoreDoc
        )

        // Handle eliminations
        if (eliminations[contestant.id]) {
          batch.update(doc(db, 'seasons', seasonId, 'contestants', contestant.id), {
            eliminatedEpisode: epNum,
          })
        }
      }

      // Lock team names if first episode
      if (!season?.firstEpisodeScoredAt) {
        batch.update(doc(db, 'seasons', seasonId), { firstEpisodeScoredAt: Date.now() })
      }

      await batch.commit()

      await logAuditEvent({ action: 'episode_scored', seasonId, episodeNumber: epNum })
      trackEvent('episode_scored', { season_id: seasonId, episode_number: epNum })

      setSubmitConfirm(false)
      navigate(`/leagues/${leagueId}/seasons/${seasonId}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUnlock() {
    if (!seasonId || !episodeNumber || !user) return
    await updateDoc(doc(db, 'seasons', seasonId, 'episodeScores', episodeNumber), { locked: false })
    await logAuditEvent({ action: 'episode_unlocked', seasonId, episodeNumber: epNum })
    setUnlockConfirm(false)
  }

  const isLocked = existingScore?.locked ?? false

  return (
    <Layout>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('scoring.scoreEpisode', { n: epNum })}
        </h1>
        {isLocked && (
          <Button variant="secondary" onClick={() => setUnlockConfirm(true)}>
            {t('scoring.unlockEpisode')}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-3 pr-4 text-left font-medium text-gray-500">Contestant</th>
              {episodeRules.map((rule) => (
                <th
                  key={rule.id}
                  className="py-3 px-3 text-center font-medium text-gray-500 max-w-[120px]"
                >
                  <span className="block truncate" title={rule.name}>
                    {rule.name}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({rule.points > 0 ? '+' : ''}
                    {rule.points})
                  </span>
                </th>
              ))}
              <th className="py-3 pl-3 text-center font-medium text-gray-500">Pts</th>
              <th className="py-3 pl-3 text-center font-medium text-gray-500">Out</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {activeContestants.map((contestant) => (
              <tr key={contestant.id} className={eliminations[contestant.id] ? 'opacity-50' : ''}>
                <td className="py-3 pr-4 font-medium text-gray-900">{contestant.name}</td>
                {episodeRules.map((rule) => {
                  const val = scores[contestant.id]?.[rule.id]
                  if (rule.type === 'binary') {
                    return (
                      <td key={rule.id} className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={val === true}
                          disabled={isLocked}
                          onChange={(e) => setScore(contestant.id, rule.id, e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`${rule.name} for ${contestant.name}`}
                        />
                      </td>
                    )
                  }
                  if (rule.type === 'numeric') {
                    return (
                      <td key={rule.id} className="py-3 px-3">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={typeof val === 'number' ? val : ''}
                          disabled={isLocked}
                          onChange={(e) =>
                            setScore(contestant.id, rule.id, parseFloat(e.target.value) || 0)
                          }
                          className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                          aria-label={`${rule.name} for ${contestant.name}`}
                        />
                      </td>
                    )
                  }
                  // bonus_challenge — dropdown of contestants
                  return (
                    <td key={rule.id} className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={val === contestant.id}
                        disabled={isLocked}
                        onChange={(e) =>
                          setScore(contestant.id, rule.id, e.target.checked ? contestant.id : '')
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`${rule.name} — ${contestant.name}`}
                      />
                    </td>
                  )
                })}
                <td className="py-3 pl-3 text-center font-semibold text-gray-800">
                  {calcTotalForContestant(contestant.id)}
                </td>
                <td className="py-3 pl-3 text-center">
                  <button
                    type="button"
                    disabled={isLocked}
                    onClick={() => {
                      if (!eliminations[contestant.id]) {
                        setEliminationConfirm(contestant.id)
                      } else {
                        setEliminations((prev) => ({ ...prev, [contestant.id]: false }))
                      }
                    }}
                    className={[
                      'rounded px-2 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-40',
                      eliminations[contestant.id]
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600',
                    ].join(' ')}
                    aria-pressed={eliminations[contestant.id]}
                  >
                    {t('contestant.eliminated')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLocked && (
        <div className="mt-6">
          <Button onClick={() => setSubmitConfirm(true)}>{t('scoring.submitScores')}</Button>
        </div>
      )}

      {/* Elimination confirm */}
      <Modal
        open={!!eliminationConfirm}
        onClose={() => setEliminationConfirm(null)}
        title={t('contestant.markEliminated', {
          name: contestants.find((c) => c.id === eliminationConfirm)?.name ?? '',
        })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEliminationConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (eliminationConfirm)
                  setEliminations((prev) => ({ ...prev, [eliminationConfirm]: true }))
                setEliminationConfirm(null)
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('contestant.markEliminatedConfirm')}</p>
      </Modal>

      {/* Submit confirm */}
      <Modal
        open={submitConfirm}
        onClose={() => setSubmitConfirm(false)}
        title={t('scoring.submitConfirm', { n: epNum })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={submitting} onClick={handleSubmit}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">
          Scores will be submitted for {activeContestants.length} contestants.
          {Object.values(eliminations).some(Boolean) && (
            <>
              {' '}
              <span className="text-red-600 font-medium">
                {Object.values(eliminations).filter(Boolean).length} contestant(s) will be marked as
                eliminated.
              </span>
            </>
          )}
        </p>
      </Modal>

      {/* Unlock confirm */}
      <Modal
        open={unlockConfirm}
        onClose={() => setUnlockConfirm(false)}
        title={t('scoring.unlockConfirm', { n: epNum })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setUnlockConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleUnlock}>
              {t('scoring.unlockEpisode')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('scoring.unlockConfirm', { n: epNum })}</p>
      </Modal>
    </Layout>
  )
}
