import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import { calcTeamTotal, calcTeamEpisodeTotals } from './scoring'
import { nextSlot, pickerAt, draftOutcome, openSlots, skipLimitReached } from './draft'
import type { ScoringRule, ContestantScoreDoc, SeasonAwardDoc } from './scoring'

admin.initializeApp()
const db = admin.firestore()

// ── Auth: sign up ─────────────────────────────────────────────────────────────

export const signUpUser = functions.https.onCall(
  async (data: { displayName: string; email: string }) => {
    const { displayName, email } = data

    // Generate 6-digit PIN
    const pin = String(Math.floor(100000 + Math.random() * 900000))

    // Create Firebase Auth user — password is the PIN itself
    // (In production, you'd hash this; for Firebase Auth email/password, the PIN IS the password)
    const userRecord = await admin.auth().createUser({
      email: email.toLowerCase(),
      password: pin,
      displayName,
    })

    // Write user doc
    await db.doc(`users/${userRecord.uid}`).set({
      displayName,
      email: email.toLowerCase(),
      createdAt: Date.now(),
      loginAttempts: 0,
      lockedUntil: null,
    })

    // TODO: Send PIN via email (use Firebase Extension: Trigger Email)
    // For now, log it for emulator development
    functions.logger.info(`PIN for ${email}: ${pin}`)

    return { uid: userRecord.uid }
  }
)

// ── Auth: log in by email (auth disabled — trusts any caller) ─────────────────
// TEMPORARY: does not check a PIN or password at all. Whoever supplies an
// email is logged in as that user. Re-enable real verification (see
// loginWithPin/resendPin below) before this app is used outside a small
// trusted group.

export const loginAsUser = functions.https.onCall(async (data: { email: string }) => {
  const email = data.email.trim().toLowerCase()

  let userRecord
  try {
    userRecord = await admin.auth().getUserByEmail(email)
  } catch {
    throw new functions.https.HttpsError('not-found', 'No account with that email.')
  }

  const token = await admin.auth().createCustomToken(userRecord.uid)
  return { token }
})

// ── Auth: resend PIN ──────────────────────────────────────────────────────────

export const resendPin = functions.https.onCall(async (data: { email: string }) => {
  const { email } = data

  // Find user by email
  const userRecord = await admin.auth().getUserByEmail(email.toLowerCase())

  // Generate new PIN
  const pin = String(Math.floor(100000 + Math.random() * 900000))

  // Update Firebase Auth password
  await admin.auth().updateUser(userRecord.uid, { password: pin })

  // Reset login attempts
  await db.doc(`users/${userRecord.uid}`).update({ loginAttempts: 0, lockedUntil: null })

  // TODO: Send PIN via email
  functions.logger.info(`New PIN for ${email}: ${pin}`)
})

// ── Leagues: keep memberCount in step with the roster ────────────────────────

/**
 * Recompute `leagues/{leagueId}.memberCount` whenever the roster changes.
 *
 * The dashboard shows every league to every signed-in user, including ones they
 * have never joined, and each row reports how many members it has. Member
 * documents stay readable to members only, so a prospective member cannot count
 * them — hence the denormalized field.
 *
 * It is derived here rather than incremented by the client that admits a member
 * because a count maintained from the client drifts permanently the first time a
 * write is interrupted; recounting on every membership change is self-healing,
 * and rosters here are a few dozen documents at most.
 */
export const onLeagueMemberWritten = functions.firestore
  .document('leagues/{leagueId}/members/{uid}')
  .onWrite(async (change, context) => {
    // Role edits leave the roster size alone.
    if (change.before.exists && change.after.exists) return

    const { leagueId } = context.params
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get()
    await db.doc(`leagues/${leagueId}`).update({ memberCount: membersSnap.size })
  })

// ── Draft: submit a pick ──────────────────────────────────────────────────────

/**
 * The single write path for a draft pick.
 *
 * Picks used to be written by the client across four separate documents, three
 * of which are admin-only, so an ordinary member's pick was denied partway
 * through and stalled the draft. Security rules cannot fix that on their own:
 * validating whose turn is next means re-deriving snake order inside a rule,
 * and "are all contestants drafted" needs an aggregate rules cannot compute.
 *
 * So the whole pick happens here, in one transaction: turn and availability are
 * checked together against committed state, which also removes the race where
 * two clients pick the same contestant from a stale snapshot.
 */
