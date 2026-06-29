import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { functions } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { t } from '../lib/i18n'

const validateInviteCode = httpsCallable<
  { code: string },
  { seasonId: string; leagueId: string; alreadyMember: boolean }
>(functions, 'validateInviteCode')

export function InvitePage() {
  const { code } = useParams<{ code: string }>()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')

  useEffect(() => {
    if (loading || !code) return

    if (!user) {
      // Store for post-auth redemption
      sessionStorage.setItem('pendingInviteCode', code)
      navigate('/signup')
      return
    }

    // User is logged in — redeem immediately
    validateInviteCode({ code })
      .then(({ data }) => {
        if (data.alreadyMember) {
          navigate(`/leagues/${data.leagueId}/seasons/${data.seasonId}`, {
            state: { notice: t('invite.alreadyMember') },
          })
        } else {
          navigate(`/leagues/${data.leagueId}/seasons/${data.seasonId}`)
        }
      })
      .catch(() => setError(t('invite.invalidCode')))
  }, [loading, user, code, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid invite</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <p className="text-gray-500">{t('invite.joining')}</p>
    </div>
  )
}
