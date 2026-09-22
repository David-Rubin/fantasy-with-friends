import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { db } from './firebase'
import { listenDoc } from './listen'
import { isLeagueAdmin } from './roles'
import type { MemberRole } from './types'

/**
 * What this user is allowed to do in a league, for any screen that asks.
 *
 * Every page below a league wanted the same two things — the reader's role, and
 * whether that makes them an admin — and each one kept its own state, its own
 * read and its own copy of the expression. One of them read the document once
 * with getDoc, so a promotion did not reach a page that was already open; the
 * others listened. This listens, which is the behaviour worth having everywhere.
 *
 * `enabled` is the season-membership gate, exactly as in useSeasonCollections:
 * `leagues/{id}/members/{uid}` is closed to non-members, so a page that has not
 * settled who is asking must not fire the read at all. It gates the read, not
 * the answer: until it is true the role is null — a screen offers nothing on
 * the strength of a membership it has not confirmed — but a superadmin is an
 * admin here either way, because that half is answered by AuthContext and has
 * nothing to do with this league. `useIsAdmin(undefined, false)` is true for
 * them, and that is the same answer the rules give.
 *
 * It is not instant, mind: AuthContext releases the app on the user profile and
 * lets the `superadmins/{uid}` listener land after it, so a superadmin can
 * render once as a non-admin before it flips. Anything that must not flash
 * wants `loading` from AuthContext, not this.
 *
 * `resolved` says the answer has arrived, for the difference between "not an
 * admin" and "not known yet". Anything that would flash the wrong UI on first
 * paint should wait on it rather than on the boolean.
 *
 * Not used by LeagueDetailPage, which is reachable before joining: it asks the
 * same question through the collection-group rule that authorises a user's own
 * membership documents, because reading this path would be a denied read on
 * every pre-join visit. It shares the predicates in roles.ts instead.
 *
 * Duplicating the listen across two mounted pages costs nothing on the wire —
 * the SDK serves a second onSnapshot on the same document from the same watch.
 */
export function useLeagueRole(
  leagueId: string | undefined,
  enabled: boolean
): { role: MemberRole | null; isAdmin: boolean; resolved: boolean } {
  const { user, isSuperadmin } = useAuth()
  const [role, setRole] = useState<MemberRole | null>(null)
  // The league the answer above belongs to, rather than a plain "resolved"
  // flag: this hook outlives a change of league — the page stays mounted and
  // the route parameter changes under it — and a flag would have gone on
  // saying yes while `role` still held the previous league's answer.
  const [answeredFor, setAnsweredFor] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId || !user || !enabled) return
    return listenDoc(
      doc(db, 'leagues', leagueId, 'members', user.uid),
      'my league role',
      (snap) => {
        setRole(snap.exists() ? (snap.data() as { role: MemberRole }).role : null)
        setAnsweredFor(leagueId)
      },
      () => setAnsweredFor(leagueId)
    )
  }, [leagueId, user, enabled])

  const resolved = answeredFor !== null && answeredFor === leagueId
  const known = resolved ? role : null
  // Note that the superadmin half is not waiting on anything: it is settled by
  // the time this renders at all, and holding it back would hide controls from
  // the one person the rules never refuse.
  return { role: known, isAdmin: isLeagueAdmin(known, isSuperadmin), resolved }
}

/** The common case: may this person run this league's seasons? */
export function useIsAdmin(leagueId: string | undefined, enabled: boolean): boolean {
  return useLeagueRole(leagueId, enabled).isAdmin
}