export const submitPick = functions.https.onCall(
  async (
    data: { seasonId: string; contestantId: string; onBehalfOf?: string },
    context
  ): Promise<{ status: 'active' | 'awaiting-close' | 'complete' }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const actingUid = context.auth.uid
    const { seasonId, contestantId, onBehalfOf } = data

    if (!seasonId || !contestantId) {
      throw new functions.https.HttpsError('invalid-argument', 'seasonId and contestantId required')
    }

    const seasonRef = db.doc(`seasons/${seasonId}`)
    const seasonSnap = await seasonRef.get()
    if (!seasonSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Season not found')
    }
    const leagueId = seasonSnap.data()?.leagueId as string

    // Proxy picks (PRD 3.3.2) are admin-only, and get recorded with the acting
    // admin's id so the audit trail shows who actually pressed the button.
    const isAdmin = await isLeagueAdmin(leagueId, actingUid)
    if (onBehalfOf && !isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only an admin can pick on behalf of another member'
      )
    }
    const pickerUid = onBehalfOf ?? actingUid

    // The draft doc has a generated id, so find it rather than assume one.
    const draftQuery = await db.collection(`seasons/${seasonId}/draft`).limit(1).get()
    if (draftQuery.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'Draft has not been opened')
    }
    const draftRef = draftQuery.docs[0].ref
    const contestantRef = db.doc(`seasons/${seasonId}/contestants/${contestantId}`)
    const contestantsCol = db.collection(`seasons/${seasonId}/contestants`)

    const result = await db.runTransaction(async (tx) => {
      const [draftSnap, contestantSnap, allContestants] = await Promise.all([
        tx.get(draftRef),
        tx.get(contestantRef),
        tx.get(contestantsCol),
      ])

      const draft = draftSnap.data()
      // `paused` is a live draft awaiting an admin proxy pick for the member
      // who missed their turn, so picks are still accepted here.
      if (!draft || (draft.status !== 'active' && draft.status !== 'paused')) {
        throw new functions.https.HttpsError('failed-precondition', 'Draft is not active')
      }
      if (!contestantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Contestant not found')
      }

      const contestant = contestantSnap.data()
      if (contestant?.draftedByUid) {
        throw new functions.https.HttpsError('aborted', 'That contestant has already been drafted')
      }
      if (contestant?.eliminatedEpisode !== null && contestant?.eliminatedEpisode !== undefined) {
        throw new functions.https.HttpsError('failed-precondition', 'Contestant is eliminated')
      }

      // An admin may pick out of turn only via onBehalfOf; picking for yourself
      // still requires it to actually be your turn.
      if (draft.currentPickerUid !== pickerUid) {
        throw new functions.https.HttpsError('failed-precondition', 'It is not that member’s turn')
      }

      const pickOrder = (draft.pickOrder ?? []) as string[]

      tx.create(draftRef.collection('picks').doc(), {
        contestantId,
        pickerUid,
        actingAdminUid: onBehalfOf ? actingUid : null,
        round: draft.currentRound,
        pickNumber: draft.currentPickNumber,
        timestamp: Date.now(),
      })

      tx.update(contestantRef, {
        draftedByUid: pickerUid,
        draftedRound: draft.currentRound,
      })

      // The draft finishes on a round boundary once too few contestants remain
      // to give everyone one more. If a roster is short and the bench still has
      // someone on it, an admin settles that before the draft closes.
      const remaining = allContestants.docs.filter(
        (d) =>
          !d.data().draftedByUid && d.data().eliminatedEpisode === null && d.id !== contestantId
      ).length
      const rosterCounts = countRosters(allContestants.docs, pickOrder, contestantId, pickerUid)

      const outcome = draftOutcome(
        draft.currentPickNumber as number,
        pickOrder.length,
        remaining,
        rosterCounts
      )

      if (outcome !== 'continue') {
        tx.update(draftRef, { status: outcome, currentPickerUid: null, timerExpiresAt: null })
        if (outcome === 'complete') tx.update(seasonRef, { state: 'active' })
        return { status: outcome }
      }

      const next = nextSlot(
        pickOrder,
        draft.currentRound as number,
        draft.currentPickNumber as number
      )
      tx.update(draftRef, {
        status: 'active',
        currentRound: next.round,
        currentPickNumber: next.pickNumber,
        currentPickerUid: pickerAt(pickOrder, next.round, next.pickNumber),
        timerExpiresAt: Date.now() + ((seasonSnap.data()?.timerSeconds as number) ?? 60) * 1000,
        // Somebody picked, so the room is not abandoned.
        consecutiveSkips: 0,
      })
      return { status: 'active' as const }
    })

    // Logged here rather than by the caller — a client that skipped the call
    // used to leave a proxy pick with no trace (PRD 10.1).
    await db.collection('auditLogs').add({
      action: onBehalfOf ? 'admin_proxy_pick' : 'draft_pick',
      seasonId,
      contestantId,
      targetUid: onBehalfOf ?? null,
      actorUid: actingUid,
      timestamp: Date.now(),
    })

    return result
  }
)

