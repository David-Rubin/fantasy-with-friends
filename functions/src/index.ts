import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore'

// The three Firestore triggers below are 2nd gen while every callable is 1st.
// Not a style choice: a 1st gen Firestore trigger cannot watch a database in a
// multi-region location, and this project's is in nam5. The deploy fails with
// "is in region nam5-us-central1 which is not supported". 2nd gen goes through
// Eventarc, which does support it. The callables have no such constraint and
// are left alone rather than migrated for tidiness — mixing generations in one
// codebase is supported, and a rewrite of twelve entry points is a larger
// change than the reason for it warrants.
import { calcTeamTotal, calcTeamEpisodeTotals } from './scoring'
import {
  nextSlot,
  pickerAt,
  draftOutcome,
  openSlots,
  skipLimitReached,
  resolvePickOrder,
} from './draft'
import { planRemoval, canRemove, blockingReason, type MemberSeason } from './membership'
import { userDeletionProblem, userDeletionMessage } from './deletion'
import type { ContestantScoreDoc } from './scoring'

admin.initializeApp()
const db = admin.firestore()

/**
 * Settings for the callables someone is sitting and waiting on — a pick, the
 * clock, opening or closing the board.
 *
 * A 1st gen function's CPU is tied to its memory, and the 256MB default is the
 * slowest share on offer. That cost is paid mostly on a cold start, where the
 * container has to boot Node and load this module — every entry point in it,
 * since they share one file — before the handler runs at all. On a warm
 * instance it is milliseconds; on a cold one, at a quarter of the clock speed,
 * it is the difference between a button that responds and a button that looks
 * broken. Pausing the draft clock was taking the best part of ten seconds the
 * first time it was pressed, and only the first time.
 *
 * This does not abolish cold starts — only a minimum instance does that, and
 * that one is billed by the hour whether anyone drafts or not. It makes them
 * several times shorter for the price of a little memory during the call.
 */
const INTERACTIVE: functions.RuntimeOptions = { memory: '1GB', timeoutSeconds: 60 }

// ── Users: keep the copies of a profile in step with it ──────────────────────

/**
 * Fan a changed display name or picture out to every membership the user holds.
 *
 * `users/{uid}` is readable only by its owner — it carries the email address,
 * which PRD §7.3 keeps private between members — so a roster cannot look anyone
 * up and copies the name and picture onto each member document instead. Those
 * copies then have to be maintained, and this is what maintains them: without
 * it, renaming yourself or changing your picture leaves every league roster,
 * draft room and leaderboard showing what you used to be called.
 *
 * A trigger rather than a client fan-out because the client cannot do it. A
 * member may not write their own league membership at all (the rules give that
 * to the owner) and may only change `teamName` on a season membership, which is
 * right — someone who could rewrite their own roster rows could rewrite their
 * role. The Admin SDK is not bound by those rules, so the work belongs here.
 *
 * Only fires on an actual change to one of the two copied fields. Every other
 * write to a user document — and the trigger's own writes never touch it —
 * leaves the rosters alone.
 */
export const onUserProfileWritten = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  // Deleted account: deleteUser removes the memberships itself, so there is
  // nothing to fan out to.
  if (!after) return

  const nameChanged = before?.displayName !== after.displayName
  const photoChanged = (before?.photoUrl ?? '') !== (after.photoUrl ?? '')
  if (!nameChanged && !photoChanged) return

  const { uid } = event.params

  // Every membership at once. The collection-group index on `uid` is declared
  // in firestore.indexes.json for the client's own queries; this uses it too.
  const memberships = await db.collectionGroup('members').where('uid', '==', uid).get()
  if (memberships.empty) return

  const update: Record<string, unknown> = { displayName: after.displayName }
  // An empty photoUrl means the picture was removed, and the copies have to
  // lose it too — writing '' rather than deleting keeps the shape predictable
  // and reads the same as absent at every call site.
  update.photoUrl = after.photoUrl ?? ''

  // Firestore caps a batch at 500 writes. A user in more leagues and seasons
  // than that is not a case worth failing on silently.
  const CHUNK = 400
  for (let i = 0; i < memberships.docs.length; i += CHUNK) {
    const batch = db.batch()
    for (const membership of memberships.docs.slice(i, i + CHUNK)) {
      batch.update(membership.ref, update)
    }
    await batch.commit()
  }

  functions.logger.info(
    `Synced profile for ${uid} to ${memberships.size} membership(s)` +
      `${nameChanged ? ' [name]' : ''}${photoChanged ? ' [photo]' : ''}`
  )
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
export const onLeagueMemberWritten = onDocumentWritten(
  'leagues/{leagueId}/members/{uid}',
  async (event) => {
    // Role edits leave the roster size alone.
    if (event.data?.before.exists && event.data.after.exists) return

    const { leagueId } = event.params
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get()
    await db.doc(`leagues/${leagueId}`).update({ memberCount: membersSnap.size })
  }
)

