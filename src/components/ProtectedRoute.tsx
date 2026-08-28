import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { loginPathFor } from '../lib/loginRedirect'
import { tabHasHostedSignIn } from '../lib/tabSession'
import { t } from '../lib/i18n'

interface ProtectedRouteProps {
  children: ReactNode
  /**
   * Gate on the app-level superadmin role. This only hides the page; the data
   * behind it is gated server-side, so bypassing this reveals nothing.
   */
  requireSuperadmin?: boolean
}

export function ProtectedRoute({ children, requireSuperadmin }: ProtectedRouteProps) {
  const { user, isSuperadmin, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  if (!user) {
    // The path only travels to the login form in a tab nobody has signed in to
    // yet — otherwise it is the last person's page. See src/lib/loginRedirect.ts.
    return (
      <Navigate
        to={loginPathFor({
          pathname: location.pathname,
          search: location.search,
          tabHasHostedSignIn: tabHasHostedSignIn(),
        })}
        replace
      />
    )
  }

  // Send them somewhere they can actually use rather than showing a wall.
  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
