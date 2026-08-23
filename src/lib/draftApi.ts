import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'

/**
 * Submit a draft pick.
 *
 * Every write a pick entails happens server-side. Three of the four documents
 * involved are admin-only, so a member picking from the client was denied
 * partway through and left the draft stalled; the function also checks turn and
 * availability in one transaction, closing the double-pick race.
 *
 * `onBehalfOf` is an admin proxy pick (PRD 3.3.2) and is rejected for non-admins.
 */
export const submitPick = httpsCallable<
  { seasonId: string; contestantId: string; onBehalfOf?: string },
  { status: 'active' | 'complete' }
>(functions, 'submitPick')