// ── Leagues: remove a member ─────────────────────────────────────────────────

/**
 * Remove someone from a league, and from any season of it that has not started.
 *
 * A Cloud Function rather than a client delete, for the same reason picks are:
 * the rule that matters here cannot be written as a security rule. Deciding
 * whether this member is sitting in a season that is drafting or active means
 * querying the seasons collection and checking a document in each one, and
 * rules can do neither. Leaving the check in the client would make it advice
 * rather than a constraint — so `leagues/{id}/members/{uid}` is delete-denied to
 * clients and this is the only way through.
 *
 * What each season state means for the member is decided in ./membership.
 */
export const removeLeagueMember = functions.https.onCall(
  async (
    data: { leagueId: string; uid: string },
    context
  ): Promise<{ leftSeasons: string[]; keptSeasons: string[] }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }

    const { leagueId, uid } = data
    if (!leagueId || !uid) {
      throw new functions.https.HttpsError('invalid-argument', 'leagueId and uid are required')
    }

    const leagueRef = db.doc(`leagues/${leagueId}`)
    const leagueSnap = await leagueRef.get()
    if (!leagueSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'League not found')
    }

    const ownerId = leagueSnap.data()?.ownerId as string
    // The show lives on the league now, so a season is named by its label plus
    // the league's show — "The Traitors — Season 3" rather than a bare label.
    const showName = (leagueSnap.data()?.showName as string) ?? ''
    const actingUid = context.auth.uid
    if (actingUid !== ownerId && !(await isSuperadmin(actingUid))) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only the league owner can remove members'
      )
    }

    // The owner is the one member with nobody above them to be removed by, and
    // a league without an owner has no route back to having one.
    if (uid === ownerId) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The league owner cannot be removed'
      )
    }

    const memberRef = db.doc(`leagues/${leagueId}/members/${uid}`)
    if (!(await memberRef.get()).exists) {
      throw new functions.https.HttpsError('not-found', 'That user is not a member of this league')
    }

    const seasonsSnap = await db.collection('seasons').where('leagueId', '==', leagueId).get()
    const memberships = await Promise.all(
      seasonsSnap.docs.map(async (d): Promise<MemberSeason | null> => {
        const inSeason = (await db.doc(`seasons/${d.id}/members/${uid}`).get()).exists
        if (!inSeason) return null
        const season = d.data()
        return {
          id: d.id,
          state: season.state,
          label: showName ? `${showName} — ${season.label}` : season.label,
        }
      })
    )

    const plan = planRemoval(memberships.filter((m): m is MemberSeason => m !== null))

    if (!canRemove(plan)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `They are playing in ${blockingReason(plan)}. Members can only be removed once a season has finished.`
      )
    }

    const batch = db.batch()
    batch.delete(memberRef)
    for (const season of plan.leaving) {
      batch.delete(db.doc(`seasons/${season.id}/members/${uid}`))
    }
    await batch.commit()

    await db.collection('auditLogs').add({
      action: 'league_member_removed',
      actorUid: actingUid,
      targetUid: uid,
      leagueId,
      newValue: {
        leftSeasons: plan.leaving.map((s) => s.id),
        keptSeasons: plan.keeping.map((s) => s.id),
      },
      timestamp: Date.now(),
    })

    return {
      leftSeasons: plan.leaving.map((s) => s.id),
      keptSeasons: plan.keeping.map((s) => s.id),
    }
  }
)

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
export const submitPick = functions
  .runWith(INTERACTIVE)
  .https.onCall(
    async (
      data: { seasonId: string; contestantId?: string; onBehalfOf?: string; warm?: boolean },
      context
    ): Promise<{ status: 'active' | 'awaiting-close' | 'complete'; warmed?: boolean }> => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
      }
      // The first pick of a draft pays the same cold start as the first pause.
      // See the note on warming above setTimerPaused.
      if (data.warm) return { status: 'active', warmed: true }
      const actingUid = context.auth.uid
      const { seasonId, contestantId, onBehalfOf } = data

      if (!seasonId || !contestantId) {
        throw new functions.https.HttpsError(
          'invalid-argument',
          'seasonId and contestantId required'
        )
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
          throw new functions.https.HttpsError(
            'aborted',
            'That contestant has already been drafted'
          )
        }
        if (contestant?.eliminatedEpisode !== null && contestant?.eliminatedEpisode !== undefined) {
          throw new functions.https.HttpsError('failed-precondition', 'Contestant is eliminated')
        }

        // An admin may pick out of turn only via onBehalfOf; picking for yourself
        // still requires it to actually be your turn.
        if (draft.currentPickerUid !== pickerUid) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            'It is not that member’s turn'
          )
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
export const resolveExpiredTurn = functions.runWith(INTERACTIVE).https.onCall(
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

// ── Draft: opening the board ─────────────────────────────────────────────────

/**
 * Start the draft: fix the order, hand out pick positions, and start the clock.
 *
 * Server-side because of the clock. The deadline is an absolute timestamp that
 * the server later measures against its own `Date.now()` — when a turn expires,
 * and what a pause banks — so a deadline written from a browser silently mixes
 * two clocks. An admin whose machine ran five seconds fast wrote a deadline
 * five seconds further out than the timer they had configured: their own screen
 * counted down correctly, because it was reading its own clock back, while
 * every other participant and the server itself saw five seconds more. Pausing
 * a 60-second timer at 56 banked 61. Nothing about that is visible to the admin
 * who caused it, and it drifts with whatever their clock happens to be doing.
 *
 * With the write here, the deadline and the clock that judges it are the same
 * clock. A participant whose own machine is off still renders a countdown that
 * is off by their skew — a browser can only subtract the time it has — but what
 * is stored, banked and enforced no longer depends on who pressed the button.
 *
 * The rest follows from being here anyway: one batch instead of a write per
 * member issued one at a time from a browser, and a guard against two admins
 * opening the board at once, which the old path would have answered with two
 * draft documents and a coin toss over which one counted.
 */
export const startDraft = functions
  .runWith(INTERACTIVE)
  .https.onCall(
    async (
      data: { seasonId: string },
      context
    ): Promise<{ pickOrder: string[]; timerExpiresAt: number }> => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
      }
      const { seasonId } = data
      if (!seasonId) throw new functions.https.HttpsError('invalid-argument', 'seasonId required')

      const seasonRef = db.doc(`seasons/${seasonId}`)
      const [seasonSnap, membersSnap, draftQuery] = await Promise.all([
        seasonRef.get(),
        db.collection(`seasons/${seasonId}/members`).get(),
        db.collection(`seasons/${seasonId}/draft`).limit(1).get(),
      ])
      if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')
      const season = seasonSnap.data() ?? {}

      if (!(await isLeagueAdmin(season.leagueId as string, context.auth.uid))) {
        throw new functions.https.HttpsError('permission-denied', 'Admins only')
      }
      // Already open. Returning the running draft rather than throwing keeps a
      // double click — or two admins on the same lobby — harmless.
      if (!draftQuery.empty) {
        const existing = draftQuery.docs[0].data()
        return {
          pickOrder: (existing.pickOrder as string[]) ?? [],
          timerExpiresAt: (existing.timerExpiresAt as number) ?? 0,
        }
      }
      if (membersSnap.empty) {
        throw new functions.https.HttpsError('failed-precondition', 'Season has no members')
      }

      const memberUids = membersSnap.docs.map((d) => d.id)
      const pickOrder = resolvePickOrder(
        (season.pickOrderMethod as 'randomized' | 'admin-set') ?? 'randomized',
        memberUids,
        season.adminPickOrder as string[] | undefined
      )
      const timerSeconds = (season.timerSeconds as number) ?? 60
      const timerExpiresAt = Date.now() + timerSeconds * 1000

      const batch = db.batch()
      batch.set(db.collection(`seasons/${seasonId}/draft`).doc(), {
        status: 'active',
        currentPickerUid: pickOrder[0],
        currentRound: 1,
        currentPickNumber: 1,
        pickOrder,
        timerExpiresAt,
        consecutiveSkips: 0,
        haltedReason: null,
        timerPausedRemainingMs: null,
      })
      pickOrder.forEach((uid, i) => {
        batch.update(db.doc(`seasons/${seasonId}/members/${uid}`), { pickPosition: i + 1 })
      })
      batch.update(seasonRef, { state: 'draft' })
      await batch.commit()

      await db.collection('auditLogs').add({
        action: 'draft_started',
        seasonId,
        leagueId: season.leagueId,
        actorUid: context.auth.uid,
        newValue: pickOrder,
        timestamp: Date.now(),
      })

      return { pickOrder, timerExpiresAt }
    }
  )

