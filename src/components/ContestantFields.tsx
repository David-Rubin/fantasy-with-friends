import { useState } from 'react'
import { Input, Textarea } from './Input'
import { BIO_MAX_LENGTH, normaliseBio } from '../lib/contestants'
import { t } from '../lib/i18n'

export interface ContestantFormValues {
  name: string
  photoUrl: string
  bio: string
}

export const emptyContestantForm: ContestantFormValues = { name: '', photoUrl: '', bio: '' }

/**
 * The fields describing a contestant, shared by the add form in the setup panel
 * and the dialog that edits one.
 *
 * Shared rather than written twice so the two cannot drift: a limit or a hint
 * added to one of them is the sort of thing that quietly goes missing from the
 * other, and then a bio that will not save in one place saves in the other.
 */
export function ContestantFields({
  values,
  onChange,
  autoFocus,
}: {
  values: ContestantFormValues
  onChange: (next: ContestantFormValues) => void
  autoFocus?: boolean
}) {
  // Seeded from the current value so editing an existing contestant shows the
  // picture it already has, without waiting for the field to be touched.
  const [previewUrl, setPreviewUrl] = useState(values.photoUrl.trim())
  const [previewFailed, setPreviewFailed] = useState(false)

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          label={t('contestant.name')}
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          required
          autoFocus={autoFocus}
          className="flex-1"
        />
        <Input
          label={t('contestant.photo')}
          value={values.photoUrl}
          onChange={(e) => onChange({ ...values, photoUrl: e.target.value })}
          // On blur rather than on every keystroke: a URL is not a valid image
          // until it is finished being typed, so previewing as you go would
          // request a string of broken addresses and flash an error under the
          // field the whole time you were filling it in.
          onBlur={(e) => {
            setPreviewUrl(e.target.value.trim())
            setPreviewFailed(false)
          }}
          placeholder="https://…"
          className="flex-1"
        />
      </div>

      {/* The photo is a link to someone else's server, so the only way to know
          it is the right picture — or a picture at all — is to fetch it and
          look. Shown at a size worth checking rather than the 32px the roster
          uses, since confirming a face is the whole point of it being here. */}
      {previewUrl && (
        <div className="flex items-center gap-3">
          {previewFailed ? (
            <p className="text-sm text-red-600">{t('contestant.photoFailed')}</p>
          ) : (
            <>
              <img
                src={previewUrl}
                alt={t('contestant.photoPreviewAlt')}
                onError={() => setPreviewFailed(true)}
                className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover"
              />
              <p className="text-xs text-gray-500">{t('contestant.photoPreviewHint')}</p>
            </>
          )}
        </div>
      )}
      {/* Its own line rather than a third column: a bio runs to a paragraph,
          and squeezed beside two single-line fields it would be a box too small
          to write in. */}
      <Textarea
        label={t('contestant.bioOptional')}
        value={values.bio}
        onChange={(e) => onChange({ ...values, bio: e.target.value })}
        maxLength={BIO_MAX_LENGTH}
      />
      {/* A silent cap reads as a broken keyboard, so say where the limit is
          rather than just refusing the next character. Counts what will be
          stored, not what was typed. */}
      <span className="text-xs text-gray-400">
        {t('contestant.bioCount', {
          n: normaliseBio(values.bio).length,
          max: BIO_MAX_LENGTH,
        })}
      </span>
    </>
  )
}
