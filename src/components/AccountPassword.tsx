import { useState } from 'react'
import { Input } from './Input'
import { Button } from './Button'
import { changePassword } from '../lib/auth'
import { t } from '../lib/i18n'

/**
 * Change the password you already have.
 *
 * The confirm field is here and not on the sign-up form on purpose. A typo at
 * sign-up costs you a reset email; a typo here would change the password of an
 * account you are currently inside, and leave you unable to get back into it.
 */
export function AccountPassword() {
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
    <section className="max-w-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-900">{t('settings.changePassword')}</h2>

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
    </section>
  )
}
