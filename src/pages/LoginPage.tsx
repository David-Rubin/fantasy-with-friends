import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { loginWithEmail } from '../lib/auth'
import { t } from '../lib/i18n'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'

  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // Auth is disabled for now — the PIN above is not checked. See loginAsUser
      // in functions/src/index.ts for the real (temporary) login logic.
      await loginWithEmail(email.trim())
      navigate(redirect)
    } catch {
      setError(t('auth.userNotFound'))
    } finally {
      setLoading(false)
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
            error={error || undefined}
          />
          <Input
            label={t('auth.pin')}
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
            hint={t('auth.pinOptionalHint')}
          />
          <Button type="submit" loading={loading} className="w-full mt-2">
            {loading ? t('auth.loggingIn') : t('auth.logIn')}
          </Button>
        </form>

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