// ── Draft: waking the instance before it is needed ───────────────────────────

/**
 * A call that does nothing except arrive.
 *
 * Cold starts are what made the first press of Pause take the best part of ten
 * seconds: the container has to boot Node and load this module before the
 * handler runs. An instance stays warm for a while after any call, and a draft
 * room is open for minutes before anyone touches the clock — so the room sends
 * one of these on the way in, and the press that matters lands on a warm
 * instance.
 *
 * It has to be an explicit flag, and it has to return before reading anything.
 * The obvious alternative — ask the function to set the state it is already in
 * and let it short-circuit — is a race: the client's idea of the current state
 * can be stale by the time the server acts on it, so a warm-up that set out
 * believing the clock was running would resume a clock that had been paused in
 * the meantime. The dangerous window is exactly the one where it is slow.
 *
 * Signed in is still required. Beyond that it reads nothing and writes nothing,
 * so there is nothing for it to get wrong.
 */

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
export const setTimerPaused = functions
  .runWith(INTERACTIVE)
  .https.onCall(
    async (
      data: { seasonId: string; paused: boolean; warm?: boolean },
      context
    ): Promise<{ paused: boolean; remainingMs: number | null; warmed?: boolean }> => {
      if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
      }
      // See the note on warming above: returns before touching any state.
      if (data.warm) return { paused: false, remainingMs: null, warmed: true }
      const { seasonId, paused } = data
      if (!seasonId || typeof paused !== 'boolean') {
        throw new functions.https.HttpsError('invalid-argument', 'seasonId and paused required')
      }

      // Fetched together: neither read depends on the other, and this runs while
      // an admin watches the button spin.
      const [seasonSnap, draftQuery] = await Promise.all([
        db.doc(`seasons/${seasonId}`).get(),
        db.collection(`seasons/${seasonId}/draft`).limit(1).get(),
      ])
      if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')

      if (!(await isLeagueAdmin(seasonSnap.data()?.leagueId as string, context.auth.uid))) {
        throw new functions.https.HttpsError('permission-denied', 'Admins only')
      }

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
export const closeDraft = functions
  .runWith(INTERACTIVE)
  .https.onCall(async (data: { seasonId: string }, context) => {
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
 * Put a season that is drafting back into setup so an admin can change it.
 *
 * A forgotten contestant or a wrong scoring rule is only discovered once the
 * draft is under way, and the setup panel is not reachable from a season in
 * `draft`. Rather than let settings be edited underneath a running draft — where
 * adding a contestant mid-draft would mean some teams never had the chance to
 * take them — the draft is undone entirely and run again afterwards.
 *
 * A Cloud Function because a rule cannot express any of it: picks are
 * `allow write: if false` and are only ever written here, and the reset spans
 * every contestant and every member of the season.
 *
 * Restricted to `draft`. A season that is `active` or `complete` has episode
 * scores keyed to drafted teams, and undoing its draft would leave a
 * leaderboard describing rosters that no longer exist.
 */
export const reopenSeasonSetup = functions.https.onCall(
  async (
    data: { seasonId: string },
    context
  ): Promise<{ clearedPicks: number; clearedContestants: number }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { seasonId } = data
    if (!seasonId) throw new functions.https.HttpsError('invalid-argument', 'seasonId required')

    const seasonRef = db.doc(`seasons/${seasonId}`)
    const seasonSnap = await seasonRef.get()
    if (!seasonSnap.exists) throw new functions.https.HttpsError('not-found', 'Season not found')

    const season = seasonSnap.data()!
    if (!(await isLeagueAdmin(season.leagueId as string, context.auth.uid))) {
      throw new functions.https.HttpsError('permission-denied', 'Admins only')
    }
    if (season.state !== 'draft') {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Only a season that is drafting can be reopened for editing'
      )
    }

    const [draftDocs, contestants, members] = await Promise.all([
      db.collection(`seasons/${seasonId}/draft`).get(),
      db.collection(`seasons/${seasonId}/contestants`).get(),
      db.collection(`seasons/${seasonId}/members`).get(),
    ])

    // The draft document is deleted rather than rewound: opening a draft creates
    // it, so leaving one behind would have the lobby make a second.
    type Write = (batch: admin.firestore.WriteBatch) => void
    const writes: Write[] = []
    let clearedPicks = 0

    for (const draftDoc of draftDocs.docs) {
      const picks = await draftDoc.ref.collection('picks').get()
      clearedPicks += picks.size
      for (const pick of picks.docs) writes.push((batch) => batch.delete(pick.ref))
      writes.push((batch) => batch.delete(draftDoc.ref))
    }
    for (const contestant of contestants.docs) {
      writes.push((batch) => batch.update(contestant.ref, { draftedByUid: null }))
    }
    for (const member of members.docs) {
      writes.push((batch) => batch.update(member.ref, { pickPosition: null }))
    }
    writes.push((batch) => batch.update(seasonRef, { state: 'setup' }))

    // Committed in chunks because a batch takes 500 writes, and a long season
    // with a large roster can pass that between its picks and its contestants.
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch()
      for (const write of writes.slice(i, i + 400)) write(batch)
      await batch.commit()
    }

    await db.collection('auditLogs').add({
      action: 'season_reopened_for_setup',
      seasonId,
      leagueId: season.leagueId,
      actorUid: context.auth.uid,
      newValue: { clearedPicks, clearedContestants: contestants.size },
      timestamp: Date.now(),
    })

    return { clearedPicks, clearedContestants: contestants.size }
  }
)

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
 * A trigger rather than part of the sign-up path, because sign-up happens in the
 * client (src/lib/auth.ts) and a client cannot be trusted to grant itself a
 * role — the rules make `superadmins/{uid}` unwritable from there. Hanging this
 * off the user document itself catches every route in, whatever creates it.
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
export const grantFirstUserSuperadmin = onDocumentCreated('users/{uid}', async (event) => {
  const { uid } = event.params
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

// ── Deletion ──────────────────────────────────────────────────────────────────

/**
 * Deleting a user, a league or a season.
 *
 * All three are callables, with the client's own delete path closed in the
 * rules, because none of this can be expressed as a security rule. Each target
 * is a document *tree*, not a document: a season carries members, contestants,
 * scoring rules, episode scores and a draft with its picks, and a league
 * carries every season under it. Rules cannot delete what they cannot
 * enumerate, and the guards — which leagues does this user own, is any of
 * their seasons underway — are queries across collections.
 *
 * Doing the cascade from the client was the other option and is worse: it is a
 * few hundred writes with no transaction around them, so the first closed tab
 * or dropped connection leaves a half-deleted tree that nothing will ever
 * finish. recursiveDelete runs server-side and resumes on retry.
 */

/** Both delete paths accept the league's owner or any superadmin. */
async function assertLeagueOwnerOrSuperadmin(leagueId: string, uid: string, action: string) {
  const leagueSnap = await db.doc(`leagues/${leagueId}`).get()
  if (!leagueSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'League not found')
  }
  if (leagueSnap.data()?.ownerId !== uid && !(await isSuperadmin(uid))) {
    throw new functions.https.HttpsError('permission-denied', action)
  }
  return leagueSnap
}

/**
 * Delete a league and everything under it.
 *
 * The owner or a superadmin, deliberately not a league admin: an admin runs a
 * league day to day, and destroying one stays with the person whose league it
 * is. That matches removeLeagueMember, which is owner-only for the same reason.
 */
export const deleteLeague = functions.https.onCall(
  async (
    data: { leagueId: string },
    context
  ): Promise<{ seasonsDeleted: number; membersDeleted: number }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { leagueId } = data
    if (!leagueId) {
      throw new functions.https.HttpsError('invalid-argument', 'leagueId is required')
    }

    const actingUid = context.auth.uid
    const leagueSnap = await assertLeagueOwnerOrSuperadmin(
      leagueId,
      actingUid,
      'Only the league owner can delete a league'
    )

    const seasonsSnap = await db.collection('seasons').where('leagueId', '==', leagueId).get()
    const membersSnap = await db.collection(`leagues/${leagueId}/members`).get()

    // Seasons live in a top-level collection keyed by leagueId rather than
    // under the league, so deleting the league document does not reach them.
    for (const season of seasonsSnap.docs) {
      await db.recursiveDelete(season.ref)
    }
    // Takes the members and joinRequests subcollections with it.
    await db.recursiveDelete(db.doc(`leagues/${leagueId}`))

    await db.collection('auditLogs').add({
      action: 'league_deleted',
      actorUid: actingUid,
      leagueId,
      oldValue: {
        name: leagueSnap.data()?.name ?? '',
        showName: leagueSnap.data()?.showName ?? '',
        seasonIds: seasonsSnap.docs.map((d) => d.id),
        memberCount: membersSnap.size,
      },
      timestamp: Date.now(),
    })

    return { seasonsDeleted: seasonsSnap.size, membersDeleted: membersSnap.size }
  }
)

