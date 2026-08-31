import { useEffect, useState } from 'react'
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
  const url = values.photoUrl.trim()

  // Seeded from the current value so editing an existing contestant shows the
  // picture it already has, without waiting for the field to be touched.
  const [debouncedUrl, setDebouncedUrl] = useState(url)
  // The address that failed, rather than a bare flag: keyed this way the error
  // clears itself the moment a different address is being shown, with nothing
  // to reset.
  const [failedUrl, setFailedUrl] = useState('')

  /**
   * Fetch a second after typing stops, rather than on every keystroke.
   *
   * A URL is not a valid image until it is finished being typed, so previewing
   * as you go would request a string of broken addresses and flash an error
   * under the field the whole time you were filling it in. The pause absorbs
   * that without making you leave the field to see the result.
   *
   * Clearing the field takes effect without the wait — there is nothing to
   * fetch, and a delay there would leave a picture up that no longer has an
   * address behind it.
   */
  useEffect(() => {
    if (url === debouncedUrl) return
    const timer = setTimeout(() => setDebouncedUrl(url), url === '' ? 0 : 1000)
    return () => clearTimeout(timer)
  }, [url, debouncedUrl])

  // Something typed that the preview has not caught up with yet.
  const loading = url !== '' && url !== debouncedUrl
  const previewUrl = debouncedUrl
  const previewFailed = failedUrl !== '' && failedUrl === previewUrl

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
        {/* The preview shares a row with the field it belongs to, bottom-aligned
            so it sits level with the input rather than the label above it. At
            the input's own height it costs the form no vertical space, and the
            field still takes the rest of the line at any width. */}
        <div className="flex flex-1 items-end gap-2">
          <Input
            label={t('contestant.photo')}
            value={values.photoUrl}
            onChange={(e) => onChange({ ...values, photoUrl: e.target.value })}
            placeholder="https://…"
            className="flex-1"
          />
          {loading ? (
            <span
              role="status"
              aria-label={t('contestant.photoLoading')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50"
            >
              <svg
                className="h-4 w-4 animate-spin text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </span>
          ) : (
            previewUrl &&
            !previewFailed && (
              <img
                src={previewUrl}
                alt={t('contestant.photoPreviewAlt')}
                onError={() => setFailedUrl(previewUrl)}
                className="h-10 w-10 shrink-0 rounded-lg border border-gray-200 object-cover"
              />
            )
          )}
        </div>
      </div>

      {/* Full width rather than beside the field: the message is a sentence and
          there is no room for it next to a 40px thumbnail. */}
      {!loading && previewUrl && previewFailed && (
        <p className="text-sm text-red-600">{t('contestant.photoFailed')}</p>
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