// ── Draft: resolve an expired pick timer ──────────────────────────────────────

/**
 * Apply the season's timer-expiry policy once a pick clock has run out.
 *
 * WHO CALLS THIS — and why it is a client nudge for now.
 *
 * PRD 4.9 requires the pick timer to be authoritative server-side, so a player
 * who disconnects cannot stall the draft. Three ways to get that:
 *
 *   - A scheduled function. Firebase cron has a one-minute floor and the
 *     default pick timer is sixty seconds, so the granularity does not fit.
 *   - Cloud Tasks, enqueued for `timerExpiresAt` when each turn begins. Precise
 *     to the second and fires even if every participant has closed the tab.
 *   - This: any connected client that watches the countdown reach zero calls in,
 *     and the server decides whether the turn has really expired.
 *
 * The nudge was chosen because it needs no extra infrastructure, runs in the
 * emulator, and suits the MVP's scale (PRD 12.2 — 50 concurrent users on the
 * free tier). Its one real weakness is that with nobody connected, nothing
 * fires; because expiry is judged from stored state, the draft resolves
 * correctly as soon as somebody returns, so this degrades rather than corrupts.
 *
 * TODO: migrate to Cloud Tasks when drafts start running unattended, or when
 * anyone reports a draft sitting on an expired clock until someone reopened it.
 * Enqueue at `timerExpiresAt` inside the same transaction that sets it, and keep
 * the guard below — a task and a straggling client can both arrive.
 *
 * The caller passes the turn it saw expire. Every connected client hits zero at
 * the same instant, so without that guard a four-person draft would burn four
 * turns on one expiry. Whichever call lands first advances the turn; the rest
 * no longer match and do nothing.
 */