/**
 * Delete one season and everything under it.
 *
 * Any admin of the owning league, which is what isSeasonAdmin means in the
 * rules — a season has no separate admin list of its own. Wider than
 * deleteLeague on purpose: a season is the unit an admin is expected to manage,
 * and a botched setup is exactly the thing they need to be able to throw away.
 */
export const deleteSeason = functions.https.onCall(
  async (data: { seasonId: string }, context): Promise<{ leagueId: string }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const { seasonId } = data
    if (!seasonId) {
      throw new functions.https.HttpsError('invalid-argument', 'seasonId is required')
    }

    const actingUid = context.auth.uid
    const seasonSnap = await db.doc(`seasons/${seasonId}`).get()
    if (!seasonSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Season not found')
    }
    const leagueId = seasonSnap.data()?.leagueId as string

    const memberSnap = await db.doc(`leagues/${leagueId}/members/${actingUid}`).get()
    const role = memberSnap.data()?.role
    if (role !== 'owner' && role !== 'admin' && !(await isSuperadmin(actingUid))) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only a league admin can delete a season'
      )
    }

    await db.recursiveDelete(db.doc(`seasons/${seasonId}`))

    await db.collection('auditLogs').add({
      action: 'season_deleted',
      actorUid: actingUid,
      leagueId,
      seasonId,
      oldValue: {
        label: seasonSnap.data()?.label ?? '',
        state: seasonSnap.data()?.state ?? '',
      },
      timestamp: Date.now(),
    })

    return { leagueId }
  }
)

