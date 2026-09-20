import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation, useParams } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { DashboardPage } from './pages/DashboardPage'
import { LeagueDetailPage } from './pages/LeagueDetailPage'
import { SeasonDetailPage } from './pages/SeasonDetailPage'
import { DraftRoomPage } from './pages/DraftRoomPage'
import { EpisodeScoringPage } from './pages/EpisodeScoringPage'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { SettingsPage } from './pages/SettingsPage'

/**
 * A different episode is a different card, so it gets a different component.
 *
 * The page holds a form — ticks, eliminations, whether an admin has taken a
 * suggestion on — and React keeps all of that when only a route parameter
 * changes. Moving between episodes therefore carried one episode's half-filled
 * card into the next, which an admin could then submit against the wrong
 * episode. Keying on the number remounts it instead, and every piece of that
 * state starts empty because it is genuinely new.
 */
function ScoringPageForEpisode() {
  const { episodeNumber } = useParams()
  return <EpisodeScoringPage key={episodeNumber} />
}

/**
 * Start each page at the top.
 *
 * A browser keeps the scroll position across a client-side navigation, so
 * arriving somewhere new part-way down the page was the norm: signing in from
 * a scrolled login form opened the dashboard mid-page, and every link out of a
 * long season page did the same.
 *
 * Keyed on the path alone, so the season page's tabs — which are query
 * parameters — leave the reader where they were rather than throwing them back
 * to the top for what is really a change on the same page.
 *
 * This is the scroll, not the zoom. iOS carries a page's zoom from page to
 * page and no script can put it back; what stops that is fields big enough not
 * to trigger it in the first place. See src/components/Input.tsx.
 */
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ScrollToTopOnNavigate />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leagues/:leagueId"
            element={
              <ProtectedRoute>
                <LeagueDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leagues/:leagueId/seasons/:seasonId"
            element={
              <ProtectedRoute>
                <SeasonDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leagues/:leagueId/seasons/:seasonId/draft"
            element={
              <ProtectedRoute>
                <DraftRoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leagues/:leagueId/seasons/:seasonId/score/:episodeNumber"
            element={
              <ProtectedRoute>
                <ScoringPageForEpisode />
              </ProtectedRoute>
            }
          />

          {/* App-level, not scoped to a league */}
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute requireSuperadmin>
                <AdminUsersPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
