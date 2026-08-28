/**
 * Where the login bounce sends you, and where it sends you back to.
 *
 * A protected page you are not signed in for hands the login form the path you
 * were after, so a shared league link still lands where it pointed. That is
 * useful exactly once per tab: the moment a tab has hosted a signed-in user,
 * any path it captures is the *previous* person's page, and dropping the next
 * person there is at best confusing and at worst a page they cannot read. So a
 * tab that has hosted a sign-in stops carrying the path and everyone lands on
 * their own dashboard.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts) — the decision is worth
 * asserting on, the storage behind `tabHasHostedSignIn` is not.
 */

export const DASHBOARD = '/dashboard'
export const LOGIN = '/login'

interface LoginPathInput {
  /** The protected path that was asked for, from `useLocation()`. */
  pathname: string
  /** Its query string, leading `?` included, or empty. */
  search?: string
  tabHasHostedSignIn: boolean
}

export function loginPathFor({
  pathname,
  search = '',
  tabHasHostedSignIn,
}: LoginPathInput): string {
  if (tabHasHostedSignIn) return LOGIN
  // The search string travels with the path: capturing the pathname alone
  // silently drops the parameters of a deep link across the bounce.
  return `${LOGIN}?redirect=${encodeURIComponent(pathname + search)}`
}

interface PostLoginInput {
  /** The `redirect` query parameter, as read off the login page's URL. */
  requested: string | null
  tabHasHostedSignIn: boolean
}

export function postLoginTarget({ requested, tabHasHostedSignIn }: PostLoginInput): string {
  if (tabHasHostedSignIn) return DASHBOARD
  return isSameOriginPath(requested) ? requested : DASHBOARD
}

/**
 * Anyone can put anything in the query string, so only a path within this app
 * is followed. `//host` and `https://host` are both absolute to a browser, and
 * a backslash is normalised to a slash by some of them.
 */
function isSameOriginPath(value: string | null): value is string {
  if (!value) return false
  if (!value.startsWith('/')) return false
  return value[1] !== '/' && value[1] !== '\\'
}
