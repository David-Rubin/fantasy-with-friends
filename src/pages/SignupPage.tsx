import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { signUp } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import { t } from '../lib/i18n'

export function SignupPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [devPin, setDevPin] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setDevPin('')
    setLoading(true)
    try {
      const inviteCode = sessionStorage.getItem('pendingInviteCode') ?? undefined
      const result = await signUp(displayName.trim(), email.trim().toLowerCase(), inviteCode)
      if (inviteCode) sessionStorage.removeItem('pendingInviteCode')
      trackEvent('sign_up')
      if (result.devPin) {
        setDevPin(result.devPin)
        setLoading(false)
        return // Stay on page to show PIN
      }
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('email-already-in-use')) {
        setError('An account with that email already exists.')
      } else {
        setError(t('common.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('auth.signUp')}</h1>

        {devPin && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
              Dev mode — your PIN
            </p>
            <p className="text-3xl font-mono font-bold text-amber-900 tracking-widest">{devPin}</p>
            <p className="text-xs text-amber-600 mt-2">
              Copy this PIN, then{' '}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => navigate('/login')}
              >
                log in
              </button>
              .
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label={t('auth.displayName')}
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            autoComplete="name"
            autoFocus
          />
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            error={error || undefined}
          />
          <Button type="submit" loading={loading} className="w-full mt-2">
            {loading ? t('auth.creatingAccount') : t('auth.signUp')}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-gray-500">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link
            to="/login"
            className="text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {t('auth.logIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
