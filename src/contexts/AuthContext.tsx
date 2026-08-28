import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { onAuthChanged, getUserDoc } from '../lib/auth'
import { markTabSignedIn } from '../lib/tabSession'
import { db } from '../lib/firebase'

interface UserDoc {
  uid: string
  displayName: string
  email: string
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

  useEffect(() => {
    return onAuthChanged(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        // Sticky for the life of the tab, and never cleared on sign-out: it is
        // what tells the login form that a captured path belongs to whoever was
        // here before.
        markTabSignedIn()
        const [profile, superadmin] = await Promise.all([
          getUserDoc(firebaseUser.uid),
          // Reading your own record is all the rule permits, and all the client
          // needs — it decides whether to offer the link. The directory itself
          // is gated server-side, so a forged flag here reveals nothing.
          getDoc(doc(db, 'superadmins', firebaseUser.uid))
            .then((snap) => snap.exists())
            .catch(() => false),
        ])
        setUserDoc(profile as UserDoc | null)
        setIsSuperadmin(superadmin)
      } else {
        setUserDoc(null)
        setIsSuperadmin(false)
      }
      setLoading(false)
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, userDoc, isSuperadmin, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