export const resolveExpiredTurn = functions.https.onCall(
  async (
    data: { seasonId: string; round: number; pickNumber: number },
    context
  ): Promise<{
    outcome: 'auto-picked' | 'skipped' | 'halted' | 'paused' | 'no-op'
    status?: string
  }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { seasonId, round, pickNumber } = data
    if (!seasonId || typeof round !== 'number' || typeof pickNumber !== 'number') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'seasonId, round and pickNumber required'
      )
    }

    const seasonRef = db.doc(`seasons/${seasonId}`)
    const seasonSnap = await seasonRef.get()
    if (!seasonSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Season not found')
    }
    const season = seasonSnap.data()
    const policy = (season?.timerExpiry as string) ?? 'auto-pick'
    const timerSeconds = (season?.timerSeconds as number) ?? 60

    // Only someone in the season may nudge the clock — or a superadmin, who can
    // act in any season without joining it.
    const memberSnap = await db.doc(`seasons/${seasonId}/members/${context.auth.uid}`).get()
    if (!memberSnap.exists && !(await isSuperadmin(context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Not a member of this season')
    }

    const draftQuery = await db.collection(`seasons/${seasonId}/draft`).limit(1).get()
    if (draftQuery.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'Draft has not been opened')
    }
    const draftRef = draftQuery.docs[0].ref
    const contestantsCol = db.collection(`seasons/${seasonId}/contestants`)

    return db.runTransaction(async (tx) => {
      const [draftSnap, allContestants] = await Promise.all([
        tx.get(draftRef),
        tx.get(contestantsCol),
      ])
      const draft = draftSnap.data()
      if (!draft || draft.status !== 'active') {
        return { outcome: 'no-op' as const }
      }

      // Someone else already handled this turn, or it moved on.
      if (draft.currentRound !== round || draft.currentPickNumber !== pickNumber) {
        return { outcome: 'no-op' as const }
      }

      // The server clock decides, not the caller's.
      const expiresAt = draft.timerExpiresAt as number | null
      if (!expiresAt || Date.now() < expiresAt) {
        return { outcome: 'no-op' as const }
      }

      const pickOrder = (draft.pickOrder ?? []) as string[]
      const missedUid = draft.currentPickerUid as string

      if (policy === 'admin-picks') {
        // Hold the turn where it is, stop the clock, and let an admin pick for
        // them. Nobody else may pick while this sits (PRD 3.3.1).
        tx.update(draftRef, { status: 'paused', timerExpiresAt: null })
        return { outcome: 'paused' as const }
      }

      const undrafted = allContestants.docs.filter(
        (d) => !d.data().draftedByUid && d.data().eliminatedEpisode === null
      )

      if (policy === 'auto-pick' && undrafted.length > 0) {
        const chosen = undrafted[0]
        tx.create(draftRef.collection('picks').doc(), {
          contestantId: chosen.id,
          pickerUid: missedUid,
          actingAdminUid: null,
          round: draft.currentRound,
          pickNumber: draft.currentPickNumber,
          timestamp: Date.now(),
          autoPicked: true,
        })
        tx.update(chosen.ref, { draftedByUid: missedUid, draftedRound: draft.currentRound })

        const autoOutcome = draftOutcome(
          draft.currentPickNumber as number,
          pickOrder.length,
          undrafted.length - 1,
          countRosters(allContestants.docs, pickOrder, chosen.id, missedUid)
        )
        if (autoOutcome !== 'continue') {
          tx.update(draftRef, {
            status: autoOutcome,
            currentPickerUid: null,
            timerExpiresAt: null,
          })
          if (autoOutcome === 'complete') tx.update(seasonRef, { state: 'active' })
          return { outcome: 'auto-picked' as const, status: autoOutcome }
        }
        advanceTurn(tx, draftRef, pickOrder, draft, timerSeconds)
        return { outcome: 'auto-picked' as const, status: 'active' }
      }

      // Skip: the turn passes with nothing taken. No makeup pick — their next
      // chance is their natural next turn (PRD 3.3.1). The board is unchanged,
      // but a skip still consumes the slot, so this can be the turn that carries
      // the draft over a round boundary. It is also the turn most likely to leave
      // a roster short, which is what hands the ending to an admin.
      const skipOutcome = draftOutcome(
        draft.currentPickNumber as number,
        pickOrder.length,
        undrafted.length,
        countRosters(allContestants.docs, pickOrder)
      )
      if (skipOutcome !== 'continue') {
        tx.update(draftRef, { status: skipOutcome, currentPickerUid: null, timerExpiresAt: null })
        if (skipOutcome === 'complete') tx.update(seasonRef, { state: 'active' })
        return { outcome: 'skipped' as const, status: skipOutcome }
      }

      // A skip that finishes a full lap of the order without anybody picking
      // means the room has emptied out. Halt for an admin rather than cycling.
      const consecutiveSkips = ((draft.consecutiveSkips as number) ?? 0) + 1
      if (skipLimitReached(consecutiveSkips, pickOrder.length)) {
        tx.update(draftRef, {
          status: 'awaiting-close',
          haltedReason: 'skips',
          consecutiveSkips,
          currentPickerUid: null,
          timerExpiresAt: null,
        })
        return { outcome: 'halted' as const, status: 'awaiting-close' }
      }

      advanceTurn(tx, draftRef, pickOrder, draft, timerSeconds, consecutiveSkips)
      return { outcome: 'skipped' as const, status: 'active' }
    })
  }
)

