import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collectionGroup, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { listenQuery } from '../lib/listen'
import { useAuth } from '../contexts/AuthContext'
import { Layout } from './Layout'
import { t } from '../lib/i18n'

/**
 * Season pages are for that season's members.
 *
 * League pages are readable before joining, so every season route is now
 * reachable by someone with no right to what is on it. Security rules deny the
 * data either way, but a page full of denied reads renders as an empty shell
 * that looks broken rather than closed — so each season route resolves
 * membership first and says so plainly.
 *
 * League membership is deliberately not enough: a user admitted to a league
 * after a season began is not in that season. Such a member can let themselves
 * into any season still in `setup` from the league page — see
 * src/lib/seasonMembership.ts — which is what this hook then sees.
 */
export function useMySeasonIds(): { seasonIds: Set<string>; resolved: boolean } {
  const { user } = useAuth()
  const [seasonIds, setSeasonIds] = useState<Set<string>>(new Set())
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    if (!user) return
    // Asked through the collection group rule for a user's own membership docs.
    // The season's roster is closed to non-members, so testing membership by
    // reading it would be a denied read on every visit by a non-member.
    return listenQuery(
      query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
      'my season membership',
      (snap) => {
        const mine = snap.docs
          .filter((d) => d.ref.parent.parent?.parent?.id === 'seasons')
          .map((d) => d.ref.parent.parent!.id)
        setSeasonIds(new Set(mine))
        setResolved(true)
      },
      () => {
        setSeasonIds(new Set())
        setResolved(true)
      }
    )
  }, [user])

  return { seasonIds, resolved }
}

export function useSeasonMembership(seasonId: string | undefined): {
  membership: 'loading' | 'member' | 'none'
  /** Cleared to read season data — a superadmin qualifies without joining. */
  canView: boolean
  /** Render the refusal panel instead of the page. */
  blocked: boolean
} {
  const { isSuperadmin } = useAuth()
  const { seasonIds, resolved } = useMySeasonIds()

  const membership =
    !resolved || !seasonId ? 'loading' : seasonIds.has(seasonId) ? 'member' : 'none'

  return {
    membership,
    canView: membership === 'member' || isSuperadmin,
    blocked: membership === 'none' && !isSuperadmin,
  }
}

/** The refusal itself, with a way back to somewhere the viewer can go. */
export function NotASeasonMember({ leagueId }: { leagueId: string | undefined }) {
  return (
    <Layout>
      <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
        <p className="text-gray-500">{t('season.notAMember')}</p>
        {leagueId && (
          <Link
            to={`/leagues/${leagueId}`}
            className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline"
          >
            {t('season.backToLeague')}
          </Link>
        )}
      </div>
    </Layout>
  )
}
