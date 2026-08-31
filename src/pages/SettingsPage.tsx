import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { AccountUserInfo } from '../components/AccountUserInfo'
import { AccountPassword } from '../components/AccountPassword'
import { settingsTrail } from '../lib/breadcrumbs'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'

const TABS = ['userInfo', 'password'] as const
type Tab = (typeof TABS)[number]

/**
 * Your own account, in two views behind a side nav.
 *
 * The view is in the URL rather than component state, matching
 * SeasonDetailPage: it makes the password form linkable, and Back returns to
 * the view you came from instead of the page's default. An unknown or absent
 * value falls back to User Info rather than showing nothing.
 */
export function SettingsPage() {
  const { user, userDoc } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'userInfo'
  const setTab = (next: Tab) =>
    setSearchParams(next === 'userInfo' ? {} : { tab: next }, { replace: true })

  const tabs: { key: Tab; label: string }[] = [
    { key: 'userInfo', label: t('settings.tabs.userInfo') },
    { key: 'password', label: t('settings.tabs.password') },
  ]

  return (
    <Layout breadcrumbs={settingsTrail()}>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('settings.title')}</h1>

      <div className="flex flex-col gap-6 sm:flex-row sm:gap-10">
        {/* A row on a phone, a column from sm up: a 160px rail beside a form
            leaves too little for the form on a narrow screen. */}
        <nav
          role="tablist"
          aria-orientation="vertical"
          className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-200 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r sm:pr-2"
        >
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={[
                'cursor-pointer whitespace-nowrap rounded-md px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                tab === key
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {/* The profile arrives a beat after auth does, so this renders once
              there is something to show rather than flashing an empty form. */}
          {user && userDoc && tab === 'userInfo' && (
            <AccountUserInfo
              uid={user.uid}
              displayName={userDoc.displayName}
              email={userDoc.email}
              photoUrl={userDoc.photoUrl}
            />
          )}
          {tab === 'password' && <AccountPassword />}
        </div>
      </div>
    </Layout>
  )
}
