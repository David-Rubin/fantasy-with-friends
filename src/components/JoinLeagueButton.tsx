import { useState } from 'react'
import { Button } from './Button'
import { useAuth } from '../contexts/AuthContext'
import { requestToJoin } from '../lib/joinRequests'
import type { JoinRequestStatus } from '../lib/types'
import { t } from '../lib/i18n'

interface JoinLeagueButtonProps {
  leagueId: string
  /** This user's latest request for this league, or null if they never asked. */
  status: JoinRequestStatus | null
  variant?: 'primary' | 'secondary'
  className?: string
}

/**
 * Ask to join a league. Shown on the dashboard and on a league page the viewer
 * has not joined; both read the same request status, so the button says the same
 * thing in both places.
 *
 * A rejected request is not a dead end — the button returns to "Join" and the
 * user may ask again.
 */
export function JoinLeagueButton({
  leagueId,
  status,
  variant = 'primary',
  className,
}: JoinLeagueButtonProps) {
  const { user, userDoc } = useAuth()
  const [requesting, setRequesting] = useState(false)
  const [failed, setFailed] = useState(false)

  if (status === 'pending') {
    return (
      <Button variant="secondary" disabled className={className}>
        {t('league.requestPending')}
      </Button>
    )
  }

  async function handleRequest() {
    if (!user || !userDoc) return
    setRequesting(true)
    setFailed(false)
    try {
      await requestToJoin(leagueId, user.uid, userDoc.displayName, userDoc.photoUrl)
    } catch (error) {
      // Without this the button would spin down and look as though it worked.
      console.error('Failed to request to join league', error)
      setFailed(true)
    } finally {
      setRequesting(false)
    }
  }

  return (
    <div className={className}>
      <Button variant={variant} loading={requesting} onClick={handleRequest}>
        {requesting ? t('league.requesting') : t('league.join')}
      </Button>
      {failed && <p className="mt-1 text-xs text-red-600">{t('common.error')}</p>}
    </div>
  )
}
