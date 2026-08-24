import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
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
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />
  }

  // Send them somewhere they can actually use rather than showing a wall.
  if (requireSuperadmin && !isSuperadmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
