import { t } from './i18n'

/**
 * What the browser tab says.
 *
 * The signed-in name is there only when sessions are tab-scoped
 * (see src/lib/authPersistence.ts). With two accounts open side by side the tab
 * strip is the only place that says which is which without switching to it;
 * with one session shared by every tab, every tab would repeat the same name,
 * which crowds out the part of the title that distinguishes anything.
 *
 * Kept free of Firebase (see src/lib/seasonDetails.ts for the same reasoning) —
 * the format is worth asserting on, and nothing here needs credentials.
 */
interface TitleInput {
  displayName?: string | null
  /** Whether sessions are scoped to a tab — the VITE_TAB_SCOPED_AUTH flag. */
  tabScopedAuth: boolean
}

export function documentTitle({ displayName, tabScopedAuth }: TitleInput): string {
  const app = t('nav.appName')
  const user = displayName?.trim()
  // Signed out, or signed in before the profile arrives: the bare app name
  // reads as a page still loading, where a dangling separator reads as a bug.
  if (!tabScopedAuth || !user) return app
  return t('nav.tabTitle', { app, user })
}
