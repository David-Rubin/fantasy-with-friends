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
          placeholder="https://…"
          className="flex-1"
        />
      </div>
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
