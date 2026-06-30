import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from 'firebase/auth'
import { onAuthChanged, getUserDoc } from '../lib/auth'

interface UserDoc {
  uid: string
  displayName: string
  email: string
}

interface AuthContextValue {
  user: User | null
  userDoc: UserDoc | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ user: null, userDoc: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthChanged(async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const doc = await getUserDoc(firebaseUser.uid)
        setUserDoc(doc as UserDoc | null)
      } else {
        setUserDoc(null)
      }
      setLoading(false)
    })
  }, [])

  return <AuthContext.Provider value={{ user, userDoc, loading }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
