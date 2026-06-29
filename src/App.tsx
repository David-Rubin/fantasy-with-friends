import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { InvitePage } from './pages/InvitePage'
import { DashboardPage } from './pages/DashboardPage'
import { LeagueDetailPage } from './pages/LeagueDetailPage'
import { SeasonDetailPage } from './pages/SeasonDetailPage'
import { DraftRoomPage } from './pages/DraftRoomPage'
import { EpisodeScoringPage } from './pages/EpisodeScoringPage'
import { SeasonAwardsPage } from './pages/SeasonAwardsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/invite/:code" element={<InvitePage />} />

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
                <EpisodeScoringPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/leagues/:leagueId/seasons/:seasonId/awards"
            element={
              <ProtectedRoute>
                <SeasonAwardsPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