/**
 * Contestants held per team, in pickOrder order.
 *
 * `pendingId`/`pendingUid` let a caller count a pick that is being written in
 * the same transaction and so is not yet reflected in the snapshot.
 */
function countRosters(
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  pickOrder: string[],
  pendingId?: string,
  pendingUid?: string
): number[] {
  return pickOrder.map(
    (uid) =>
      docs.filter((d) => {
        const owner = d.id === pendingId ? pendingUid : (d.data().draftedByUid as string | null)
        return owner === uid
      }).length
  )
}

// ── Draft: pause and resume the clock ─────────────────────────────────────────

/**
 * Stop or restart the pick clock, at an admin's discretion.
 *
 * Server-side so it reaches everyone: the countdown each client renders is only
 * a view of `timerExpiresAt`, so clearing it stops every participant's clock at
 * once rather than just the admin's. What is left is banked and handed back on
 * resume, so a pause costs the current picker nothing.
 *
 * Expiry needs no extra guard while paused — both the client nudge and
 * resolveExpiredTurn already do nothing without a `timerExpiresAt`.
 *
 * Separate from `status: 'paused'`, which means a turn expired under the
 * admin-picks policy. Here the turn is untouched and its holder can still pick.
 */
export const setTimerPaused = functions.https.onCall(
  async (
    data: { seasonId: string; paused: boolean },
    context
  ): Promise<{ paused: boolean; remainingMs: number | null }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { seasonId, paused } = data
    if (!seasonId || typeof paused !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'seasonId and paused required')
    }

    const seasonSnap = await db.doc(`seasons/${seasonId}`).get()
    if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')

    if (!(await isLeagueAdmin(seasonSnap.data()?.leagueId as string, context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Admins only')
    }

    const draftQuery = await db.collection(`seasons/${seasonId}/draft`).limit(1).get()
    if (draftQuery.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'Draft has not been opened')
    }
    const draftRef = draftQuery.docs[0].ref
    const timerSeconds = (seasonSnap.data()?.timerSeconds as number) ?? 60

    const result = await db.runTransaction(async (tx) => {
      const draftSnap = await tx.get(draftRef)
      const draft = draftSnap.data()
      if (!draft || (draft.status !== 'active' && draft.status !== 'paused')) {
        throw new functions.https.HttpsError('failed-precondition', 'Draft is not running')
      }

      const bankedMs = draft.timerPausedRemainingMs as number | null

      if (paused) {
        if (bankedMs !== null && bankedMs !== undefined) {
          return { paused: true, remainingMs: bankedMs } // already paused
        }
        const expiresAt = draft.timerExpiresAt as number | null
        // Bank whatever is left, never a negative. An already-expired clock
        // banks nothing, so resuming hands back a fresh turn rather than one
        // that fires the moment it restarts.
        const remainingMs = expiresAt ? Math.max(0, expiresAt - Date.now()) : timerSeconds * 1000
        tx.update(draftRef, { timerPausedRemainingMs: remainingMs, timerExpiresAt: null })
        return { paused: true, remainingMs }
      }

      if (bankedMs === null || bankedMs === undefined) {
        return { paused: false, remainingMs: null } // already running
      }
      tx.update(draftRef, {
        timerPausedRemainingMs: null,
        timerExpiresAt: Date.now() + (bankedMs > 0 ? bankedMs : timerSeconds * 1000),
      })
      return { paused: false, remainingMs: null }
    })

    await db.collection('auditLogs').add({
      action: paused ? 'draft_timer_paused' : 'draft_timer_resumed',
      seasonId,
      actorUid: context.auth.uid,
      timestamp: Date.now(),
    })

    return result
  }
)

// ── Draft: bench assignment and closing ───────────────────────────────────────

/**
 * Give a bench contestant to a team that finished a roster short.
 *
 * Only reachable while the draft is `awaiting-close`, and only by an admin —
 * members do not get to top themselves up. A team can be brought level with the
 * largest roster and no further, so this repairs a skip rather than rewarding it.
 */
