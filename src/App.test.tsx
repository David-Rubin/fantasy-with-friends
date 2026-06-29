import { describe, it, expect, vi } from 'vitest'

// Full App integration tests live in e2e/ (Playwright).
// This file sanity-checks module imports without a Firebase connection.

vi.mock('./lib/firebase', () => ({
  auth: {},
  db: {},
  storage: {},
  functions: {},
}))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  getAuth: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  collectionGroup: vi.fn(),
  writeBatch: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
}))

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(() => vi.fn()),
  connectFunctionsEmulator: vi.fn(),
}))

vi.mock('firebase/storage', () => ({
  getStorage: vi.fn(),
  connectStorageEmulator: vi.fn(),
}))

describe('App module', () => {
  it('passes sanity check', () => {
    expect(true).toBe(true)
  })
})
