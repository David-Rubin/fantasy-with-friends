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
import { UserAvatar } from '../components/UserAvatar'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { deleteLeague, deleteSeason, deletionErrorMessage } from '../lib/deleteApi'
import { Input, Textarea } from '../components/Input'
import { AccentColorPicker } from '../components/AccentColorPicker'
import { JoinLeagueButton } from '../components/JoinLeagueButton'
import { useMySeasonIds } from '../components/SeasonMemberGate'
import { leagueTrail } from '../lib/breadcrumbs'
import { updateLeagueDetails, removeLeagueMember } from '../lib/leagueApi'
import { approveJoinRequest, rejectJoinRequest, useMyJoinRequests } from '../lib/joinRequests'
import { canJoinDraft, canJoinSeason } from '../lib/seasonMembership'
import { joinSeason } from '../lib/seasonApi'
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
  const { user, userDoc, isSuperadmin } = useAuth()
  const navigate = useNavigate()

  const [league, setLeague] = useState<LeagueDoc | null>(null)
  const [members, setMembers] = useState<MemberWithName[]>([])
  const [seasons, setSeasons] = useState<(SeasonDoc & { id: string })[]>([])
  const [myRole, setMyRole] = useState<MemberRole | null>(null)
  const [joinRequests, setJoinRequests] = useState<LeagueJoinRequestDoc[]>([])
  const [deciding, setDeciding] = useState<string | null>(null)
  // Keyed by request, so a failure names the row it belongs to rather than
  // hanging a message over a queue that may hold several people.
  const [decideError, setDecideError] = useState<string | null>(null)
  // Distinguishes "not a member" from "membership not loaded yet", so the page
  // never flashes a Join button at someone who already belongs here.
  const [membershipResolved, setMembershipResolved] = useState(false)
  const joinRequestStatus = useMyJoinRequests(user?.uid)
  const { seasonIds: mySeasonIds, resolved: seasonMembershipResolved } = useMySeasonIds()
  const [joiningSeason, setJoiningSeason] = useState<string | null>(null)
  const [newSeasonOpen, setNewSeasonOpen] = useState(false)
  const [seasonForm, setSeasonForm] = useState({
    label: '',
    episodeCount: '',
    accentColor: 'blue' as AccentColor,
  })
  const [creating, setCreating] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', showName: '', description: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<MemberWithName | null>(null)
  const [removing, setRemoving] = useState(false)
  // The refusal from removeLeagueMember, which names the seasons in the way.
  const [removeError, setRemoveError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [seasonDeleteTarget, setSeasonDeleteTarget] = useState<(SeasonDoc & { id: string }) | null>(
    null
  )
  const [deletingSeason, setDeletingSeason] = useState(false)
  const [seasonDeleteError, setSeasonDeleteError] = useState('')
  const [deletingLeague, setDeletingLeague] = useState(false)
  const [deleteError, setDeleteError] = useState('')

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
  // Editing the league, deciding requests and removing members are all the
  // owner's call. A superadmin qualifies too — the rules already treat them as
  // an owner everywhere, and the remove callable checks for the same pair.
  const canManageLeague = isOwner || isSuperadmin
  // Season data and the roster are gated on membership; a superadmin reaches
  // both without joining.
  const canOpenSeasons = isMember || isSuperadmin
  // A season still in `setup` has no contestants, no rules and no draft — there
  // is nothing on its page for anyone but the admins building it, so members do
  // not get a link to it until it opens.
  const canOpenUnreadySeason = isAdmin || isSuperadmin
  // Deleting a season is an admin's job, not only the owner's: a season is the
  // unit an admin manages, and a botched setup is exactly what they need to be
  // able to throw away. deleteSeason enforces the same pair.
  const canDeleteSeasons = isAdmin || isSuperadmin
  // Derived rather than cleared in the listener: a demoted owner stops seeing
  // the queue on the next render, without an extra state write.
  const pendingRequests = canManageLeague ? joinRequests : []
  const myRequestStatus = leagueId ? (joinRequestStatus[leagueId] ?? null) : null

  /**
   * Leaves for the dashboard rather than waiting for the listeners to notice:
   * the league document this page is built on has just gone, so every listener
   * on it is about to report a document that does not exist.
   */
  async function handleDeleteLeague() {
    if (!leagueId) return
    setDeletingLeague(true)
    setDeleteError('')
    try {
      await deleteLeague({ leagueId })
      navigate('/dashboard')
    } catch (err) {
      console.error('Could not delete the league', err)
      setDeleteError(deletionErrorMessage(err, t('league.deleteFailed')))
      setDeletingLeague(false)
    }
  }

  async function handleDeleteSeason() {
    if (!seasonDeleteTarget) return
    setDeletingSeason(true)
    setSeasonDeleteError('')
    try {
      await deleteSeason({ seasonId: seasonDeleteTarget.id })
      // The seasons listener drops the row on its own; closing is all that is
      // left to do here.
      setSeasonDeleteTarget(null)
    } catch (err) {
      console.error('Could not delete the season', err)
      setSeasonDeleteError(deletionErrorMessage(err, t('season.deleteFailed')))
    } finally {
      setDeletingSeason(false)
    }
  }

  async function handleDecide(request: LeagueJoinRequestDoc, approve: boolean) {
    if (!leagueId || !user) return
    setDeciding(request.uid)
    setDecideError(null)
    try {
      if (approve) {
        await approveJoinRequest(leagueId, request, user.uid)
      } else {
        await rejectJoinRequest(leagueId, request.uid, user.uid)
      }
    } catch (error) {
      // Say so on the row. Without this the only sign of a failure was a line
      // in the console: the request stayed in the queue looking untouched, so
      // the obvious read was that the button had not worked, and the obvious
      // response was to reload and try again.
      console.error('Failed to decide join request', error)
      setDecideError(request.uid)
    } finally {
      setDeciding(null)
    }
  }

  // The request queue, for whoever can act on it. Readable by the league's
  // owner only, so the listener is not attached for anyone else.
  useEffect(() => {
    if (!leagueId || !canManageLeague) return
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
  }, [leagueId, canManageLeague])

  function openEdit() {
    if (!league) return
    setEditForm({
      name: league.name,
      showName: league.showName,
      description: league.description,
    })
    setEditOpen(true)
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault()
    if (!leagueId || !league) return
    setSavingEdit(true)
    try {
      await updateLeagueDetails(
        leagueId,
        { name: league.name, showName: league.showName, description: league.description },
        {
          name: editForm.name.trim(),
          showName: editForm.showName.trim(),
          description: editForm.description.trim(),
        }
      )
      setEditOpen(false)
    } catch (error) {
      // Silence here would look like a save that worked.
      console.error('Failed to update league details', error)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleRemoveMember() {
    if (!leagueId || !removeTarget) return
    setRemoving(true)
    setRemoveError('')
    try {
      await removeLeagueMember({ leagueId, uid: removeTarget.uid })
      setRemoveTarget(null)
    } catch (error) {
      // A season in progress is the expected refusal, and the function's
      // message names it — show that rather than a generic failure.
      const message = error instanceof Error ? error.message : ''
      setRemoveError(
        t('league.removeBlocked', { name: removeTarget.displayName, reason: message }).trim()
      )
    } finally {
      setRemoving(false)
    }
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

  async function handleJoinSeason(seasonId: string) {
    if (!leagueId || !user || !userDoc) return
    setJoiningSeason(seasonId)
    try {
      await joinSeason(seasonId, leagueId, user.uid, userDoc.displayName, userDoc.photoUrl)
    } finally {
      setJoiningSeason(null)
    }
  }

  async function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault()
    if (!leagueId || !user || !league) return
    setCreating(true)
    try {
      const seasonRef = await addDoc(collection(db, 'seasons'), {
        leagueId,
        label: seasonForm.label.trim(),
        episodeCount: parseInt(seasonForm.episodeCount, 10),
        state: 'setup',
        draftFormat: 'snake',
        pickOrderMethod: 'admin-set',
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

      trackEvent('season_created', { show_name: league.showName })
      setNewSeasonOpen(false)
      navigate(`/leagues/${leagueId}/seasons/${seasonRef.id}`)
    } finally {
      setCreating(false)
    }
  }

  if (!league) {
    return (
      <Layout breadcrumbs={leagueTrail(undefined)}>
        <p className="text-gray-400">{t('common.loading')}</p>
      </Layout>
    )
  }

  return (
    <Layout breadcrumbs={leagueTrail(league.name)}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{league.name}</h1>
          {league.showName && <p className="mt-1 font-medium text-gray-700">{league.showName}</p>}
          {league.description && <p className="mt-1 text-gray-500">{league.description}</p>}
          <p className="mt-1 text-sm text-gray-400">
            {league.memberCount === 1
              ? t('league.memberCountOne')
              : t('league.memberCount', { n: league.memberCount ?? 0 })}
          </p>
        </div>
        {canManageLeague && (
          <Button variant="secondary" onClick={openEdit}>
            {t('league.editDetails')}
          </Button>
        )}
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

      {/* Pending requests, for whoever can decide them. The whole section is
          absent when the queue is empty rather than showing an empty state:
          there is nothing to do about no requests, and a standing "No pending
          requests." line pushes the league's actual content down the page on
          every visit for the one person who sees it. */}
      {pendingRequests.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('league.joinRequests')}</h2>
          <div className="flex flex-col gap-2">
            {pendingRequests.map((request) => (
              <div
                key={request.uid}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-800">{request.displayName}</span>
                  {decideError === request.uid && (
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      {t('league.decideFailed')}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
                      <p className="font-semibold text-gray-900">{season.label}</p>
                    </div>
                    <Badge accent={season.accentColor}>{t(`season.states.${season.state}`)}</Badge>
                  </>
                )
                // Season pages are for members, and a season being set up is
                // only for its admins. Everyone else sees that the season
                // exists — the badge says what state it is in — as a plain
                // card, not a link onto an empty page.
                const openable =
                  canOpenSeasons && (season.state !== 'setup' || canOpenUnreadySeason)
                // A season still being set up has no pick order to disturb, so
                // a league member may let themselves in without asking anybody.
                const joinable = canJoinSeason({
                  state: season.state,
                  isLeagueMember: isMember,
                  isSeasonMember: mySeasonIds.has(season.id),
                  resolved: membershipResolved && seasonMembershipResolved,
                })
                // The way into a running draft, which used to be the whole
                // content of the season page for anyone who was not an admin.
                // Offered to exactly whoever that page would have offered it
                // to — see canJoinDraft.
                const draftOpen = canJoinDraft({
                  state: season.state,
                  isSeasonMember: mySeasonIds.has(season.id),
                  isSuperadmin,
                  resolved: seasonMembershipResolved,
                })
                // Not a link while the draft button is beside it: the button
                // is the useful destination, and the page it would otherwise
                // open says only that the draft is under way. That notice is
                // for whoever arrives another way.
                const card =
                  openable && !draftOpen ? (
                    <Link
                      to={`/leagues/${leagueId}/seasons/${season.id}`}
                      className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                    >
                      {summary}
                    </Link>
                  ) : (
                    <div className="flex flex-1 items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4">
                      {summary}
                    </div>
                  )
                // The button sits beside the card rather than inside it: the
                // card is a link when the season is openable, and a button
                // nested in a link is reachable by neither keyboard nor screen
                // reader in any predictable way.
                return (
                  <div key={season.id} className="flex items-center gap-3">
                    {card}
                    {joinable && (
                      <Button
                        onClick={() => handleJoinSeason(season.id)}
                        loading={joiningSeason === season.id}
                      >
                        {joiningSeason === season.id ? t('season.joining') : t('season.join')}
                      </Button>
                    )}
                    {/* Beside the card rather than within it, for the reason
                        above: the card is itself a link. */}
                    {draftOpen && (
                      <Link
                        to={`/leagues/${leagueId}/seasons/${season.id}/draft`}
                        className="shrink-0"
                      >
                        <Button>{t('dashboard.joinDraft')}</Button>
                      </Link>
                    )}
                    {/* Requirement is that a season can be deleted from either
                        page. Here it is any league admin, which is what
                        deleteSeason checks — wider than deleting the league
                        itself, which stays with the owner. */}
                    {canDeleteSeasons && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSeasonDeleteError('')
                          setSeasonDeleteTarget(season)
                        }}
                        className="!min-h-0 !px-3 !py-2 text-xs !text-red-700 hover:!bg-red-50"
                      >
                        {t('common.delete')}
                      </Button>
                    )}
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
                  <span className="flex min-w-0 items-center gap-2">
                    <UserAvatar displayName={m.displayName} photoUrl={m.photoUrl} />
                    <span className="truncate text-sm font-medium text-gray-800">
                      {m.displayName}
                    </span>
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
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
                    {/* The owner has nobody above them to be removed by, and a
                        league with no owner cannot get one back. */}
                    {canManageLeague && m.role !== 'owner' && m.uid !== user?.uid && (
                      <Button
                        variant="ghost"
                        className="!min-h-0 !px-2 !py-1 text-xs !text-red-600 hover:!bg-red-50"
                        onClick={() => {
                          setRemoveError('')
                          setRemoveTarget(m)
                        }}
                      >
                        {t('league.removeMember')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t('league.deleteTitle', { name: league?.name ?? '' })}
        name={league?.name ?? ''}
        consequences={[
          t('league.deleteSeasons', { n: seasons.length }),
          t('league.deleteMembers', { n: members.length }),
        ]}
        confirmLabel={t('league.delete')}
        busy={deletingLeague}
        error={deleteError}
        onConfirm={handleDeleteLeague}
      />

      <ConfirmDeleteModal
        open={seasonDeleteTarget !== null}
        onClose={() => setSeasonDeleteTarget(null)}
        title={t('season.deleteTitle', { name: seasonDeleteTarget?.label ?? '' })}
        name={seasonDeleteTarget?.label ?? ''}
        consequences={[t('season.deleteEverything')]}
        confirmLabel={t('season.delete')}
        busy={deletingSeason}
        error={seasonDeleteError}
        onConfirm={handleDeleteSeason}
      />

      {/* Edit league details */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={t('league.editDetails')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="edit-league-form" type="submit" loading={savingEdit}>
              {savingEdit ? t('league.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <form id="edit-league-form" onSubmit={handleSaveDetails} className="flex flex-col gap-4">
          <Input
            label={t('league.name')}
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />
          <Input
            label={t('league.showName')}
            value={editForm.showName}
            onChange={(e) => setEditForm((f) => ({ ...f, showName: e.target.value }))}
            placeholder="The Traitors"
            required
          />
          <Textarea
            label={t('league.description')}
            value={editForm.description}
            onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
          />
        </form>

        {/* Deleting lives here rather than on the page. It is reached about
            once in a league's life, and a red panel below the roster was
            shouting that on every visit. The dialog is already the place you
            go to change the league, and it is only opened by someone who may
            delete it — so the audience is the same without a second guard.

            This dialog closes as the confirmation opens. Leaving it up and
            stacking the two renders them into each other — both take the same
            z-index, so the confirmation bleeds through this one instead of
            covering it. Nothing is lost by closing: the confirmation is where
            the league's name is typed out. */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-semibold text-red-800">{t('delete.dangerZone')}</h3>
          <p className="mt-1 text-sm text-gray-600">{t('league.deleteExplain')}</p>
          <Button
            variant="danger"
            className="mt-3"
            onClick={() => {
              setEditOpen(false)
              setDeleteError('')
              setDeleteOpen(true)
            }}
          >
            {t('league.delete')}
          </Button>
        </div>
      </Modal>

      {/* Remove a member */}
      <Modal
        open={removeTarget !== null}
        onClose={() => setRemoveTarget(null)}
        title={t('league.removeMemberTitle', { name: removeTarget?.displayName ?? '' })}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={removing} onClick={handleRemoveMember}>
              {removing ? t('league.removing') : t('league.removeMember')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">{t('league.removeMemberExplain')}</p>
        {removeError && <p className="mt-3 text-sm text-red-600">{removeError}</p>}
      </Modal>

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
            label={t('season.label')}
            value={seasonForm.label}
            onChange={(e) => setSeasonForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Season 15 — 2026"
            required
            autoFocus
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
