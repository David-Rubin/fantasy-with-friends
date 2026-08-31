import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { signOut } from '../lib/auth'
import { t } from '../lib/i18n'
import { Breadcrumbs } from './Breadcrumbs'
import { UserMenu } from './UserMenu'
import type { BreadcrumbItem } from '../lib/breadcrumbs'

interface LayoutProps {
  children: ReactNode
  /**
   * The trail for this page. Rendered here rather than by each page so every
   * page puts it in the same place with the same spacing — the one thing a
   * breadcrumb has to do is be where the reader expects it.
   */
  breadcrumbs?: BreadcrumbItem[]
}

export function Layout({ children, breadcrumbs }: LayoutProps) {
  const { userDoc, isSuperadmin } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            to="/dashboard"
            className="text-lg font-bold text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
          >
            {t('nav.appName')}
          </Link>
          <div className="flex items-center gap-4">
            {userDoc && <UserMenu displayName={userDoc.displayName} isSuperadmin={isSuperadmin} />}
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded"
            >
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
        {children}
      </main>
    </div>
  )
}
