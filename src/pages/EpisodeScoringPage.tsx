import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, collection, getDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenDoc, listenQuery } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { NotASeasonMember, useSeasonMembership } from '../components/SeasonMemberGate'
import { seasonChildTrail } from '../lib/breadcrumbs'
import { useTrailNames } from '../lib/useTrailNames'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import type {
  MemberRole,
  ScoreProposalDoc,
  SeasonDoc,
  ContestantDoc,
  ScoringRuleDoc,
  EpisodeScoreDoc,
  ContestantScoreDoc,
  ContestantScoreEntry,
  ScoringRule,
  Contestant,
} from '../lib/types'
import { evaluateRule, isPenalty } from '../lib/scoring'
import { scorecardState } from '../lib/scorecard'
import { decideProposal, proposeScores } from '../lib/scoreProposalApi'
import { fingerprintOf, ruleCoversEpisode, rulesFingerprint } from '../lib/scoringRules'
import { t } from '../lib/i18n'
import { logAuditEvent } from '../lib/audit'
import { trackEvent } from '../lib/analytics'

/** A scored/not-scored cell, for the read-only table a member sees. */
/**
 * One cell of a scorecard nobody can edit.
 *
 * Three states, not two. A rule that was ticked is drawn as a green check where
 * it earns points and a red cross where it costs them, because the tick alone
 * says only that the thing happened — whether that is good news depends on the
 * column, and a card is read a column at a time. An untouched cell stays the
 * grey dash it always was.
 *
 * The cross is a deliberate risk: on its own it reads as "no". What stops it is
 * that the heading above says both the rule and its points, so the column is
 * already marked as one that takes them away. The label spells it out for
 * anyone who cannot see either the colour or the heading.
 */
function ScoreMark({
  on,
  penalty = false,
  rule,
  contestant,
}: {
  on: boolean
  /** Drawn as a cross rather than a check. See isPenalty. */
  penalty?: boolean
  rule: string
  contestant: string
}) {
  // Said in full rather than left to colour and glyph: the mark used to carry
  // the same label whether or not it was ticked, so a screen reader heard the
  // rule and the name and never the answer.
  const label = t(
    !on ? 'scoring.mark.notScored' : penalty ? 'scoring.mark.penalised' : 'scoring.mark.scored',
    { rule, contestant }
  )

  return (
    <span
      className={!on ? 'text-gray-300' : penalty ? 'text-red-600' : 'text-green-600'}
      title={label}
      aria-label={label}
    >
      {!on ? '\u2014' : penalty ? '\u00d7' : '\u2713'}
    </span>
  )
}

