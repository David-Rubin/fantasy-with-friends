import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { doc } from 'firebase/firestore'
import { onAuthChanged } from '../lib/auth'
import { listenDoc } from '../lib/listen'
import { documentTitle } from '../lib/documentTitle'
import { tabScopedAuthEnabled } from '../lib/authPersistence'
import { markTabSignedIn } from '../lib/tabSession'
import { db } from '../lib/firebase'

const TAB_SCOPED_AUTH = tabScopedAuthEnabled(import.meta.env)

interface UserDoc {
  uid: string
  displayName: string
  email: string
  /** An uploaded profile picture. Absent until someone uploads one. */
  photoUrl?: string
}

interface AuthContextValue {
  user: User | null
  userDoc: UserDoc | null
  /** App-level role. Nothing to do with the per-league owner/admin/member roles. */
  isSuperadmin: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  userDoc: null,
  isSuperadmin: false,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [loading, setLoading] = useState(true)

  /**
   * Both documents are subscribed to rather than read once, because at the
   * moment auth reports a new user neither is guaranteed to exist yet.
   *
   * Signing up creates the Auth account first and writes `users/{uid}`
   * immediately afterwards, so a one-shot read raced that write and could leave
   * a new member looking at a header with no name on it. `superadmins/{uid}` is
   * worse: it is written by grantFirstUserSuperadmin, a trigger that runs a
   * second or so later, so a read taken now always missed it and the first
   * account on an environment had to reload before the app offered them the
   * directory. Listening means each one lands when it lands.
   */
  useEffect(() => {
    let stopUser: (() => void) | undefined
    let stopSuperadmin: (() => void) | undefined

    const stopListening = () => {
      stopUser?.()
      stopSuperadmin?.()
      stopUser = undefined
      stopSuperadmin = undefined
    }

    const unsubscribeAuth = onAuthChanged((firebaseUser) => {
      stopListening()
      setUser(firebaseUser)

      if (!firebaseUser) {
        setUserDoc(null)
        setIsSuperadmin(false)
        setLoading(false)
        return
      }

      // Sticky for the life of the tab, and never cleared on sign-out: it is
      // what tells the login form that a captured path belongs to whoever was
      // here before.
      markTabSignedIn()

      const { uid } = firebaseUser

      stopUser = listenDoc(
        doc(db, 'users', uid),
        'signed-in user profile',
        (snap) => {
          setUserDoc(snap.exists() ? ({ uid, ...snap.data() } as UserDoc) : null)
          // Released on the profile alone. The role decides whether one link is
          // drawn; waiting on it would hold the whole app behind a document
          // that is absent for everyone who is not a superadmin.
          setLoading(false)
        },
        // A denied read must still release the app. Without this the loading
        // flag stays on and every route sits behind a spinner that never ends —
        // the failure listen.ts exists to make impossible to write by accident.
        () => {
          setUserDoc(null)
          setLoading(false)
        }
      )

      // Reading your own record is all the rule permits, and all the client
      // needs — it decides whether to offer the link. The directory itself is
      // gated server-side, so a forged flag here reveals nothing.
      stopSuperadmin = listenDoc(
        doc(db, 'superadmins', uid),
        'superadmin role',
        (snap) => setIsSuperadmin(snap.exists()),
        () => setIsSuperadmin(false)
      )
    })

    return () => {
      stopListening()
      unsubscribeAuth()
    }
  }, [])

  // Named in the tab strip only when a session is per-tab: with two accounts
  // open side by side, this is what tells them apart without switching.
  useEffect(() => {
    document.title = documentTitle({
      displayName: userDoc?.displayName,
      tabScopedAuth: TAB_SCOPED_AUTH,
    })
  }, [userDoc])

  return (
    <AuthContext.Provider value={{ user, userDoc, isSuperadmin, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
