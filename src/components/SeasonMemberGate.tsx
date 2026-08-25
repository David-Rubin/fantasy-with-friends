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
 * after a season began is not in that season.
 */
export function useSeasonMembership(seasonId: string | undefined): {
  membership: 'loading' | 'member' | 'none'
  /** Cleared to read season data — a superadmin qualifies without joining. */
  canView: boolean
  /** Render the refusal panel instead of the page. */
  blocked: boolean
} {
  const { user, isSuperadmin } = useAuth()
  const [membership, setMembership] = useState<'loading' | 'member' | 'none'>('loading')

  useEffect(() => {
    if (!seasonId || !user) return
    // Asked through the collection group rule for a user's own membership docs.
    // The season's roster is closed to non-members, so testing membership by
    // reading it would be a denied read on every visit by a non-member.
    return listenQuery(
      query(collectionGroup(db, 'members'), where('uid', '==', user.uid)),
      'my season membership',
      (snap) => {
        const mine = snap.docs.some(
          (d) =>
            d.ref.parent.parent?.id === seasonId && d.ref.parent.parent?.parent?.id === 'seasons'
        )
        setMembership(mine ? 'member' : 'none')
      },
      () => setMembership('none')
    )
  }, [seasonId, user])

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
