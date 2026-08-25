import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db } from './firebase'
import { listenDoc } from './listen'
import type { LeagueDoc, SeasonDoc } from './types'

/**
 * The league and season names a breadcrumb trail needs.
 *
 * Only the dashboard and the league page ever load a league document, and only
 * the season, draft and scoring pages load a season one — but every page below
 * a league needs both names to label its trail. Rather than have four pages each
 * grow their own fetch, they ask here.
 *
 * The duplicate listen on pages that already hold the season is deliberate and
 * costs nothing on the wire: the Firestore SDK shares one watch per document, so
 * a second onSnapshot on the same reference is served from the same stream.
 *
 * Both are readable by any signed-in user, so this never fails for someone who
 * is allowed to be on the page — including a non-member browsing a league.
 */
export function useTrailNames(
  leagueId: string | undefined,
  seasonId?: string
): { leagueName: string | undefined; seasonName: string | undefined } {
  const [leagueName, setLeagueName] = useState<string>()
  const [seasonName, setSeasonName] = useState<string>()

  useEffect(() => {
    if (!leagueId) return
    return listenDoc(doc(db, 'leagues', leagueId), 'breadcrumb league', (snap) => {
      if (snap.exists()) setLeagueName((snap.data() as LeagueDoc).name)
    })
  }, [leagueId])

  useEffect(() => {
    if (!seasonId) return
    return listenDoc(doc(db, 'seasons', seasonId), 'breadcrumb season', (snap) => {
      if (snap.exists()) setSeasonName((snap.data() as SeasonDoc).showName)
    })
  }, [seasonId])

  return { leagueName, seasonName }
}