export function EpisodeScoringPage() {
  const { leagueId, seasonId, episodeNumber } = useParams<{
    leagueId: string
    seasonId: string
    episodeNumber: string
  }>()
  const { user, userDoc, isSuperadmin } = useAuth()
  const navigate = useNavigate()
  const epNum = parseInt(episodeNumber ?? '1', 10)

  const [season, setSeason] = useState<SeasonDoc | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [rules, setRules] = useState<ScoringRule[]>([])
  const [existingScore, setExistingScore] = useState<EpisodeScoreDoc | null>(null)

  // Form state: contestantId -> ruleId -> value
  const [scores, setScores] = useState<Record<string, ContestantScoreEntry>>({})
  const [storedTotals, setStoredTotals] = useState<Record<string, number>>({})
  // Elimination toggles
  const [eliminations, setEliminations] = useState<Record<string, boolean>>({})
  const [eliminationConfirm, setEliminationConfirm] = useState<string | null>(null)
  const [unlockConfirm, setUnlockConfirm] = useState(false)
  // Set once the admin has taken the rule changes on board, so the notice goes
  // away for the rest of this visit rather than nagging until they submit.
  const [ruleChangesApplied, setRuleChangesApplied] = useState(false)
  const [submitConfirm, setSubmitConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // A card somebody has offered for this episode, if there is one.
  const [proposal, setProposal] = useState<ScoreProposalDoc | null>(null)
  // Whether this episode has a real result, readable from inside a listener
  // that lands in an unpredictable order relative to the one that sets it.
  const officiallyScoredRef = useRef(false)
  // The admin pressed Edit or Reset and is now working on that card. Local to
  // the visit: nothing is written until they submit.
  const [adminEditingProposal, setAdminEditingProposal] = useState(false)
  const [proposeConfirm, setProposeConfirm] = useState(false)
  const [approveConfirm, setApproveConfirm] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const { canView, blocked } = useSeasonMembership(seasonId)
  // Entering scores is admin-only; every season member may read them. Without
  // this the page offered a member the full form and let the rules reject the
  // save at the end of it.
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const { leagueName, seasonName } = useTrailNames(leagueId, seasonId)

  useEffect(() => {
    if (!leagueId || !user || !canView) return
    getDoc(doc(db, 'leagues', leagueId, 'members', user.uid))
      .then((snap) => setMyRole(snap.exists() ? (snap.data() as { role: MemberRole }).role : null))
      .catch(() => setMyRole(null))
  }, [leagueId, user, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenDoc(doc(db, 'seasons', seasonId), 'scoring season', (snap) => {
      if (snap.exists()) setSeason(snap.data() as SeasonDoc)
    })
  }, [seasonId, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'contestants'),
      'scoring contestants',
      (snap) => {
        setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
      }
    )
  }, [seasonId, canView])

  useEffect(() => {
    if (!seasonId || !canView) return
    return listenQuery(
      collection(db, 'seasons', seasonId, 'scoringRules'),
      'scoring rules',
      (snap) => {
        setRules(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ScoringRuleDoc) })))
      }
    )
  }, [seasonId, canView])

  useEffect(() => {
    if (!seasonId || !episodeNumber || !canView) return
    const epDoc = doc(db, 'seasons', seasonId, 'episodeScores', episodeNumber)
    const unsubEp = listenDoc(epDoc, 'episode score', (snap) => {
      setExistingScore(snap.exists() ? (snap.data() as EpisodeScoreDoc) : null)
      officiallyScoredRef.current = snap.exists()
    })

    const unsubScores = listenQuery(
      collection(db, 'seasons', seasonId, 'episodeScores', episodeNumber, 'contestantScores'),
      'contestant scores',
      (snap) => {
        // An episode nobody has scored has no documents here, and an empty
        // snapshot has nothing to say about what the card should show — so it
        // must not say anything. It used to write `{}` over the form, which
        // meant it raced the listener that loads a suggestion into it: the two
        // arrive in whichever order the server sends them, so an admin opening
        // a suggested card from the episode list got a blank one, while the
        // same card reached by reloading the page came up filled in.
        if (snap.empty) return

        const map: Record<string, ContestantScoreDoc> = {}
        snap.docs.forEach((d) => {
          map[d.id] = d.data() as ContestantScoreDoc
        })
        setScores(Object.fromEntries(Object.entries(map).map(([cid, sc]) => [cid, sc.scores])))
        // What was actually recorded, which is what a settled episode shows —
        // recomputing it from today's rules is how a locked episode started
        // reporting numbers nobody ever submitted.
        setStoredTotals(
          Object.fromEntries(Object.entries(map).map(([cid, sc]) => [cid, sc.totalPoints]))
        )
      }
    )

    return () => {
      unsubEp()
      unsubScores()
    }
  }, [seasonId, episodeNumber, canView])

  useEffect(() => {
    if (!seasonId || !episodeNumber || !canView) return
    return listenDoc(
      doc(db, 'seasons', seasonId, 'scoreProposals', episodeNumber),
      'score proposal',
      (snap) => {
        const next = snap.exists() ? (snap.data() as ScoreProposalDoc) : null
        setProposal(next)
        // Draw the card from the suggestion, so an admin deciding on one is
        // looking at what was actually proposed and can start from it rather
        // than retyping it.
        //
        // Not for an episode that has been scored for real: that shows its own
        // result, whatever anybody once suggested. Read through a ref because
        // the two listeners land in whichever order the server sends them —
        // if this one is first the scores load and the real ones overwrite
        // them a moment later, and if it is second this skips.
        if (next?.status === 'pending' && !officiallyScoredRef.current) {
          setScores(next.scores)
          setEliminations(Object.fromEntries(next.eliminations.map((id: string) => [id, true])))
        }
      }
    )
  }, [seasonId, episodeNumber, canView])

  // Superadmins are admins of every season in the rules; the client matches.
  const isAdmin = myRole === 'owner' || myRole === 'admin' || isSuperadmin

  // Active contestants for this episode (not eliminated before this episode)
  const activeContestants = contestants.filter(
    (c) => c.eliminatedEpisode === null || c.eliminatedEpisode >= epNum
  )

  // Only the rules that name this episode — a rule scoped to the finale has no
  // business as a column in week two.
  const episodeRules = rules.filter((rule) => ruleCoversEpisode(rule, epNum))

  // The rules these totals were recorded under, against the rules in force now.
  const currentFingerprint = rulesFingerprint(rules, epNum)
  const isLockedNow = existingScore?.locked ?? false
  const appliedRules = existingScore?.appliedRules
  /**
   * Scored under one set of rules, and the season has moved on since.
   *
   * Deliberately not conditioned on the lock: a locked episode with pending
   * changes still has to *display* as it was recorded — only the offer to do
   * something about it waits for the unlock.
   *
   * An episode with no snapshot predates the field, so there is nothing to
   * compare and nothing is claimed.
   */
  const hasPendingRuleChanges =
    appliedRules !== undefined &&
    !ruleChangesApplied &&
    fingerprintOf(appliedRules) !== currentFingerprint

  /** The offer to bring it in line, which only makes sense once it is editable. */
  const canApplyRuleChanges = isAdmin && !isLockedNow && hasPendingRuleChanges

  /**
   * Until an admin applies the changes, the episode is drawn as it was
   * submitted: its own columns, its own point values, its own totals.
   */
  const showingAsRecorded = hasPendingRuleChanges && appliedRules !== undefined

  /** The columns to draw — what was recorded, or what applies now. */
  const displayRules: Array<{ id: string; name: string; points: number }> = showingAsRecorded
    ? appliedRules
    : episodeRules

  /**
   * Who may do what to this card. See src/lib/scorecard.ts — the branches got
   * too many to read in the markup once a member could fill one in.
   */
  const card = scorecardState({
    isAdmin,
    seasonClosed: season?.state === 'complete',
    officiallyScored: existingScore !== null,
    isLocked: isLockedNow,
    showingAsRecorded,
    proposalStatus: proposal?.status ?? 'none',
    adminEditingProposal,
  })
  const readOnlyTable = !card.editable

  /** Drop ticks for rules that no longer apply, so a stale one cannot be stored. */
  function applyRuleChanges() {
    setScores((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([cid, entry]) => [
          cid,
          Object.fromEntries(
            Object.entries(entry).filter(([ruleId]) =>
              episodeRules.some((rule) => rule.id === ruleId)
            )
          ),
        ])
      )
    )
    setRuleChangesApplied(true)
  }

  function setScore(contestantId: string, ruleId: string, value: boolean) {
    setScores((prev) => ({
      ...prev,
      [contestantId]: { ...(prev[contestantId] ?? {}), [ruleId]: value },
    }))
  }

  function calcTotalForContestant(contestantId: string): number {
    if (showingAsRecorded) return storedTotals[contestantId] ?? 0
    const entry = scores[contestantId] ?? {}
    return episodeRules.reduce((sum, rule) => sum + evaluateRule(rule, entry), 0)
  }

  async function handleSubmit(afterCommit?: () => Promise<void>) {
    if (!seasonId || !episodeNumber || !user) return
    setSubmitting(true)
    try {
      const batch = writeBatch(db)

      // Write episode score doc
      batch.set(doc(db, 'seasons', seasonId, 'episodeScores', episodeNumber), {
        submittedAt: Date.now(),
        submittedBy: user.uid,
        locked: true,
        // The rules as they stood, so this episode can be drawn again exactly
        // as it was however the season's rules move afterwards.
        appliedRules: episodeRules.map((r) => ({ id: r.id, name: r.name, points: r.points })),
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

      await afterCommit?.()

      await logAuditEvent({ action: 'episode_scored', seasonId, episodeNumber: epNum })
      trackEvent('episode_scored', { season_id: seasonId, episode_number: epNum })

      setSubmitConfirm(false)
      navigate(`/leagues/${leagueId}/seasons/${seasonId}`)
    } finally {
      setSubmitting(false)
    }
  }

  /** Offer the card. Writes nothing that any total is built from. */
  async function handlePropose() {
    if (!seasonId || !episodeNumber || !leagueId || !user || !userDoc) return
    setSubmitting(true)
    try {
      await proposeScores(
        seasonId,
        leagueId,
        episodeNumber,
        { uid: user.uid, displayName: userDoc.displayName },
        Object.fromEntries(activeContestants.map((c) => [c.id, scores[c.id] ?? {}])),
        activeContestants.filter((c) => eliminations[c.id]).map((c) => c.id)
      )
      trackEvent('episode_scores_proposed', { season_id: seasonId, episode_number: epNum })
      setProposeConfirm(false)
      navigate(`/leagues/${leagueId}/seasons/${seasonId}?tab=episodes`)
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * Approve: score the episode exactly as an admin filling it in would, then
   * close the suggestion out. The scoring write is the one that counts, so it
   * goes first — a failure there leaves the suggestion standing rather than
   * marking it approved for scores that were never stored.
   */
  async function handleApprove() {
    if (!seasonId || !episodeNumber || !leagueId || !user) return
    await handleSubmit(async () => {
      await decideProposal(seasonId, leagueId, episodeNumber, 'approved', user.uid)
    })
    setApproveConfirm(false)
  }

  /** Reset: clear the card, keep the suggestion on record, open the episode. */
  async function handleReset() {
    if (!seasonId || !episodeNumber || !leagueId || !user) return
    setSubmitting(true)
    try {
      await decideProposal(seasonId, leagueId, episodeNumber, 'discarded', user.uid)
      setScores({})
      setEliminations({})
      setAdminEditingProposal(true)
      setResetConfirm(false)
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

  if (blocked) return <NotASeasonMember leagueId={leagueId} />

  return (
    <Layout
      breadcrumbs={seasonChildTrail(
        leagueId,
        leagueName,
        seasonId,
        seasonName,
        t('nav.episode', { n: epNum }),
        { label: t('season.tabs.episodes'), tab: 'episodes' }
      )}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {card.editable
            ? t('scoring.scoreEpisode', { n: epNum })
            : t('scoring.episodeScores', { n: epNum })}
        </h1>
        {card.actions.includes('unlock') && (
          <Button variant="secondary" onClick={() => setUnlockConfirm(true)}>
            {t('scoring.unlockEpisode')}
          </Button>
        )}
      </div>

      {canApplyRuleChanges && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">{t('scoring.ruleChangesTitle')}</p>
          <p className="mt-1 text-sm text-amber-800">{t('scoring.ruleChangesBody')}</p>
          <Button variant="secondary" className="mt-3" onClick={applyRuleChanges}>
            {t('scoring.applyRuleChanges')}
          </Button>
        </div>
      )}

      {/* Both axes scroll inside this box rather than the page, which is what
          lets the header row and the contestant column stay put. `border-separate`
          matters: with `border-collapse` a browser hands the borders to the table
          and a stuck cell scrolls out from under its own lines. */}
      <div className="relative max-h-[70vh] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {/* The corner sits above both, so it outranks each of them. */}
              <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-200 bg-white py-3 px-4 text-left font-medium text-gray-500">
                {t('scoring.contestant')}
              </th>
              {displayRules.map((rule) => (
                <th
                  key={rule.id}
                  className="sticky top-0 z-20 min-w-[7rem] max-w-[9rem] border-b border-gray-200 bg-white py-3 px-3 text-center align-bottom font-medium text-gray-500"
                >
                  {/* Wrapped, not truncated: a rule name is what the column
                      means, and half of one is no use to whoever is ticking. */}
                  <span className="block whitespace-normal break-words">{rule.name}</span>
                  <span className="text-xs text-gray-400">
                    ({rule.points > 0 ? '+' : ''}
                    {rule.points})
                  </span>
                </th>
              ))}
              <th className="sticky top-0 z-20 border-b border-gray-200 bg-white py-3 px-3 text-center font-medium text-gray-500">
                {t('scoring.points')}
              </th>
              <th className="sticky top-0 z-20 border-b border-gray-200 bg-white py-3 px-3 text-center font-medium text-gray-500">
                {t('scoring.out')}
              </th>
            </tr>
          </thead>
          <tbody>
            {activeContestants.map((contestant) => (
              <tr key={contestant.id} className={eliminations[contestant.id] ? 'opacity-50' : ''}>
                {/* Stuck to the left edge, so a wide rule set scrolls past a
                    name that stays readable. Opaque, or the cells it covers
                    show through. */}
                <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white py-3 px-4 font-medium text-gray-900">
                  {contestant.name}
                </td>
                {displayRules.map((rule) => {
                  const val = scores[contestant.id]?.[rule.id]
                  // A checkbox is an invitation to tick it. An admin looking at
                  // a locked episode — or at one still showing the rules it was
                  // recorded under — cannot, so they get the same marks
                  // everybody else gets rather than a row of dead boxes.
                  if (readOnlyTable) {
                    return (
                      <td key={rule.id} className="border-b border-gray-100 py-3 px-3 text-center">
                        <ScoreMark
                          on={val === true}
                          penalty={isPenalty(rule.points)}
                          rule={rule.name}
                          contestant={contestant.name}
                        />
                      </td>
                    )
                  }
                  return (
                    <td key={rule.id} className="border-b border-gray-100 py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={val === true}
                        disabled={readOnlyTable}
                        onChange={(e) => setScore(contestant.id, rule.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        aria-label={`${rule.name} for ${contestant.name}`}
                      />
                    </td>
                  )
                })}
                <td className="border-b border-gray-100 py-3 px-3 text-center font-semibold text-gray-800">
                  {calcTotalForContestant(contestant.id)}
                </td>
                <td className="border-b border-gray-100 py-3 px-3 text-center">
                  {/* Left as a check. Being eliminated is not a scoring rule and
                      costs no points — the column records what happened, and
                      giving it the penalty cross would imply a deduction that
                      does not exist. */}
                  {readOnlyTable ? (
                    <ScoreMark
                      on={!!eliminations[contestant.id]}
                      rule={t('contestant.eliminated')}
                      contestant={contestant.name}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={readOnlyTable}
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Whatever this viewer may do with the card, in the order they would
          reach for it: the decision that settles the episode first. */}
      {card.actions.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-3">
          {card.actions.includes('submit') && (
            <Button onClick={() => setSubmitConfirm(true)}>{t('scoring.submitScores')}</Button>
          )}
          {card.actions.includes('submitForApproval') && (
            <Button onClick={() => setProposeConfirm(true)}>
              {t('scoring.submitForApproval')}
            </Button>
          )}
          {card.actions.includes('approve') && (
            <Button onClick={() => setApproveConfirm(true)}>{t('scoring.approveScores')}</Button>
          )}
          {card.actions.includes('edit') && (
            <Button variant="secondary" onClick={() => setAdminEditingProposal(true)}>
              {t('scoring.editScores')}
            </Button>
          )}
          {card.actions.includes('reset') && (
            <Button variant="secondary" onClick={() => setResetConfirm(true)}>
              {t('scoring.resetScores')}
            </Button>
          )}
        </div>
      )}

      {card.notice === 'seasonClosed' && (
        <p className="mt-6 text-sm text-gray-500">{t('season.completedNotice')}</p>
      )}

      {card.notice === 'pendingApproval' && (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('scoring.pendingApproval')}
        </p>
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

      {/* Sending a card for approval */}
      <Modal
        open={proposeConfirm}
        onClose={() => setProposeConfirm(false)}
        title={t('scoring.submitForApproval')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setProposeConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={submitting} onClick={handlePropose}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('scoring.submitForApprovalConfirm', { n: epNum })}</p>
      </Modal>

      {/* Approving one */}
      <Modal
        open={approveConfirm}
        onClose={() => setApproveConfirm(false)}
        title={t('scoring.approveScores')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproveConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={submitting} onClick={handleApprove}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('scoring.approveConfirm', { n: epNum })}</p>
      </Modal>

      {/* Clearing one */}
      <Modal
        open={resetConfirm}
        onClose={() => setResetConfirm(false)}
        title={t('scoring.resetScores')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResetConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={submitting} onClick={handleReset}>
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-gray-600">{t('scoring.resetConfirm')}</p>
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
            <Button loading={submitting} onClick={() => handleSubmit()}>
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
