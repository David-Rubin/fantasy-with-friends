import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  doc,
  getDoc,
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
import { leadingSeason, sortLeaguesByStatus } from '../lib/leagueStatus'
import type { LeagueDoc, LeagueMemberDoc, SeasonDoc } from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'

interface LeagueWithSeason {
  id: string
  league: LeagueDoc
  /**
   * The season this league is judged by — see leadingSeason. Not its newest:
   * a league that lines up next year's season while this year's is still being
   * scored is still playing this year's, and that is what a reader wants the
   * badge to say.
   */
  currentSeason: (SeasonDoc & { id: string }) | null
}

function memberCountLabel(count: number): string {
  return count === 1 ? t('league.memberCountOne') : t('league.memberCount', { n: count })
}

export function DashboardPage() {
  const { user, userDoc } = useAuth()
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState<LeagueWithSeason[]>([])
  const [allLeagues, setAllLeagues] = useState<(LeagueDoc & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
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

    const unsubscribe = listenQuery(
      membersQuery,
      'dashboard leagues',
      async (snap) => {
        const leagueIds = new Set<string>()
        snap.docs.forEach((d) => {
          // Only leagues/{id}/members/{uid} docs, not seasons/{id}/members/{uid}
          if (d.ref.parent.parent?.parent?.id === 'leagues') {
            const leagueId = d.ref.parent.parent?.id
            if (leagueId) leagueIds.add(leagueId)
          }
        })

        try {
          const results: LeagueWithSeason[] = []
          for (const leagueId of leagueIds) {
            const leagueSnap = await getDoc(doc(db, 'leagues', leagueId))
            if (!leagueSnap.exists()) continue
            const league = leagueSnap.data() as LeagueDoc

            // Every season, not just the newest: which one speaks for the
            // league is a question about their states, and only one of them
            // can be answered by a query's ordering. A league has a handful.
            const seasonsSnap = await getDocs(
              query(
                collection(db, 'seasons'),
                where('leagueId', '==', leagueId),
                orderBy('createdAt', 'desc')
              )
            )
            const currentSeason = leadingSeason(
              seasonsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as SeasonDoc) }))
            )

            results.push({ id: leagueId, league, currentSeason })
          }
          setLeagues(results)
        } catch (error) {
          // A rejection in here used to skip setLoading(false) and hang the page
          console.error('Failed to load leagues', error)
        } finally {
          setLoading(false)
        }
      },
      // listenQuery logs; this clears the spinner so a denied read shows the
      // empty state rather than hanging on "Loading…"
      () => setLoading(false)
    )

    return unsubscribe
  }, [user])

  // Every league in the app, member or not — the browse list below. Only the
  // league documents are read here: seasons are fetched per league above, and
  // only for leagues this user actually belongs to, so browsing stays one query
  // however many leagues exist.
  useEffect(() => {
    if (!user) return
    return listenQuery(
      query(collection(db, 'leagues'), orderBy('createdAt', 'desc')),
      'all leagues',
      (snap) => setAllLeagues(snap.docs.map((d) => ({ id: d.id, ...(d.data() as LeagueDoc) })))
    )
  }, [user])

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
        ...(userDoc.photoUrl ? { photoUrl: userDoc.photoUrl } : {}),
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

  // Leagues to browse: everything this user is not already in. Derived rather
  // than filtered in the listener so it re-settles as soon as a membership
  // arrives — an approved league moves from one section to the other on its own.
  const myLeagueIds = new Set(leagues.map((l) => l.id))
  const otherLeagues = allLeagues.filter((l) => !myLeagueIds.has(l.id))

  // The leagues in the order they should be read — see sortLeaguesByStatus.
  const sortedLeagues = sortLeaguesByStatus(leagues)

  // The one season worth putting at the top of the page: whatever is furthest
  // up the same precedence order, provided it is something to act on. A season
  // in setup or already over has nothing here for anybody, so the card stays
  // away rather than pointing at it.
  const featuredSeason = sortedLeagues.flatMap((l) =>
    l.currentSeason && ['draft', 'active'].includes(l.currentSeason.state)
      ? [{ ...l, season: l.currentSeason }]
      : []
  )[0]

  return (
    <Layout breadcrumbs={dashboardTrail()}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t('dashboard.createLeague')}</Button>
      </div>

      {/* Featured season */}
      {featuredSeason && (
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SeasonStateBadge state={featuredSeason.season.state} />
              <h2 className="mt-2 text-xl font-semibold text-gray-900">
                {featuredSeason.league.showName}
              </h2>
              <p className="text-sm text-gray-500">{featuredSeason.season.label}</p>
              <p className="mt-1 text-sm text-gray-500">{featuredSeason.league.name}</p>
            </div>
            <Link
              to={`/leagues/${featuredSeason.id}/seasons/${featuredSeason.season.id}${featuredSeason.season.state === 'draft' ? '/draft' : ''}`}
            >
              <Button>
                {featuredSeason.season.state === 'draft'
                  ? t('dashboard.joinDraft')
                  : t('dashboard.viewSeason')}
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Leagues this user belongs to */}
      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : (
        <>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{t('dashboard.myLeagues')}</h2>
          {leagues.length === 0 ? (
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
