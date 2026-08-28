/**
 * Whether a signed-in session belongs to one tab or to the whole browser.
 *
 * Firebase's default persistence is one slot per origin, shared by every tab,
 * and the SDK broadcasts a sign-in to all of them — so two people cannot be
 * signed in side by side. Scoping the session to a tab makes that possible,
 * which is wanted for testing with several accounts at once.
 *
 * It is a flag rather than a rewrite because it may want turning off again once
 * the app is live. Nothing persisted depends on the choice: the only difference
 * is which browser store holds the session token, so flipping it costs everyone
 * currently signed in one sign-out and nothing else.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts for the same reasoning)
 * so the default is worth asserting on — the risk in a flag like this is it
 * turning itself on somewhere nobody asked for it.
 */
export function tabScopedAuthEnabled(env: Record<string, unknown>): boolean {
  return env.VITE_TAB_SCOPED_AUTH === 'true'
}
