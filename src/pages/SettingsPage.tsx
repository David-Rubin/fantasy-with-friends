import { useState } from 'react'
import { Layout } from '../components/Layout'
import { Input } from '../components/Input'
import { Button } from '../components/Button'
import { settingsTrail } from '../lib/breadcrumbs'
import { useAuth } from '../contexts/AuthContext'
import { changePassword } from '../lib/auth'
import { t } from '../lib/i18n'

/**
 * Your own account. One job for now: changing your password.
 *
 * The confirm field is here and not on the sign-up form on purpose. A typo at
 * sign-up costs you a reset email; a typo here would change the password of an
 * account you are currently inside, and leave you unable to get back into it.
 */
export function SettingsPage() {
  const { userDoc } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [currentError, setCurrentError] = useState('')
  const [nextError, setNextError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCurrentError('')
    setNextError('')
    setConfirmError('')
    setDone(false)

    if (next !== confirm) {
      setConfirmError(t('settings.passwordsDoNotMatch'))
      return
    }

    setSaving(true)
    try {
      await changePassword(current, next)
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      const code = (err as { code?: string }).code ?? ''
      if (msg === 'auth/wrong-password') {
        setCurrentError(t('settings.wrongCurrentPassword'))
      } else if (msg === 'auth/account-locked') {
        setCurrentError(t('auth.accountLocked'))
      } else if (code === 'auth/weak-password') {
        setNextError(t('auth.weakPassword'))
      } else {
        console.error('Could not change the password', err)
        setNextError(t('common.error'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout breadcrumbs={settingsTrail()}>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{t('settings.title')}</h1>

      <div className="max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        {userDoc && (
          <p className="mb-6 text-sm text-gray-500">
            {t('settings.signedInAs')}{' '}
            <span className="font-medium text-gray-900">{userDoc.displayName}</span> ·{' '}
            {userDoc.email}
          </p>
        )}

        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t('settings.changePassword')}
        </h2>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <Input
            label={t('settings.currentPassword')}
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            required
            autoComplete="current-password"
            error={currentError || undefined}
          />
          <Input
            label={t('settings.newPassword')}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            hint={t('auth.newPasswordHint')}
            error={nextError || undefined}
          />
          <Input
            label={t('settings.confirmPassword')}
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            error={confirmError || undefined}
          />
          <Button type="submit" loading={saving} className="mt-2">
            {saving ? t('settings.saving') : t('settings.changePassword')}
          </Button>
        </form>

        {done && (
          <p role="status" className="mt-4 text-sm text-green-700">
            {t('settings.passwordChanged')}
          </p>
        )}
      </div>
    </Layout>
  )
}
