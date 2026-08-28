/**
 * A per-tab note that somebody has been signed in here.
 *
 * sessionStorage is scoped to a single tab and survives a reload, which is
 * exactly the span "this browser session, in this tab" means. It is what lets
 * the login page tell a genuine shared link — opened in a tab nobody has signed
 * in to — from the page the last person happened to be looking at.
 *
 * Deliberately sticky: signing out does not clear it, because remembering that
 * someone was here is the whole point.
 */

const KEY = 'fwf.tabHasHostedSignIn'

export function markTabSignedIn(): void {
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {
    // Storage can be unavailable (private mode, a locked-down browser). Losing
    // the note only means a deep link is honoured that we would have dropped —
    // a worse landing page, never a failed login.
  }
}

export function tabHasHostedSignIn(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}
