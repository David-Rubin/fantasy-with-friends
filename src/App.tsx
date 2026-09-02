import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
