import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  addDoc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { Modal } from '../components/Modal'
import { Input } from '../components/Input'
import { AccentColorPicker } from '../components/AccentColorPicker'
import type { LeagueDoc, LeagueMemberDoc, SeasonDoc, MemberRole, AccentColor } from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'
import { logAuditEvent } from '../lib/audit'

interface MemberWithName extends LeagueMemberDoc {
  uid: string
  displayName: string
}

export function LeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [league, setLeague] = useState<LeagueDoc | null>(null)
  const [members, setMembers] = useState<MemberWithName[]>([])
  const [seasons, setSeasons] = useState<(SeasonDoc & { id: string })[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [inviteCopied, setInviteCopied] = useState(false)
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
    const unsub = onSnapshot(doc(db, 'leagues', leagueId), (snap) => {
      if (snap.exists()) setLeague(snap.data() as LeagueDoc)
    })
    return unsub
  }, [leagueId])

  useEffect(() => {
    if (!leagueId) return
    const unsub = onSnapshot(collection(db, 'leagues', leagueId, 'members'), async (snap) => {
      const list: MemberWithName[] = await Promise.all(
        snap.docs.map(async (d) => {
          const userSnap = await getDoc(doc(db, 'users', d.id))
          const displayName = userSnap.exists() ? (userSnap.data().displayName as string) : d.id
          if (d.id === user?.uid) setMyRole((d.data() as LeagueMemberDoc).role)
          return { uid: d.id, displayName, ...(d.data() as LeagueMemberDoc) }
        })
      )
      setMembers(list)
    })
    return unsub
  }, [leagueId, user])

  useEffect(() => {
    if (!leagueId) return
    const unsub = onSnapshot(
      query(collection(db, 'seasons'), where('leagueId', '==', leagueId)),
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

  const isAdmin = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'

  const inviteCode = leagueId?.slice(0, 6).toUpperCase() ?? ''
  const inviteLink = `${window.location.origin}/invite/${inviteCode}`

  async function copyInviteLink() {
    await navigator.clipboard.writeText(inviteLink)
    setInviteCopied(true)
    setTimeout(() => setInviteCopied(false), 2000)
  }

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
      const inviteCode = Array.from(crypto.getRandomValues(new Uint8Array(6)))
        .map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32])
        .join('')

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
        inviteCode,
        createdAt: Date.now(),
        firstEpisodeScoredAt: null,
        teamTotals: {},
        teamEpisodeTotals: {},
      } satisfies SeasonDoc)

      // Add league members to the season by default
      for (const member of members) {
        await setDoc(doc(db, 'seasons', seasonRef.id, 'members', member.uid), {
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
      </div>

      {/* Invite */}
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {t('league.inviteCode')}
          </p>
          <p className="font-mono font-bold text-gray-900 tracking-widest">{inviteCode}</p>
          <p className="text-xs text-gray-400 truncate">{inviteLink}</p>
        </div>
        <Button variant="secondary" onClick={copyInviteLink}>
          {inviteCopied ? t('league.copied') : t('league.copyLink')}
        </Button>
      </div>

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
              {seasons.map((season) => (
                <Link
                  key={season.id}
                  to={`/leagues/${leagueId}/seasons/${season.id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{season.showName}</p>
                    <p className="text-sm text-gray-500">{season.label}</p>
                  </div>
                  <Badge accent={season.accentColor}>{t(`season.states.${season.state}`)}</Badge>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Members */}
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
