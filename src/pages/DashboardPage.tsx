import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  doc,
  getDocs,
  addDoc,
  setDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenQuery } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from '../components/Layout'
import { Button } from '../components/Button'
import { Modal } from '../components/Modal'
import { Input, Textarea } from '../components/Input'
import { SeasonStateBadge } from '../components/SeasonStateBadge'
import { JoinLeagueButton } from '../components/JoinLeagueButton'
import { dashboardTrail } from '../lib/breadcrumbs'
import { useMyJoinRequests } from '../lib/joinRequests'
import { storedPhotoFields } from '../lib/photoCrop'
import { sortLeaguesByStatus } from '../lib/leagueStatus'
import {
  chunkIds,
  groupSeasonsByLeague,
  joinLeaguesWithSeasons,
  leagueIdKey,
} from '../lib/dashboardLeagues'
import type { LeagueDoc, LeagueMemberDoc, SeasonDoc } from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'

type LeagueWithId = LeagueDoc & { id: string }
type SeasonWithId = SeasonDoc & { id: string }

function memberCountLabel(count: number): string {
  return count === 1 ? t('league.memberCountOne') : t('league.memberCount', { n: count })
}

export function DashboardPage() {
  const { user, userDoc } = useAuth()
  const navigate = useNavigate()
  /**
   * The three pieces the "my leagues" list is assembled from, each settling on
   * its own. `null` means "not answered yet" — distinct from an answered
   * empty, which is what the empty state is allowed to render.
   */
  const [myLeagueIds, setMyLeagueIds] = useState<string[] | null>(null)
  const [allLeagues, setAllLeagues] = useState<LeagueWithId[] | null>(null)
  /**
   * The seasons, tagged with the membership they were fetched for. Tagged
   * rather than bare so a list left over from the previous membership is never
   * mistaken for an answer about the current one — the rows would otherwise
   * render with the wrong badge for as long as the new fetch took.
   */
  const [seasons, setSeasons] = useState<{
    key: string
    byLeague: Record<string, SeasonWithId[]>
  } | null>(null)
  const joinRequestStatus = useMyJoinRequests(user?.uid)
  const [createOpen, setCreateOpen] = useState(false)
  const [leagueName, setLeagueName] = useState('')
  const [leagueShow, setLeagueShow] = useState('')
  const [leagueDesc, setLeagueDesc] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!user) return

    // Watch this user's member docs across every league. The `uid` filter is not
    // just an optimization — security rules can only authorize a collection group
    // query that constrains a field, so removing it breaks the listener.
    const membersQuery = query(collectionGroup(db, 'members'), where('uid', '==', user.uid))

    return listenQuery(
      membersQuery,
      'dashboard leagues',
      (snap) => {
        const leagueIds = new Set<string>()
        snap.docs.forEach((d) => {
          // Only leagues/{id}/members/{uid} docs, not seasons/{id}/members/{uid}
          if (d.ref.parent.parent?.parent?.id === 'leagues') {
            const leagueId = d.ref.parent.parent?.id
            if (leagueId) leagueIds.add(leagueId)
          }
        })
        // No reads happen here any more: this handler only says which leagues
        // the user is in. The documents themselves arrive through the listener
        // below, and the seasons through one batched fetch — so a member write
        // that leaves the membership unchanged costs nothing.
        setMyLeagueIds([...leagueIds])
      },
      // listenQuery logs; this settles the state so a denied read shows the
      // empty state rather than hanging on "Loading…"
      () => setMyLeagueIds([])
    )
  }, [user])

  // Every league in the app, member or not. It feeds both lists: the browse
  // list below, and — since a league document is readable by any signed-in user
  // — the rows for the user's own leagues, which therefore need no per-league
  // fetch of their own.
  useEffect(() => {
    if (!user) return
    return listenQuery(
      query(collection(db, 'leagues'), orderBy('createdAt', 'desc')),
      'all leagues',
      (snap) => setAllLeagues(snap.docs.map((d) => ({ id: d.id, ...(d.data() as LeagueDoc) }))),
      () => setAllLeagues([])
    )
  }, [user])

  // Which leagues to fetch seasons for, as a value that only changes when the
  // membership itself does — so a renamed member does not restart the fetch.
  const myLeagueKey = myLeagueIds ? leagueIdKey(myLeagueIds) : null

  // The seasons of every league this user belongs to, in one round trip (or one
  // per 30 leagues, run together). This replaces a per-league query awaited in
  // series, which is what made a dashboard with several leagues crawl.
  useEffect(() => {
    if (!user || myLeagueKey === null) return
    const ids = myLeagueKey === '' ? [] : myLeagueKey.split(',')

    // A fetch that lands after the membership has moved on would overwrite the
    // newer one with stale seasons, so a superseded fetch drops its result.
    let live = true
    Promise.all(
      chunkIds(ids).map((chunk) =>
        getDocs(query(collection(db, 'seasons'), where('leagueId', 'in', chunk)))
      )
    )
      .then((snaps) => {
        if (!live) return
        const fetched = snaps.flatMap((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonDoc) }))
        )
        // No orderBy on the query: leadingSeason breaks its own ties by
        // createdAt, so the ordering never depended on the clause anyway — and
        // without it the query needs only Firestore's automatic single-field
        // index.
        setSeasons({ key: myLeagueKey, byLeague: groupSeasonsByLeague(fetched) })
      })
      .catch((error) => {
        // A rejection in here used to skip setLoading(false) and hang the page
        console.error('Failed to load seasons for dashboard leagues', error)
        if (live) setSeasons({ key: myLeagueKey, byLeague: {} })
      })

    return () => {
      live = false
    }
  }, [user, myLeagueKey])

  async function handleCreateLeague(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !userDoc) return
    setCreating(true)
    try {
      const leagueRef = await addDoc(collection(db, 'leagues'), {
        name: leagueName.trim(),
        showName: leagueShow.trim(),
        description: leagueDesc.trim(),
        ownerId: user.uid,
        createdAt: Date.now(),
        // Derived state owned by the onLeagueMemberWritten trigger, which sets
        // it to 1 as soon as the owner's member document lands below. The rules
        // require it to start at 0 so a client cannot inflate a league's size.
        memberCount: 0,
      } satisfies LeagueDoc)

      await setDoc(doc(db, 'leagues', leagueRef.id, 'members', user.uid), {
        uid: user.uid,
        displayName: userDoc.displayName,
        ...storedPhotoFields(userDoc),
        role: 'owner',
        joinedAt: Date.now(),
      } satisfies LeagueMemberDoc)

      trackEvent('league_created')
      setCreateOpen(false)
      setLeagueName('')
      setLeagueShow('')
      setLeagueDesc('')
      navigate(`/leagues/${leagueRef.id}`)
    } catch (error) {
      // Swallowing this hid a permission-denied write that left leagues memberless
      console.error('Failed to create league', error)
    } finally {
      setCreating(false)
    }
  }

  // The list is ready once every piece has answered. The seasons are waited
  // for rather than filled in late so the rows do not reshuffle under the
  // reader — sortLeaguesByStatus orders by season state, so a badge arriving
  // after the fact would move its row.
  const loading =
    myLeagueIds === null || allLeagues === null || seasons === null || seasons.key !== myLeagueKey

  // The leagues in the order they should be read — see sortLeaguesByStatus.
  const sortedLeagues = useMemo(
    () =>
      sortLeaguesByStatus(
        joinLeaguesWithSeasons(myLeagueIds ?? [], allLeagues ?? [], seasons?.byLeague ?? {})
      ),
    [myLeagueIds, allLeagues, seasons]
  )

  // Leagues to browse: everything this user is not already in. Derived rather
  // than filtered in the listener so it re-settles as soon as a membership
  // arrives — an approved league moves from one section to the other on its own.
  const otherLeagues = useMemo(() => {
    const mine = new Set(myLeagueIds ?? [])
    return (allLeagues ?? []).filter((l) => !mine.has(l.id))
  }, [myLeagueIds, allLeagues])

  return (
    <Layout breadcrumbs={dashboardTrail()}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t('dashboard.createLeague')}</Button>
      </div>

      {/* Leagues this user belongs to */}
      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('dashboard.myLeagues')}</h2>
          {sortedLeagues.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
              <p className="text-gray-500">{t('dashboard.noLeagues')}</p>
              <p className="mt-1 text-sm text-gray-400">{t('dashboard.noLeaguesSubtext')}</p>
              <div className="mt-4 flex justify-center gap-3">
                <Button onClick={() => setCreateOpen(true)}>{t('dashboard.createLeague')}</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {sortedLeagues.map(({ id, league, currentSeason }) => (
                <Link
                  key={id}
                  to={`/leagues/${id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{league.name}</p>
                    {currentSeason && (
                      <p className="text-sm text-gray-500">
                        {league.showName ? `${league.showName} · ` : ''}
                        {currentSeason.label}
                      </p>
                    )}
                  </div>
                  {currentSeason && <SeasonStateBadge state={currentSeason.state} />}
                </Link>
              ))}
            </div>
          )}

          {/* Every other league, open to browse and to ask to join */}
          <h2 className="mb-3 mt-8 text-lg font-semibold text-gray-900">
            {t('dashboard.otherLeagues')}
          </h2>
          {otherLeagues.length === 0 ? (
            <p className="text-sm text-gray-400">{t('dashboard.noOtherLeagues')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {otherLeagues.map((league) => (
                // Not a single big Link like the cards above: the row holds its
                // own button, and a button nested inside a link is neither valid
                // markup nor operable by keyboard.
                <div
                  key={league.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <Link
                      to={`/leagues/${league.id}`}
                      className="font-semibold text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      {league.name}
                    </Link>
                    {league.showName && (
                      <p className="truncate text-sm text-gray-600">{league.showName}</p>
                    )}
                    {league.description && (
                      <p className="truncate text-sm text-gray-500">{league.description}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {memberCountLabel(league.memberCount ?? 0)}
                    </p>
                  </div>
                  <JoinLeagueButton
                    leagueId={league.id}
                    status={joinRequestStatus[league.id] ?? null}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create League Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('league.create')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button form="create-league-form" type="submit" loading={creating}>
              {t('league.create')}
            </Button>
          </>
        }
      >
        <form id="create-league-form" onSubmit={handleCreateLeague} className="flex flex-col gap-4">
          <Input
            label={t('league.showName')}
            value={leagueShow}
            onChange={(e) => setLeagueShow(e.target.value)}
            placeholder="The Traitors"
            required
          />
          <Input
            label={t('league.name')}
            value={leagueName}
            onChange={(e) => setLeagueName(e.target.value)}
            required
            autoFocus
          />
          <Textarea
            label={t('league.description')}
            value={leagueDesc}
            onChange={(e) => setLeagueDesc(e.target.value)}
          />
        </form>
      </Modal>
    </Layout>
  )
}