export const assignFromBench = functions.https.onCall(
  async (data: { seasonId: string; contestantId: string; toUid: string }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { seasonId, contestantId, toUid } = data
    if (!seasonId || !contestantId || !toUid) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'seasonId, contestantId and toUid required'
      )
    }

    const seasonRef = db.doc(`seasons/${seasonId}`)
    const seasonSnap = await seasonRef.get()
    if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')

    if (!(await isLeagueAdmin(seasonSnap.data()?.leagueId as string, context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Admins only')
    }

    const memberSnap = await db.doc(`seasons/${seasonId}/members/${toUid}`).get()
    if (!memberSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'That member is not in this season')
    }

    const draftQuery = await db.collection(`seasons/${seasonId}/draft`).limit(1).get()
    if (draftQuery.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'Draft has not been opened')
    }
    const draftRef = draftQuery.docs[0].ref
    const contestantRef = db.doc(`seasons/${seasonId}/contestants/${contestantId}`)
    const contestantsCol = db.collection(`seasons/${seasonId}/contestants`)

    await db.runTransaction(async (tx) => {
      const [draftSnap, contestantSnap, allContestants] = await Promise.all([
        tx.get(draftRef),
        tx.get(contestantRef),
        tx.get(contestantsCol),
      ])
      const draft = draftSnap.data()
      if (!draft || draft.status !== 'awaiting-close') {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'The draft is not waiting to be closed'
        )
      }
      if (!contestantSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Contestant not found')
      }
      if (contestantSnap.data()?.draftedByUid) {
        throw new functions.https.HttpsError('aborted', 'That contestant is already on a team')
      }

      const pickOrder = (draft.pickOrder ?? []) as string[]
      const rosterCounts = countRosters(allContestants.docs, pickOrder)
      const idx = pickOrder.indexOf(toUid)
      if (idx === -1) {
        throw new functions.https.HttpsError('failed-precondition', 'That member is not drafting')
      }
      if (openSlots(rosterCounts[idx], rosterCounts) === 0) {
        throw new functions.https.HttpsError(
          'failed-precondition',
          'That team has no open slots left'
        )
      }

      tx.update(contestantRef, { draftedByUid: toUid, draftedRound: null })
    })

    await db.collection('auditLogs').add({
      action: 'free_agent_assigned',
      seasonId,
      contestantId,
      targetUid: toUid,
      actorUid: context.auth.uid,
      timestamp: Date.now(),
    })

    return { ok: true }
  }
)

/**
 * Close a draft that is waiting on an admin.
 *
 * Deliberately explicit rather than automatic: the admin may have chosen to
 * leave rosters uneven and the remaining contestants on the bench, and that is a
 * decision worth making on purpose.
 */
export const closeDraft = functions.https.onCall(async (data: { seasonId: string }, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
  }
  const { seasonId } = data
  if (!seasonId) throw new functions.https.HttpsError('invalid-argument', 'seasonId required')

  const seasonRef = db.doc(`seasons/${seasonId}`)
  const seasonSnap = await seasonRef.get()
  if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')

  if (!(await isLeagueAdmin(seasonSnap.data()?.leagueId as string, context.auth.uid))) {
    throw new functions.https.HttpsError('permission-denied', 'Admins only')
  }

  const draftQuery = await db.collection(`seasons/${seasonId}/draft`).limit(1).get()
  if (draftQuery.empty) {
    throw new functions.https.HttpsError('failed-precondition', 'Draft has not been opened')
  }
  const draftRef = draftQuery.docs[0].ref

  await db.runTransaction(async (tx) => {
    const draftSnap = await tx.get(draftRef)
    if (draftSnap.data()?.status !== 'awaiting-close') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The draft is not waiting to be closed'
      )
    }
    tx.update(draftRef, { status: 'complete', currentPickerUid: null, timerExpiresAt: null })
    tx.update(seasonRef, { state: 'active' })
  })

  await db.collection('auditLogs').add({
    action: 'draft_closed',
    seasonId,
    actorUid: context.auth.uid,
    timestamp: Date.now(),
  })

  return { ok: true }
})

