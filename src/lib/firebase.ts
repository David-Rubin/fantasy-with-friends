import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  initializeAuth,
  browserSessionPersistence,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getStorage, connectStorageEmulator } from 'firebase/storage'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'
import { tabScopedAuthEnabled } from './authPersistence'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// A bundle built without these carries `undefined` for every field, and the
// failure surfaces later as an opaque Firebase error on the first read. Say so
// here instead. CI builds with no .env at all on purpose (see the workflow), so
// this is what a production build missing .env.production looks like.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  throw new Error(
    'Firebase is not configured: VITE_FIREBASE_* variables are missing from this build.'
  )
}

const app = initializeApp(firebaseConfig)

/**
 * With VITE_TAB_SCOPED_AUTH on, the session lives in sessionStorage, which is
 * scoped to one tab — so two people can be signed in beside each other in two
 * tabs of the same window. Without it, this is `getAuth` and the SDK's default
 * shared-across-tabs persistence, unchanged.
 *
 * initializeAuth rather than getAuth + setPersistence: getAuth starts restoring
 * from IndexedDB immediately, so a setPersistence afterwards would migrate the
 * shared session into the tab — the leak we are removing. initializeAuth never
 * reads the shared stores at all.
 *
 * No popupRedirectResolver is passed because sign-in here is email/password only
 * (src/lib/auth.ts). A popup flow added later must pass
 * browserPopupRedirectResolver, or it will fail to open.
 */
function createAuth(firebaseApp: FirebaseApp): Auth {
  if (!tabScopedAuthEnabled(import.meta.env)) return getAuth(firebaseApp)
  try {
    return initializeAuth(firebaseApp, { persistence: browserSessionPersistence })
  } catch {
    // Vite re-executes this module on hot reload, and a second initializeAuth
    // throws auth/already-initialized. The instance from the first pass is the
    // one we want; getAuth returns it with its persistence intact.
    return getAuth(firebaseApp)
  }
}

export const auth = createAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, 'localhost', 8080)
  connectStorageEmulator(storage, 'localhost', 9199)
  connectFunctionsEmulator(functions, 'localhost', 5001)
}
