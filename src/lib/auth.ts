import {
  signInWithEmailAndPassword,
  signInWithCustomToken,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from './firebase'

const IS_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true'

// FUTURE IMPROVEMENT: Move brute-force lockout to a `loginWithPin` Cloud Function.
// The client calls a callable function; the function checks /users/{uid}.loginAttempts
// via Admin SDK (bypasses security rules), enforces the 5-attempt / 15-min lockout,
// then signs the user in server-side and returns a custom token. This removes the need
// for the client to ever read the users collection unauthenticated.
// See: https://firebase.google.com/docs/auth/admin/create-custom-tokens

// AUTH DISABLED (temporary): loginAsUser trusts any caller and skips PIN/password
// verification entirely — see functions/src/index.ts for the real logic and a note
// on re-enabling loginWithPin below.

const signUpFn = httpsCallable<
  { displayName: string; email: string; inviteCode?: string },
  { uid: string }
>(functions, 'signUpUser')

const loginAsUserFn = httpsCallable<{ email: string }, { token: string }>(functions, 'loginAsUser')

const resendPinFn = httpsCallable<{ email: string }, void>(functions, 'resendPin')

export async function signUp(
  displayName: string,
  email: string,
  inviteCode?: string
): Promise<{ devPin?: string }> {
  if (IS_EMULATOR) {
    // Dev-only: create user directly, skip Cloud Function + email
    const pin = String(Math.floor(100000 + Math.random() * 900000))
    const credential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), pin)
    await setDoc(doc(db, 'users', credential.user.uid), {
      displayName,
      email: email.toLowerCase(),
      createdAt: Date.now(),
      loginAttempts: 0,
      lockedUntil: null,
    })
    return { devPin: pin }
  }
  await signUpFn({ displayName, email, inviteCode })
  return {}
}

export async function loginWithEmail(email: string): Promise<void> {
  const { data } = await loginAsUserFn({ email: email.trim().toLowerCase() })
  await signInWithCustomToken(auth, data.token)
}

export async function loginWithPin(email: string, pin: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email.toLowerCase(), pin)
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new Error('auth/wrong-password')
    }
    if (code === 'auth/user-not-found') {
      throw new Error('auth/wrong-password') // Don't reveal whether email exists
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('auth/account-locked')
    }
    throw err
  }
}

export async function resendPin(email: string): Promise<void> {
  await resendPinFn({ email })
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}

export async function getUserDoc(uid: string) {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? { uid, ...snap.data() } : null
}
