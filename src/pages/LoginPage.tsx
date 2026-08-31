import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { logIn, sendReset } from '../lib/auth'
import { postLoginTarget } from '../lib/loginRedirect'
import { tabHasHostedSignIn } from '../lib/tabSession'
import { t } from '../lib/i18n'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // Resolved once, on mount. Signing in marks the tab as having hosted someone,
  // so reading this after the fact would answer for the person logging in now
  // rather than for whoever was here before them.
  const [target] = useState(() =>
    postLoginTarget({
      requested: searchParams.get('redirect'),
      tabHasHostedSignIn: tabHasHostedSignIn(),
    })
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await logIn(email.trim(), password)
      // replace, so Back from the page they land on does not return to a login
      // form they have already used.
      navigate(target, { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg === 'auth/account-locked' ? t('auth.accountLocked') : t('auth.wrongPassword'))
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    setError('')
    setResetting(true)
    try {
      await sendReset(email.trim())
      setResetSent(true)
    } catch {
      setError(t('common.error'))
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('auth.logIn')}</h1>
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label={t('auth.email')}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />
          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            error={error || undefined}
          />
          <Button type="submit" loading={loading} className="w-full mt-2">
            {loading ? t('auth.loggingIn') : t('auth.logIn')}
          </Button>
        </form>

        {resetSent ? (
          <p role="status" className="mt-4 text-center text-sm text-gray-600">
            {t('auth.resetSent')}
          </p>
        ) : (
          <p className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={handleReset}
              disabled={!email.trim() || resetting}
              className="text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {resetting ? t('auth.sendingReset') : t('auth.forgotPassword')}
            </button>
          </p>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          {t('auth.noAccount')}{' '}
          <Link
            to="/signup"
            className="text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {t('auth.signUp')}
          </Link>
        </p>
      </div>
    </div>
  )
}