/**
 * Hand the turn to the next player.
 *
 * `consecutiveSkips` defaults to 0 because most callers got here by way of a
 * pick, and a pick is what proves the draft is still moving.
 */
function advanceTurn(
  tx: FirebaseFirestore.Transaction,
  draftRef: FirebaseFirestore.DocumentReference,
  pickOrder: string[],
  draft: FirebaseFirestore.DocumentData,
  timerSeconds: number,
  consecutiveSkips = 0
) {
  const next = nextSlot(pickOrder, draft.currentRound as number, draft.currentPickNumber as number)
  tx.update(draftRef, {
    status: 'active',
    currentRound: next.round,
    currentPickNumber: next.pickNumber,
    currentPickerUid: pickerAt(pickOrder, next.round, next.pickNumber),
    timerExpiresAt: Date.now() + timerSeconds * 1000,
    consecutiveSkips,
  })
}

/**
 * Admin of this league — or a superadmin, who is admin of everything.
 *
 * Mirrors the same fold in firestore.rules, so the two agree about who may act
 * without every call site having to remember the app-level role exists.
 */
async function isLeagueAdmin(leagueId: string, uid: string): Promise<boolean> {
  if (await isSuperadmin(uid)) return true
  const snap = await db.doc(`leagues/${leagueId}/members/${uid}`).get()
  if (!snap.exists) return false
  const role = snap.data()?.role as string | undefined
  return role === 'owner' || role === 'admin'
}

// ── Superadmin: app-wide user directory ───────────────────────────────────────

/** App-level role, unrelated to the per-league owner/admin/member roles. */
async function isSuperadmin(uid: string): Promise<boolean> {
  return (await db.doc(`superadmins/${uid}`).get()).exists
}

/**
 * Make the very first account on an environment a superadmin.
 *
 * A trigger rather than a branch inside signUpUser, because that is not the only
 * way an account gets made — the emulator path in src/lib/auth.ts writes the user
 * document straight from the client and never calls the function. Hanging this
 * off the document itself catches every route in.
 *
 * The one-shot marker is what makes it safe: two signups landing together would
 * both see an empty superadmins collection, so instead the transaction claims a
 * single document, and Firestore serializes contention on it. Whichever trigger
 * claims it grants the role; the other finds it taken and does nothing.
 *
 * Deleting the last superadmin does not re-arm this. Recovering from that means
 * granting out of band, same as the first one in an environment that already has
 * users — which is deliberate, since "next person to sign up becomes superadmin"
 * would be a way in rather than a recovery.
 */
export const grantFirstUserSuperadmin = functions.firestore
  .document('users/{uid}')
  .onCreate(async (_snap, context) => {
    const { uid } = context.params
    const markerRef = db.doc('appConfig/bootstrap')

    // Only in a genuinely empty environment. Without this, deploying to a
    // project that already has accounts would hand the role to whoever signed
    // up next — a way in rather than a bootstrap. The trigger runs after the
    // write, so one document means this account and nobody else.
    const existing = await db.collection('users').limit(2).get()
    if (existing.size > 1) return

    const granted = await db.runTransaction(async (tx) => {
      const marker = await tx.get(markerRef)
      if (marker.exists) return false

      tx.set(markerRef, { superadminGrantedTo: uid, grantedAt: Date.now() })
      tx.set(db.doc(`superadmins/${uid}`), {
        grantedAt: Date.now(),
        note: 'first account on this environment',
      })
      return true
    })

    if (granted) {
      functions.logger.info(`Granted superadmin to first user ${uid}`)
      await db.collection('auditLogs').add({
        action: 'superadmin_granted',
        actorUid: 'system',
        targetUid: uid,
        reason: 'first-user',
        timestamp: Date.now(),
      })
    }
  })

/**
 * Every account on the app, for the superadmin user directory.
 *
 * Served through a function rather than a Firestore query on purpose. Listing
 * users means exposing email addresses, which PRD 7.3 otherwise keeps private
 * between league members — so the `users` read rule stays own-document-only and
 * this is the single audited way to see more. Widening the rule instead would
 * make every future client query a potential leak.
 */
