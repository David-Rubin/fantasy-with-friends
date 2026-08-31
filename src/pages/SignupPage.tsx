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
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    setPasswordError('')
    setLoading(true)
    try {
      await signUp(displayName.trim(), email.trim().toLowerCase(), password)
      trackEvent('sign_up')
      // Creating the account signs you in, so there is nowhere to go but in.
      navigate('/dashboard')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? ''
      if (code === 'auth/email-already-in-use') {
        setEmailError(t('auth.emailInUse'))
      } else if (code === 'auth/weak-password') {
        setPasswordError(t('auth.weakPassword'))
      } else {
        setEmailError(t('common.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm border border-gray-200">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('auth.signUp')}</h1>

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
            error={emailError || undefined}
          />
          <Input
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            hint={t('auth.newPasswordHint')}
            error={passwordError || undefined}
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
