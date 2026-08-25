import { useEffect, useState } from 'react'
import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'
import { listenQuery } from './listen'
import { logAuditEvent } from './audit'
import type {
  JoinRequestStatus,
  LeagueJoinRequestDoc,
  LeagueMemberDoc,
  SeasonMemberDoc,
} from './types'

/**
 * Joining a league: a user asks, the league's owner decides.
 *
 * Every write here is one the security rules already permit the caller to make —
 * a requester writing their own pending request, an owner writing their league's
 * membership — so none of this needs a Cloud Function. Approval touches several
 * documents at once and goes through a batch so a half-admitted member is not a
 * reachable state.
 */

export async function requestToJoin(
  leagueId: string,
  uid: string,
  displayName: string
): Promise<void> {
  // Keyed by uid: asking twice rewrites one document instead of queueing two,
  // which is also how a rejected user asks again.
  await setDoc(doc(db, 'leagues', leagueId, 'joinRequests', uid), {
    uid,
    displayName,
    status: 'pending',
    requestedAt: Date.now(),
    decidedAt: null,
    decidedBy: null,
  } satisfies LeagueJoinRequestDoc)

  await logAuditEvent({ action: 'join_requested', leagueId })
}

/**
 * Admit a requester to the league, and to any season that has not started yet.
 *
 * Seasons still in `setup` are safe to join: pick order is assigned when the
 * draft is randomized, so a member added beforehand is indistinguishable from
 * one who was there when the season was created. A season already drafting or
 * scoring is not — a late arrival would carry a null pickPosition into a
 * computed snake order — so those are deliberately left alone, and the new
 * member plays from the next season.
 */
export async function approveJoinRequest(
  leagueId: string,
  request: LeagueJoinRequestDoc,
  approverUid: string
): Promise<void> {
  const { uid, displayName } = request

  const setupSeasons = await getDocs(
    query(
      collection(db, 'seasons'),
      where('leagueId', '==', leagueId),
      where('state', '==', 'setup')
    )
  )

  const batch = writeBatch(db)

  batch.update(doc(db, 'leagues', leagueId, 'joinRequests', uid), {
    status: 'approved',
    decidedAt: Date.now(),
    decidedBy: approverUid,
  })

  batch.set(doc(db, 'leagues', leagueId, 'members', uid), {
    // uid and displayName are denormalized deliberately — see LeagueMemberDoc.
    uid,
    displayName,
    role: 'member',
    joinedAt: Date.now(),
  } satisfies LeagueMemberDoc)

  for (const season of setupSeasons.docs) {
    batch.set(doc(db, 'seasons', season.id, 'members', uid), {
      uid,
      displayName,
      teamName: `${displayName}'s Team`,
      pickPosition: null,
      joinedAt: Date.now(),
    } satisfies SeasonMemberDoc)
  }

  await batch.commit()

  await logAuditEvent({
    action: 'join_request_approved',
    leagueId,
    targetUid: uid,
    newValue: { seasonsJoined: setupSeasons.docs.map((d) => d.id) },
  })
}

/**
 * Decline a request. The document is kept rather than deleted so the owner
 * retains the history; the requester's button returns to "Join" and they may
 * ask again.
 */
export async function rejectJoinRequest(
  leagueId: string,
  uid: string,
  deciderUid: string
): Promise<void> {
  await updateDoc(doc(db, 'leagues', leagueId, 'joinRequests', uid), {
    status: 'rejected',
    decidedAt: Date.now(),
    decidedBy: deciderUid,
  })

  await logAuditEvent({ action: 'join_request_rejected', leagueId, targetUid: uid })
}

/**
 * Every league this user has an open or decided request for, keyed by league id.
 *
 * The dashboard needs this for every league at once — one collectionGroup query
 * rather than a read per league. The `uid` filter is not an optimization: the
 * collection group rule can only authorize a query that constrains that field,
 * so removing it breaks the listener. See LeagueJoinRequestDoc.uid.
 */
const NO_REQUESTS: Record<string, JoinRequestStatus> = {}

export function useMyJoinRequests(uid: string | undefined): Record<string, JoinRequestStatus> {
  const [statusByLeagueId, setStatusByLeagueId] = useState<Record<string, JoinRequestStatus>>({})

  useEffect(() => {
    if (!uid) return
    return listenQuery(
      query(collectionGroup(db, 'joinRequests'), where('uid', '==', uid)),
      'my join requests',
      (snap) => {
        const next: Record<string, JoinRequestStatus> = {}
        snap.docs.forEach((d) => {
          const leagueId = d.ref.parent.parent?.id
          if (leagueId) next[leagueId] = (d.data() as LeagueJoinRequestDoc).status
        })
        setStatusByLeagueId(next)
      }
    )
  }, [uid])

  // Signed out, the last user's requests are still in state — returning them
  // would offer the next user a "Request pending" button that is not theirs.
  return uid ? statusByLeagueId : NO_REQUESTS
}