/**
 * Delete a user account.
 *
 * Superadmins only, and refused outright in the three cases userDeletionProblem
 * describes — see that function for why each one blocks.
 *
 * What survives is their membership of *completed* seasons. Those documents
 * carry a denormalised displayName, so a finished leaderboard still reads
 * correctly with the account gone. Erasing them instead would rewrite a
 * standing other people played for, which is the same reason removeLeagueMember
 * leaves completed seasons alone.
 */
export const deleteUser = functions.https.onCall(
  async (
    data: { uid: string },
    context
  ): Promise<{ leaguesLeft: number; seasonsLeft: number; seasonsKept: number }> => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')
    }
    const actingUid = context.auth.uid
    if (!(await isSuperadmin(actingUid))) {
      throw new functions.https.HttpsError('permission-denied', 'Superadmins only')
    }

    const { uid } = data
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'uid is required')
    }

    const userSnap = await db.doc(`users/${uid}`).get()
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found')
    }

    const ownedSnap = await db.collection('leagues').where('ownerId', '==', uid).get()

    // One collection-group query finds every membership document this user has,
    // league and season alike — both denormalise `uid` for exactly this kind of
    // lookup. They are told apart by the collection their grandparent sits in.
    const membershipSnap = await db.collectionGroup('members').where('uid', '==', uid).get()
    const leagueMemberDocs = membershipSnap.docs.filter(
      (d) => d.ref.parent.parent?.parent.id === 'leagues'
    )
    const seasonMemberDocs = membershipSnap.docs.filter(
      (d) => d.ref.parent.parent?.parent.id === 'seasons'
    )

    const seasons = await Promise.all(
      seasonMemberDocs.map(async (d): Promise<MemberSeason> => {
        const seasonRef = d.ref.parent.parent!
        const season = (await seasonRef.get()).data()
        return {
          id: seasonRef.id,
          state: season?.state,
          label: (season?.label as string) ?? seasonRef.id,
        }
      })
    )

    const problem = userDeletionProblem({
      isSelf: uid === actingUid,
      ownedLeagues: ownedSnap.docs.map((d) => ({
        id: d.id,
        name: (d.data().name as string) ?? d.id,
      })),
      seasons,
    })
    if (problem) {
      throw new functions.https.HttpsError('failed-precondition', userDeletionMessage(problem))
    }

    const plan = planRemoval(seasons)

    const batch = db.batch()
    for (const d of leagueMemberDocs) batch.delete(d.ref)
    for (const season of plan.leaving) {
      batch.delete(db.doc(`seasons/${season.id}/members/${uid}`))
    }
    for (const league of leagueMemberDocs) {
      const leagueId = league.ref.parent.parent!.id
      batch.delete(db.doc(`leagues/${leagueId}/joinRequests/${uid}`))
    }
    batch.delete(db.doc(`superadmins/${uid}`))
    batch.delete(db.doc(`users/${uid}`))
    await batch.commit()

    // Last, and tolerant of being already gone: an account with no auth record
    // but a user document is exactly the state this call exists to clean up, so
    // a missing record must not fail the whole deletion.
    try {
      await admin.auth().deleteUser(uid)
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') throw err
    }

    await db.collection('auditLogs').add({
      action: 'user_deleted',
      actorUid: actingUid,
      targetUid: uid,
      oldValue: {
        displayName: userSnap.data()?.displayName ?? '',
        email: userSnap.data()?.email ?? '',
        leaguesLeft: leagueMemberDocs.map((d) => d.ref.parent.parent!.id),
        seasonsLeft: plan.leaving.map((s) => s.id),
        seasonsKept: plan.keeping.map((s) => s.id),
      },
      timestamp: Date.now(),
    })

    return {
      leaguesLeft: leagueMemberDocs.length,
      seasonsLeft: plan.leaving.length,
      seasonsKept: plan.keeping.length,
    }
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

export const onEpisodeScoreWritten = onDocumentWritten(
  'seasons/{seasonId}/episodeScores/{episodeNumber}/contestantScores/{contestantId}',
  async (event) => {
    const { seasonId } = event.params
    await recalcTeamTotals(seasonId)
  }
)

async function recalcTeamTotals(seasonId: string) {
  // Fetch all data needed for recalculation
  const [membersSnap, episodeScoresSnap] = await Promise.all([
    db.collection(`seasons/${seasonId}/members`).get(),
    db.collection(`seasons/${seasonId}/episodeScores`).get(),
  ])

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
    teamTotals[uid] = calcTeamTotal(contestantIds, episodeDocs)
    teamEpisodeTotals[uid] = calcTeamEpisodeTotals(contestantIds, episodeDocs)
  }

  await db.doc(`seasons/${seasonId}`).update({ teamTotals, teamEpisodeTotals })
}
