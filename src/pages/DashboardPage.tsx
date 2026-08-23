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
  limit,
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
import { AccentColorPicker } from '../components/AccentColorPicker'
import { Badge } from '../components/Badge'
import type { LeagueDoc, LeagueMemberDoc, SeasonDoc } from '../lib/types'
import type { AccentColor } from '../lib/types'
import { t } from '../lib/i18n'
import { trackEvent } from '../lib/analytics'

interface LeagueWithSeason {
  id: string
  league: LeagueDoc
  latestSeason: (SeasonDoc & { id: string }) | null
}

export function DashboardPage() {
  const { user, userDoc } = useAuth()
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState<LeagueWithSeason[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [leagueName, setLeagueName] = useState('')
  const [leagueDesc, setLeagueDesc] = useState('')
  const [accentColor, setAccentColor] = useState<AccentColor>('blue')
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

            // Get latest season
            const seasonsSnap = await getDocs(
              query(
                collection(db, 'seasons'),
                where('leagueId', '==', leagueId),
                orderBy('createdAt', 'desc'),
                limit(1)
              )
            )
            const latestSeason = seasonsSnap.empty
              ? null
              : { id: seasonsSnap.docs[0].id, ...(seasonsSnap.docs[0].data() as SeasonDoc) }

            results.push({ id: leagueId, league, latestSeason })
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

  async function handleCreateLeague(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !userDoc) return
    setCreating(true)
    try {
      const leagueRef = await addDoc(collection(db, 'leagues'), {
        name: leagueName.trim(),
        description: leagueDesc.trim(),
        ownerId: user.uid,
        createdAt: Date.now(),
        accentColor,
      } satisfies LeagueDoc)

      await setDoc(doc(db, 'leagues', leagueRef.id, 'members', user.uid), {
        uid: user.uid,
        displayName: userDoc.displayName,
        role: 'owner',
        joinedAt: Date.now(),
      } satisfies LeagueMemberDoc)

      trackEvent('league_created')
      setCreateOpen(false)
      setLeagueName('')
      setLeagueDesc('')
      navigate(`/leagues/${leagueRef.id}`)
    } catch (error) {
      // Swallowing this hid a permission-denied write that left leagues memberless
      console.error('Failed to create league', error)
    } finally {
      setCreating(false)
    }
  }

  // Find the most recently updated active/draft season across all leagues
  const featuredSeason = leagues
    .flatMap((l) =>
      l.latestSeason && ['active', 'draft'].includes(l.latestSeason.state)
        ? [{ ...l, season: l.latestSeason }]
        : []
    )
    .sort((a, b) => (b.season.createdAt ?? 0) - (a.season.createdAt ?? 0))[0]

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h1>
        <Button onClick={() => setCreateOpen(true)}>{t('dashboard.createLeague')}</Button>
      </div>

      {/* Featured season */}
      {featuredSeason && (
        <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge accent={featuredSeason.season.accentColor}>
                {featuredSeason.season.state === 'draft'
                  ? t('season.states.draft')
                  : t('season.states.active')}
              </Badge>
              <h2 className="mt-2 text-xl font-semibold text-gray-900">
                {featuredSeason.season.showName}
              </h2>
              <p className="text-sm text-gray-500">{featuredSeason.season.label}</p>
              <p className="mt-1 text-sm text-gray-500">{featuredSeason.league.name}</p>
            </div>
            <Link
              to={`/leagues/${featuredSeason.id}/seasons/${featuredSeason.latestSeason!.id}${featuredSeason.season.state === 'draft' ? '/draft' : ''}`}
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

      {/* League list */}
      {loading ? (
        <p className="text-gray-400">{t('common.loading')}</p>
      ) : leagues.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">{t('dashboard.noLeagues')}</p>
          <p className="mt-1 text-sm text-gray-400">{t('dashboard.noLeaguesSubtext')}</p>
          <div className="mt-4 flex justify-center gap-3">
            <Button onClick={() => setCreateOpen(true)}>{t('dashboard.createLeague')}</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {leagues.map(({ id, league, latestSeason }) => (
            <Link
              key={id}
              to={`/leagues/${id}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors"
            >
              <div>
                <p className="font-semibold text-gray-900">{league.name}</p>
                {latestSeason && (
                  <p className="text-sm text-gray-500">
                    {latestSeason.showName} · {latestSeason.label}
                  </p>
                )}
              </div>
              {latestSeason && (
                <Badge accent={latestSeason.accentColor}>
                  {t(`season.states.${latestSeason.state}`)}
                </Badge>
              )}
            </Link>
          ))}
        </div>
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
          <AccentColorPicker value={accentColor} onChange={setAccentColor} />
        </form>
      </Modal>
    </Layout>
  )
}
