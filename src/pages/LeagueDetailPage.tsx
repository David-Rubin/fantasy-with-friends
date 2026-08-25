import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  doc,
  collection,
  collectionGroup,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenDoc, listenQuery } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { AccentColorPicker } from '../components/AccentColorPicker'
import { JoinLeagueButton } from '../components/JoinLeagueButton'
import { approveJoinRequest, rejectJoinRequest, useMyJoinRequests } from '../lib/joinRequests'
import type {
  LeagueDoc,
  LeagueJoinRequestDoc,
  LeagueMemberDoc,
  SeasonDoc,
  MemberRole,
  AccentColor,
} from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'

interface MemberWithName extends LeagueMemberDoc {
  uid: string
  displayName: string
}

export function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user, isSuperadmin } = useAuth()
  const navigate = useNavigate()

  const [league, setLeague] = useState<LeagueDoc | null>(null)
  const [members, setMembers] = useState<MemberWithName[]>([])
  const [seasons, setSeasons] = useState<(SeasonDoc & { id: string })[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [joinRequests, setJoinRequests] = useState<LeagueJoinRequestDoc[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  // Distinguishes "not a member" from "membership not loaded yet", so the page
  // never flashes a Join button at someone who already belongs here.
  const [membershipResolved, setMembershipResolved] = useState(false)
  const joinRequestStatus = useMyJoinRequests(user?.uid)
  const [newSeasonOpen, setNewSeasonOpen] = useState(false)
  const [seasonForm, setSeasonForm] = useState({
    showName: '',
    label: '',
    episodeCount: '',
    accentColor: 'blue' as AccentColor,
  })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!leagueId) return
    const unsub = listenDoc(doc(db, 'leagues', leagueId), 'league', (snap) => {
      if (snap.exists()) setLeague(snap.data() as LeagueDoc)
    })
    return unsub
  }, [leagueId])

  // Is this user a member, and in what role? Asked through the collection group
  // rule that authorizes a user's own membership documents, not by reading the
  // league's roster: that subcollection is closed to non-members, and this page
  // is now reachable before joining, so reading it first would mean a denied
  // read on every pre-join visit.
  useEffect(() => {
    if (!leagueId || !user) return
    const unsub = listenQuery(
      query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
      'my league membership',
      (snap) => {
        const mine = snap.docs.find(
          (d) =>
            d.ref.parent.parent?.id === leagueId && d.ref.parent.parent?.parent?.id === 'leagues'
        )
        setMyRole(mine ? (mine.data() as LeagueMemberDoc).role : null)
        setMembershipResolved(true)
      },
      () => setMembershipResolved(true)
    )
    return unsub
  }, [leagueId, user])

  // The roster itself is members-only. A superadmin can read it without being a
  // member, which is the point of the app-level role.
  useEffect(() => {
    if (!leagueId || !(myRole || isSuperadmin)) return
    const unsub = listenQuery(
      collection(db, 'leagues', leagueId, 'members'),
      'league members',
      (snap) => {
        const list: MemberWithName[] = snap.docs.map((d) => {
          const data = d.data() as LeagueMemberDoc
          // displayName is stored on the member doc; reading users/{uid} for
          // anyone but yourself is denied, and that doc also holds their email.
          return { ...data, uid: d.id, displayName: data.displayName || d.id }
        })
        setMembers(list)
      }
    )
    return unsub
  }, [leagueId, myRole, isSuperadmin])

  useEffect(() => {
    if (!leagueId) return
    const unsub = listenQuery(
      query(collection(db, 'seasons'), where('leagueId', '==', leagueId)),
      'league seasons',
      (snap) => {
        setSeasons(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as SeasonDoc) }))
            .sort((a, b) => b.createdAt - a.createdAt)
        )
      }
    )
    return unsub
  }, [leagueId])

  const isMember = myRole !== null
  const isAdmin = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'
  // Deciding requests is the owner's call. A superadmin qualifies too — the
  // rules already treat them as an owner everywhere.
  const canDecideRequests = isOwner || isSuperadmin
  // Season data and the roster are gated on membership; a superadmin reaches
  // both without joining.
  const canOpenSeasons = isMember || isSuperadmin
  // Derived rather than cleared in the listener: a demoted owner stops seeing
  // the queue on the next render, without an extra state write.
  const pendingRequests = canDecideRequests ? joinRequests : []
  const myRequestStatus = leagueId ? (joinRequestStatus[leagueId] ?? null) : null

  async function handleDecide(request: LeagueJoinRequestDoc, approve: boolean) {
    if (!leagueId || !user) return
    setDeciding(request.uid)
    try {
      if (approve) {
        await approveJoinRequest(leagueId, request, user.uid)
      } else {
        await rejectJoinRequest(leagueId, request.uid, user.uid)
      }
    } catch (error) {
      // A denied or partial write would otherwise leave the row looking decided.
      console.error('Failed to decide join request', error)
    } finally {
      setDeciding(null)
    }
  }

  // The request queue, for whoever can act on it. Readable by the league's
  // owner only, so the listener is not attached for anyone else.
  useEffect(() => {
    if (!leagueId || !canDecideRequests) return
    const unsub = listenQuery(
      query(collection(db, 'leagues', leagueId, 'joinRequests'), where('status', '==', 'pending')),
      'league join requests',
      (snap) => {
        setJoinRequests(
          snap.docs
            .map((d) => d.data() as LeagueJoinRequestDoc)
            .sort((a, b) => a.requestedAt - b.requestedAt)
        )
      }
    )
    return unsub
  }, [leagueId, canDecideRequests])

  async function handleChangeRole(uid: string, newRole: MemberRole) {
    if (!leagueId || !user) return
    await updateDoc(doc(db, 'leagues', leagueId, 'members', uid), { role: newRole })
    await logAuditEvent({
      action: newRole === 'admin' ? 'admin_role_granted' : 'admin_role_revoked',
      leagueId,
      targetUid: uid,
    })
  }

  async function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault()
    if (!leagueId || !user) return
    setCreating(true)
    try {
      const seasonRef = await addDoc(collection(db, 'seasons'), {
        leagueId,
        showName: seasonForm.showName.trim(),
        label: seasonForm.label.trim(),
        episodeCount: parseInt(seasonForm.episodeCount, 10),
        state: 'setup',
        draftFormat: 'snake',
        pickOrderMethod: 'randomized',
        timerSeconds: 60,
        timerExpiry: 'auto-pick',
        accentColor: seasonForm.accentColor,
        createdAt: Date.now(),
        firstEpisodeScoredAt: null,
        teamTotals: {},
        teamEpisodeTotals: {},
      } satisfies SeasonDoc)

      // Add league members to the season by default
      for (const member of members) {
        await setDoc(doc(db, 'seasons', seasonRef.id, 'members', member.uid), {
          uid: member.uid,
          displayName: member.displayName,
          teamName: `${member.displayName}'s Team`,
          pickPosition: null,
          joinedAt: Date.now(),
        })
      }

      trackEvent('season_created', { show_name: seasonForm.showName.trim() })
      setNewSeasonOpen(false)
      navigate(`/leagues/${leagueId}/seasons/${seasonRef.id}`)
    } finally {
      setCreating(false)
    }
  }

  if (!league) {
    return (
      <Layout>
        <p className="text-gray-400">{t('common.loading')}</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
        {league.description && <p className="mt-1 text-gray-500">{league.description}</p>}
        <p className="mt-1 text-sm text-gray-400">
          {league.memberCount === 1
            ? t('league.memberCountOne')
            : t('league.memberCount', { n: league.memberCount ?? 0 })}
        </p>
      </div>

      {/* Not a member: explain, and offer to ask */}
      {membershipResolved && !isMember && (
        <div className="mb-8 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {/* A superadmin is not a member but can still open everything, so
                the "join to see the seasons" half does not apply to them. */}
            <p className="text-sm text-gray-600">
              {canOpenSeasons ? t('league.notAMemberSuperadmin') : t('league.notAMember')}
            </p>
            {myRequestStatus === 'rejected' && (
              <p className="mt-1 text-sm text-amber-700">{t('league.requestRejected')}</p>
            )}
          </div>
          {leagueId && <JoinLeagueButton leagueId={leagueId} status={myRequestStatus} />}
        </div>
      )}

      {/* Pending requests, for the owner to decide */}
      {canDecideRequests && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('league.joinRequests')}</h2>
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400">{t('league.noJoinRequests')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {pendingRequests.map((request) => (
                <div
                  key={request.uid}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium text-gray-800">{request.displayName}</span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      loading={deciding === request.uid}
                      onClick={() => handleDecide(request, false)}
                    >
                      {t('league.reject')}
                    </Button>
                    <Button
                      loading={deciding === request.uid}
                      onClick={() => handleDecide(request, true)}
                    >
                      {t('league.approve')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Seasons */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Seasons</h2>
            {isAdmin && (
              <Button onClick={() => setNewSeasonOpen(true)}>{t('league.newSeason')}</Button>
            )}
          </div>
          {seasons.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center">
              <p className="text-gray-400">No seasons yet.</p>
              {isAdmin && (
                <Button className="mt-4" onClick={() => setNewSeasonOpen(true)}>
                  {t('league.newSeason')}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {seasons.map((season) => {
                const summary = (
                  <>
                    <div>
                      <p className="font-semibold text-gray-900">{season.showName}</p>
                      <p className="text-sm text-gray-500">{season.label}</p>
                    </div>
                    <Badge accent={season.accentColor}>{t(`season.states.${season.state}`)}</Badge>
                  </>
                )
                // Season pages are for members. A non-member sees which seasons
                // exist — enough to judge whether to join — as plain cards, not
                // links that would only land them on a refusal.
                return canOpenSeasons ? (
                  <Link
                    key={season.id}
                    to={`/leagues/${leagueId}/seasons/${season.id}`}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                  >
                    {summary}
                  </Link>
                ) : (
                  <div
                    key={season.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4"
                  >
                    {summary}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Members — the roster is not readable before joining */}
        {canOpenSeasons && (
          <section>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('league.members')}</h2>
            <div className="flex flex-col gap-2">
              {members.map((m) => (
                <div
                  key={m.uid}
                  className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium text-gray-800">{m.displayName}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 capitalize">{m.role}</span>
                    {isOwner && m.uid !== user?.uid && (
                      <select
                        value={m.role}
                        onChange={(e) => handleChangeRole(m.uid, e.target.value as MemberRole)}
                        className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label={`Role for ${m.displayName}`}
                      >
                        <option value="member">{t('league.roles.member')}</option>
                        <option value="admin">{t('league.roles.admin')}</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* New Season Modal */}
      <Modal
        open={newSeasonOpen}
        onClose={() => setNewSeasonOpen(false)}
        title={t('season.create')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewSeasonOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="new-season-form" type="submit" loading={creating}>
              {t('season.create')}
            </Button>
          </>
        }
      >
        <form id="new-season-form" onSubmit={handleCreateSeason} className="flex flex-col gap-4">
          <Input
            label={t('season.showName')}
            value={seasonForm.showName}
            onChange={(e) => setSeasonForm((f) => ({ ...f, showName: e.target.value }))}
            required
            autoFocus
          />
          <Input
            label={t('season.label')}
            value={seasonForm.label}
            onChange={(e) => setSeasonForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Season 15 — 2026"
            required
          />
          <Input
            label={t('season.episodeCount')}
            type="number"
            min={1}
            value={seasonForm.episodeCount}
            onChange={(e) => setSeasonForm((f) => ({ ...f, episodeCount: e.target.value }))}
            required
          />
          <AccentColorPicker
            value={seasonForm.accentColor}
            onChange={(c) => setSeasonForm((f) => ({ ...f, accentColor: c }))}
          />
        </form>
      </Modal>
    </Layout>
  )
}
