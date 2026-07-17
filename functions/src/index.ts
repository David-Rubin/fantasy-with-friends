import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions/v1'
import { calcTeamTotal, calcTeamEpisodeTotals } from './scoring'
import type { ScoringRule, ContestantScoreDoc, SeasonAwardDoc } from './scoring'

admin.initializeApp()
const db = admin.firestore()

// ── Auth: sign up ─────────────────────────────────────────────────────────────

export const signUpUser = functions.https.onCall(
  async (data: { displayName: string; email: string; inviteCode?: string }) => {
    const { displayName, email, inviteCode } = data

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

    // Redeem invite code if provided
    if (inviteCode) {
      try {
        await redeemInviteCode(inviteCode, userRecord.uid)
      } catch {
        // Non-fatal — user is created even if invite code fails
        functions.logger.warn('Failed to redeem invite code during signup', { inviteCode })
      }
    }

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

// ── Invite: validate and redeem ───────────────────────────────────────────────

export const validateInviteCode = functions.https.onCall(
  async (data: { code: string }, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in')

    const { code } = data
    const uid = context.auth.uid

    // Rate limiting: simple Firestore counter per IP
    // (Production would use a more robust solution)

    // Find season with this invite code
    const seasonsSnap = await db
      .collection('seasons')
      .where('inviteCode', '==', code.toUpperCase())
      .limit(1)
      .get()

    if (seasonsSnap.empty) {
      throw new functions.https.HttpsError('not-found', 'Invalid invite code')
    }

    const seasonDoc = seasonsSnap.docs[0]
    const seasonId = seasonDoc.id
    const leagueId = seasonDoc.data().leagueId as string

    // Check if already a member
    const memberSnap = await db.doc(`seasons/${seasonId}/members/${uid}`).get()
    if (memberSnap.exists) {
      return { seasonId, leagueId, alreadyMember: true }
    }

    await redeemInviteCode(code, uid, seasonId, leagueId)
    return { seasonId, leagueId, alreadyMember: false }
  }
)

async function redeemInviteCode(code: string, uid: string, seasonId?: string, leagueId?: string) {
  if (!seasonId || !leagueId) {
    const snap = await db
      .collection('seasons')
      .where('inviteCode', '==', code.toUpperCase())
      .limit(1)
      .get()
    if (snap.empty) throw new Error('Invalid code')
    seasonId = snap.docs[0].id
    leagueId = snap.docs[0].data().leagueId
  }

  const userDoc = await db.doc(`users/${uid}`).get()
  const displayName = userDoc.exists ? (userDoc.data()?.displayName as string) : uid

  const batch = db.batch()

  // Add to league (as member)
  batch.set(
    db.doc(`leagues/${leagueId}/members/${uid}`),
    {
      role: 'member',
      joinedAt: Date.now(),
    },
    { merge: true }
  )

  // Add to season
  batch.set(db.doc(`seasons/${seasonId}/members/${uid}`), {
    teamName: `${displayName}'s Team`,
    pickPosition: null,
    joinedAt: Date.now(),
  })

  await batch.commit()
}

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
