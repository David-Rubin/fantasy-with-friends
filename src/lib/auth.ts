import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  reauthenticateWithCredential,
  updatePassword,
  EmailAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

// Passwords never touch this app's storage. Firebase Authentication holds a
// salted hash of them and nothing else here — no Firestore document carries a
// password, and no Cloud Function reads one. The `users/{uid}` write below is
// the whole of what we persist about an account.

export async function signUp(displayName: string, email: string, password: string): Promise<void> {
  const credential = await createUserWithEmailAndPassword(auth, email.toLowerCase(), password)
  await setDoc(doc(db, 'users', credential.user.uid), {
    displayName,
    email: email.toLowerCase(),
    createdAt: Date.now(),
  })
}

export async function logIn(email: string, password: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email.toLowerCase(), password)
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

/**
 * Send Firebase's own password-reset email.
 *
 * Resolves even when no account has that address. A form that reported "no such
 * user" would let anyone test whether a given person plays here, and the person
 * asking for a reset cannot act on the distinction anyway.
 */
export async function sendReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email.toLowerCase())
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return
    throw err
  }
}

/**
 * Change the signed-in user's password.
 *
 * Firebase refuses `updatePassword` on a session that has not signed in
 * recently, so the current password is re-checked first. That is also what stops
 * someone at an unattended logged-in browser taking the account over.
 */
export async function changePassword(current: string, next: string): Promise<void> {
  const user = auth.currentUser
  if (!user?.email) throw new Error('auth/no-user')

  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current))
  } catch (err: unknown) {
    const code = (err as { code?: string }).code ?? ''
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
      throw new Error('auth/wrong-password')
    }
    if (code === 'auth/too-many-requests') {
      throw new Error('auth/account-locked')
    }
    throw err
  }

  await updatePassword(user, next)
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}

export function onAuthChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback)
}
