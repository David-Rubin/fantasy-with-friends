import { useRef, useState } from 'react'
import { UserAvatar } from './UserAvatar'
import { Button } from './Button'
import { Input } from './Input'
import { uploadAvatar, removeAvatar, updateDisplayName } from '../lib/avatarApi'
import { avatarFileProblem, AVATAR_ACCEPT, MAX_AVATAR_MB } from '../lib/avatarFile'
import { t } from '../lib/i18n'

interface AccountUserInfoProps {
  uid: string
  displayName: string
  email: string
  photoUrl?: string
}

/**
 * Who you are: picture, name, and the address you log in with.
 *
 * Nothing here holds the saved values in state. Every field renders from the
 * profile the page was given, which AuthContext subscribes to — so a write
 * lands in the header and here at the same moment, and there is no second copy
 * to drift out of step with Firestore.
 */
export function AccountUserInfo({ uid, displayName, email, photoUrl }: AccountUserInfoProps) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [photoNotice, setPhotoNotice] = useState('')

  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(displayName)
  const [nameError, setNameError] = useState('')
  const [nameNotice, setNameNotice] = useState('')
  const [savingName, setSavingName] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear immediately, so choosing the same file twice fires change again.
    e.target.value = ''
    if (!file) return

    setPhotoError('')
    setPhotoNotice('')

    const problem = avatarFileProblem(file)
    if (problem) {
      setPhotoError(
        t(problem === 'type' ? 'settings.userInfo.wrongType' : 'settings.userInfo.tooBig', {
          max: MAX_AVATAR_MB,
        })
      )
      return
    }

    setBusy(true)
    try {
      await uploadAvatar(uid, file)
      setPhotoNotice(t('settings.userInfo.photoSaved'))
    } catch (err) {
      console.error('Could not upload the profile picture', err)
      setPhotoError(t('settings.userInfo.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setPhotoError('')
    setPhotoNotice('')
    setBusy(true)
    try {
      await removeAvatar(uid)
      setPhotoNotice(t('settings.userInfo.photoRemoved'))
    } catch (err) {
      console.error('Could not remove the profile picture', err)
      setPhotoError(t('settings.userInfo.uploadFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    const next = draftName.trim()
    setNameError('')
    setNameNotice('')
    if (!next) {
      setNameError(t('settings.userInfo.nameRequired'))
      return
    }
    if (next === displayName) {
      setEditingName(false)
      return
    }

    setSavingName(true)
    try {
      await updateDisplayName(uid, next)
      setEditingName(false)
      setNameNotice(t('settings.userInfo.nameSaved'))
    } catch (err) {
      console.error('Could not save the display name', err)
      setNameError(t('settings.userInfo.nameFailed'))
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t('settings.userInfo.photo')}
        </h2>
        <div className="flex items-center gap-5">
          <UserAvatar displayName={displayName} photoUrl={photoUrl} size="lg" />
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                loading={busy}
                onClick={() => fileInput.current?.click()}
              >
                {busy
                  ? t('settings.userInfo.uploading')
                  : photoUrl
                    ? t('settings.userInfo.replace')
                    : t('settings.userInfo.upload')}
              </Button>
              {photoUrl && (
                <Button type="button" variant="ghost" disabled={busy} onClick={handleRemove}>
                  {t('settings.userInfo.remove')}
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-500">
              {t('settings.userInfo.photoHint', { max: MAX_AVATAR_MB })}
            </p>
          </div>
        </div>
        {/* Hidden because a bare file input cannot be styled to match the rest
            of the app; the button above is its label. */}
        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_ACCEPT}
          onChange={handleFile}
          className="hidden"
          aria-label={t('settings.userInfo.upload')}
        />
        {photoError && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {photoError}
          </p>
        )}
        {photoNotice && (
          <p role="status" className="mt-3 text-sm text-green-700">
            {photoNotice}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t('settings.userInfo.displayName')}
        </h2>
        {editingName ? (
          <form onSubmit={handleSaveName} noValidate className="flex max-w-sm flex-col gap-3">
            <Input
              label={t('settings.userInfo.displayName')}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              required
              autoFocus
              error={nameError || undefined}
            />
            <div className="flex gap-2">
              <Button type="submit" loading={savingName}>
                {savingName ? t('settings.saving') : t('settings.userInfo.saveName')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={savingName}
                onClick={() => {
                  setDraftName(displayName)
                  setNameError('')
                  setEditingName(false)
                }}
              >
                {t('settings.userInfo.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-900">{displayName}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setDraftName(displayName)
                setNameNotice('')
                setEditingName(true)
              }}
            >
              {t('settings.userInfo.editName')}
            </Button>
          </div>
        )}
        {nameNotice && !editingName && (
          <p role="status" className="mt-3 text-sm text-green-700">
            {nameNotice}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {t('settings.userInfo.email')}
        </h2>
        <p className="text-sm text-gray-900">{email}</p>
        <p className="mt-1 text-xs text-gray-500">{t('settings.userInfo.emailHint')}</p>
      </section>
    </div>
  )
}
