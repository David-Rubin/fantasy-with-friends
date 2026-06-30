import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, onSnapshot, collection, updateDoc, addDoc, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { ContestantCard } from '../components/ContestantCard'
import { TimerBanner } from '../components/TimerBanner'
import type {
  SeasonDoc,
  DraftDoc,
  ContestantDoc,
  SeasonMemberDoc,
  MemberRole,
  Contestant,
} from '../lib/types'
import { resolvePickOrder, advancePick } from '../lib/draft'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'

interface MemberInfo extends SeasonMemberDoc {
  uid: string
  displayName: string
}

export function DraftRoomPage() {
  const { leagueId, seasonId } = useParams<{ leagueId: string; seasonId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [season, setSeason] = useState<SeasonDoc | null>(null)
  const [draft, setDraft] = useState<DraftDoc | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)
  const [contestants, setContestants] = useState<Contestant[]>([])
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [teamName, setTeamName] = useState('')
  const [savingTeamName, setSavingTeamName] = useState(false)
  const [startingDraft, setStartingDraft] = useState(false)

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(doc(db, 'seasons', seasonId), (snap) => {
      if (snap.exists()) setSeason(snap.data() as SeasonDoc)
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId || !user) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'members'), async (snap) => {
      const list: MemberInfo[] = await Promise.all(
        snap.docs.map(async (d) => {
          const userSnap = await getDoc(doc(db, 'users', d.id))
          const displayName = userSnap.exists() ? (userSnap.data().displayName as string) : d.id
          const data = d.data() as SeasonMemberDoc
          if (d.id === user.uid) setTeamName(data.teamName)
          return { uid: d.id, displayName, ...data }
        })
      )
      setMembers(list)
      if (leagueId) {
        const roleSnap = await getDoc(doc(db, 'leagues', leagueId, 'members', user.uid))
        if (roleSnap.exists()) setMyRole((roleSnap.data() as { role: MemberRole }).role)
      }
    })
  }, [seasonId, user, leagueId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'contestants'), (snap) => {
      setContestants(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContestantDoc) })))
    })
  }, [seasonId])

  useEffect(() => {
    if (!seasonId) return
    return onSnapshot(collection(db, 'seasons', seasonId, 'draft'), (snap) => {
      if (!snap.empty) {
        const d = snap.docs[0]
        setDraftId(d.id)
        setDraft(d.data() as DraftDoc)
      }
    })
  }, [seasonId])

  const isAdmin = myRole === 'owner' || myRole === 'admin'
  const isMyTurn = draft?.status === 'active' && draft.currentPickerUid === user?.uid

  const available = contestants.filter((c) => !c.draftedByUid && c.eliminatedEpisode === null)
  const drafted = contestants.filter((c) => c.draftedByUid)

  async function handleStartDraft() {
    if (!seasonId || !season || !user) return
    setStartingDraft(true)
    try {
      const memberUids = members.map((m) => m.uid)
      const pickOrder = resolvePickOrder(season.pickOrderMethod, memberUids)

      const draftRef = await addDoc(collection(db, 'seasons', seasonId, 'draft'), {
        status: 'active',
        currentPickerUid: pickOrder[0],
        currentRound: 1,
        currentPickNumber: 1,
        pickOrder,
        timerExpiresAt: Date.now() + season.timerSeconds * 1000,
      } satisfies DraftDoc)
      setDraftId(draftRef.id)

      // Assign pick positions to members
      for (let i = 0; i < pickOrder.length; i++) {
        await updateDoc(doc(db, 'seasons', seasonId, 'members', pickOrder[i]), {
          pickPosition: i + 1,
        })
      }

      await updateDoc(doc(db, 'seasons', seasonId), { state: 'draft' })
      trackEvent('draft_started', { season_id: seasonId, player_count: memberUids.length })
    } finally {
      setStartingDraft(false)
    }
  }

  async function handlePick(contestantId: string, onBehalfOf?: string) {
    if (!seasonId || !draft || !draftId || !user) return

    const pickerUid = onBehalfOf ?? user.uid

    await addDoc(collection(db, 'seasons', seasonId, 'draft', draftId, 'picks'), {
      contestantId,
      pickerUid,
      actingAdminUid: onBehalfOf ? user.uid : null,
      round: draft.currentRound,
      pickNumber: draft.currentPickNumber,
      // eslint-disable-next-line react-hooks/purity
      timestamp: Date.now(),
    })

    await updateDoc(doc(db, 'seasons', seasonId, 'contestants', contestantId), {
      draftedByUid: pickerUid,
      draftedRound: draft.currentRound,
    })

    await logAuditEvent({
      action: onBehalfOf ? 'admin_proxy_pick' : 'draft_pick',
      seasonId,
      contestantId,
      targetUid: onBehalfOf,
    })

    trackEvent('draft_pick_made', {
      round: draft.currentRound,
      pick_number: draft.currentPickNumber,
    })

    const remainingCount = available.length - 1
    if (remainingCount === 0) {
      // Draft complete
      await updateDoc(doc(db, 'seasons', seasonId, 'draft', draftId), {
        status: 'complete',
        currentPickerUid: null,
        timerExpiresAt: null,
      })
      await updateDoc(doc(db, 'seasons', seasonId), { state: 'active' })
      trackEvent('draft_completed', { season_id: seasonId, total_picks: contestants.length - 1 })
      return
    }

    // Advance to next pick
    const next = advancePick({
      pickOrder: draft.pickOrder,
      currentRound: draft.currentRound,
      currentPickNumber: draft.currentPickNumber,
      totalContestants: contestants.length,
    })

    if (!next) {
      await updateDoc(doc(db, 'seasons', seasonId, 'draft', draftId), {
        status: 'complete',
        currentPickerUid: null,
        timerExpiresAt: null,
      })
      await updateDoc(doc(db, 'seasons', seasonId), { state: 'active' })
      return
    }

    const nextPickerIdx =
      next.round % 2 === 0 ? draft.pickOrder.length - next.pickNumber : next.pickNumber - 1
    const nextPickerUid = draft.pickOrder[nextPickerIdx]

    await updateDoc(doc(db, 'seasons', seasonId, 'draft', draftId), {
      currentRound: next.round,
      currentPickNumber: next.pickNumber,
      currentPickerUid: nextPickerUid,
      // eslint-disable-next-line react-hooks/purity
      timerExpiresAt: Date.now() + (season?.timerSeconds ?? 60) * 1000,
    })
  }

  async function handleSaveTeamName() {
    if (!seasonId || !user) return
    setSavingTeamName(true)
    try {
      await updateDoc(doc(db, 'seasons', seasonId, 'members', user.uid), { teamName })
      await logAuditEvent({ action: 'team_renamed', seasonId })
    } finally {
      setSavingTeamName(false)
    }
  }

  const currentPickerName = draft?.currentPickerUid
    ? (members.find((m) => m.uid === draft.currentPickerUid)?.displayName ?? 'Unknown')
    : ''

  const myMember = members.find((m) => m.uid === user?.uid)

  if (!season) {
    return (
      <Layout>
        <p className="text-gray-400">{t('common.loading')}</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">
          {season.showName} — {t('dashboard.joinDraft')}
        </h1>
      </div>

      {/* Draft complete */}
      {draft?.status === 'complete' && (
        <div className="mb-6 rounded-2xl bg-green-50 border border-green-200 p-6 text-center">
          <p className="text-lg font-semibold text-green-800">
            {t('draft.complete.banner', { teamName: myMember?.teamName ?? '' })}
          </p>
          <Button
            className="mt-4"
            onClick={() => navigate(`/leagues/${leagueId}/seasons/${seasonId}`)}
          >
            {t('draft.complete.viewSeason')}
          </Button>
        </div>
      )}

      {/* Lobby */}
      {(!draft || draft.status === 'lobby') && (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-6">
          <p className="text-gray-500 mb-4">{t('draft.lobby.waitingForAdmin')}</p>
          <div className="flex flex-col gap-2 mb-4">
            {members.map((m) => (
              <div key={m.uid} className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{m.displayName}</span>
                {m.pickPosition && (
                  <span className="text-gray-400">
                    {t('draft.lobby.yourPosition', { n: m.pickPosition })}
                  </span>
                )}
              </div>
            ))}
          </div>
          {isAdmin && (
            <Button onClick={handleStartDraft} loading={startingDraft}>
              {t('draft.lobby.startDraft')}
            </Button>
          )}
        </div>
      )}

      {/* Active draft */}
      {draft?.status === 'active' && (
        <>
          <TimerBanner
            pickerName={currentPickerName}
            timerExpiresAt={draft.timerExpiresAt}
            durationSeconds={season.timerSeconds}
            isYourTurn={isMyTurn}
          />

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Contestant list */}
            <div className="lg:col-span-2">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Available ({available.length})
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                {available.map((c) => (
                  <ContestantCard
                    key={c.id}
                    contestant={c}
                    canPick={isMyTurn}
                    canPickFor={
                      isAdmin && !isMyTurn && draft.currentPickerUid
                        ? members.find((m) => m.uid === draft.currentPickerUid)?.displayName
                        : undefined
                    }
                    onPick={() => handlePick(c.id)}
                    onPickFor={() => handlePick(c.id, draft.currentPickerUid ?? undefined)}
                  />
                ))}
              </div>

              {drafted.length > 0 && (
                <>
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    Drafted ({drafted.length})
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {drafted.map((c) => {
                      const owner = members.find((m) => m.uid === c.draftedByUid)
                      return (
                        <ContestantCard key={c.id} contestant={c} ownerName={owner?.displayName} />
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Team rosters */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Teams
              </h2>
              <div className="flex flex-col gap-4">
                {members
                  .sort((a, b) => (a.pickPosition ?? 99) - (b.pickPosition ?? 99))
                  .map((member) => {
                    const teamContestants = contestants.filter((c) => c.draftedByUid === member.uid)
                    const isCurrentPicker = draft.currentPickerUid === member.uid
                    return (
                      <div
                        key={member.uid}
                        className={`rounded-xl border p-4 ${isCurrentPicker ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}
                      >
                        {member.uid === user?.uid ? (
                          <div className="flex gap-2 mb-2">
                            <input
                              type="text"
                              value={teamName}
                              onChange={(e) => setTeamName(e.target.value)}
                              className="flex-1 text-sm font-semibold border-b border-gray-300 bg-transparent focus:outline-none focus:border-blue-500"
                              aria-label={t('draft.active.teamName')}
                            />
                            <button
                              type="button"
                              onClick={handleSaveTeamName}
                              disabled={savingTeamName}
                              className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                            >
                              {t('common.save')}
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm font-semibold text-gray-800 mb-2">
                            {member.teamName}
                          </p>
                        )}
                        <p className="text-xs text-gray-400 mb-2">{member.displayName}</p>
                        {teamContestants.length === 0 ? (
                          <p className="text-xs text-gray-300 italic">No picks yet</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {teamContestants.map((c) => (
                              <li key={c.id} className="text-xs text-gray-700">
                                • {c.name}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
