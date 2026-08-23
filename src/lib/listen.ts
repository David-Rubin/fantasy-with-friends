import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type FirestoreError,
  type Query,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore'

/**
 * `onSnapshot` wrappers that require a failure path.
 *
 * Firestore discards listener errors when no error callback is supplied, so a
 * denied read surfaces as a panel that never fills — no exception, nothing in
 * the console. That is how a missing security rule stayed invisible long enough
 * to look like a loading bug. Route every listener through here so a rule
 * problem announces itself.
 *
 * `label` identifies the listener in the console, e.g. 'league members'.
 */

/**
 * Always logs. `onError` is for callers that must also react — clearing a
 * loading flag, say — so a failed listener can't leave the UI mid-state.
 */
function logFailure(label: string, onError?: (error: FirestoreError) => void) {
  return (error: FirestoreError) => {
    console.error(`[listen: ${label}] snapshot failed`, error)
    onError?.(error)
  }
}

/** Listen to a single document. */
export function listenDoc(
  ref: DocumentReference,
  label: string,
  next: (snap: DocumentSnapshot) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(ref, next, logFailure(label, onError))
}

/** Listen to a collection or query. */
export function listenQuery(
  q: Query,
  label: string,
  next: (snap: QuerySnapshot) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(q, next, logFailure(label, onError))
}

/**
 * Wrap an async snapshot handler so a rejection inside it cannot escape.
 *
 * The error callback above only catches listener failures — it does not catch a
 * promise rejection thrown inside the success handler. An awaited read that gets
 * denied mid-callback would otherwise abort the handler silently, leaving state
 * unset and any loading flag stuck on.
 */
export function guarded<S>(label: string, handler: (snap: S) => Promise<void>) {
  return (snap: S) => {
    handler(snap).catch((error) => {
      console.error(`[listen: ${label}] handler failed`, error)
    })
  }
}
