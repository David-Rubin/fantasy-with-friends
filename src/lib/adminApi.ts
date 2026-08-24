import { httpsCallable } from 'firebase/functions'
import { functions } from './firebase'
import type { AppUser } from './types'

/**
 * Every account on the app, for the superadmin user directory.
 *
 * A callable rather than a Firestore query: the `users` read rule stays
 * own-document-only, so email addresses — which PRD 7.3 keeps private between
 * league members — are only ever reachable through this one checked path.
 * Rejects anyone who is not a superadmin.
 */
export const listAllUsers = httpsCallable<void, { users: AppUser[] }>(functions, 'listAllUsers')