export const listAllUsers = functions.https.onCall(
  async (
    _data: unknown,
    context
  ): Promise<{
    users: { uid: string; displayName: string; email: string; createdAt: number | null }[]
  }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    if (!(await isSuperadmin(context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Superadmins only')
    }

    const snap = await db.collection('users').get()
    const users = snap.docs
      .map((d) => ({
        uid: d.id,
        displayName: (d.data().displayName as string) ?? '',
        email: (d.data().email as string) ?? '',
        createdAt: (d.data().createdAt as number) ?? null,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))

    await db.collection('auditLogs').add({
      action: 'user_directory_viewed',
      actorUid: context.auth.uid,
      userCount: users.length,
      timestamp: Date.now(),
    })

    return { users }
  }
)

// ── Audit log helper ──────────────────────────────────────────────────────────

export const logAuditEvent = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
  await db.collection('auditLogs').add({
    ...data,
    actorUid: context.auth.uid,
    timestamp: Date.now(),
  })
})

// ── Score calculation trigger ─────────────────────────────────────────────────

export const onEpisodeScoreWritten = functions.firestore
  .document('seasons/{seasonId}/episodeScores/{episodeNumber}/contestantScores/{contestantId}')
  .onWrite(async (_, context) => {
    const { seasonId } = context.params
    await recalcTeamTotals(seasonId)
  })

export const onSeasonAwardWritten = functions.firestore
  .document('seasons/{seasonId}/seasonAwards/{ruleId}')
  .onWrite(async (_, context) => {
    const { seasonId } = context.params
    await recalcTeamTotals(seasonId)
  })

async function recalcTeamTotals(seasonId: string) {
  // Fetch all data needed for recalculation
  const [membersSnap, rulesSnap, awardsSnap, episodeScoresSnap] = await Promise.all([
    db.collection(`seasons/${seasonId}/members`).get(),
    db.collection(`seasons/${seasonId}/scoringRules`).get(),
    db.collection(`seasons/${seasonId}/seasonAwards`).get(),
    db.collection(`seasons/${seasonId}/episodeScores`).get(),
  ])

  const rules = rulesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ScoringRule[]
  const awards = awardsSnap.docs.map((d) => d.data()) as SeasonAwardDoc[]
  const awardRules = rules.filter((r) => r.type === 'bonus_challenge' && r.scope === 'season_level')

  // Fetch contestant scores for each episode
  const episodeDocs = await Promise.all(
    episodeScoresSnap.docs.map(async (epDoc) => {
      const scoresSnap = await db
        .collection(`seasons/${seasonId}/episodeScores/${epDoc.id}/contestantScores`)
        .get()
      const scores: Record<string, ContestantScoreDoc> = {}
      scoresSnap.docs.forEach((d) => {
        scores[d.id] = d.data() as ContestantScoreDoc
      })
      return { episodeNumber: parseInt(epDoc.id, 10), scores }
    })
  )

  // Fetch contestants to map draftedByUid
  const contestantsSnap = await db.collection(`seasons/${seasonId}/contestants`).get()
  const contestantOwners: Record<string, string> = {}
  contestantsSnap.docs.forEach((d) => {
    const owner = d.data().draftedByUid as string | null
    if (owner) contestantOwners[d.id] = owner
  })

  // Group contestants by owner
  const teamContestants: Record<string, string[]> = {}
  for (const [contestantId, ownerUid] of Object.entries(contestantOwners)) {
    if (!teamContestants[ownerUid]) teamContestants[ownerUid] = []
    teamContestants[ownerUid].push(contestantId)
  }

  // Calc totals for each member
  const teamTotals: Record<string, number> = {}
  const teamEpisodeTotals: Record<string, Record<string, number>> = {}

  for (const memberDoc of membersSnap.docs) {
    const uid = memberDoc.id
    const contestantIds = teamContestants[uid] ?? []
    teamTotals[uid] = calcTeamTotal(contestantIds, episodeDocs, awards, awardRules)
    teamEpisodeTotals[uid] = calcTeamEpisodeTotals(contestantIds, episodeDocs, awards, awardRules)
  }

  await db.doc(`seasons/${seasonId}`).update({ teamTotals, teamEpisodeTotals })
}
