import { useState } from 'react'
import { Input, Textarea } from './Input'
import { Button } from './Button'
import { ContestantPhotoButton } from './ContestantPhotoButton'
import { ContestantPhotoDialog } from './ContestantPhotoDialog'
import { BIO_MAX_LENGTH, normaliseBio } from '../lib/contestants'
import { useObjectUrl } from '../lib/useObjectUrl'
import type { PhotoCrop } from '../lib/photoCrop'
import { t } from '../lib/i18n'

export interface ContestantFormValues {
  name: string
  /** The photo as stored. Empty for a contestant who has never had one. */
  photoUrl: string
  /**
   * A picture chosen from this machine and not yet uploaded.
   *
   * The form carries the file rather than uploading on the spot because a
   * contestant being added has no document to upload against yet: the object is
   * keyed by the contestant it belongs to. Whoever saves the form does the
   * upload — see uploadContestantPhoto.
   */
  photoFile?: File
  /** Which part of the photo to show. Absent until somebody frames it. */
  photoCrop?: PhotoCrop
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
 *
 * The photo is a file from this machine. It used to be an address typed into a
 * text field, which meant finding a picture already on the web and hoping it
 * stayed there — a cast assembled that way went blank a photo at a time as the
 * pages behind it moved. Addresses already stored still draw; they are simply
 * not how a new one is chosen.
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
  const [cropping, setCropping] = useState(false)
  // A chosen file is previewed from memory; a stored one from its address.
  const pickedUrl = useObjectUrl(values.photoFile)
  const previewUrl = pickedUrl ?? values.photoUrl

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          label={t('contestant.name')}
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          required
          autoFocus={autoFocus}
          className="flex-1"
        />
        {/* The photo shares a row with the name, bottom-aligned so it sits
            level with the input rather than the label above it. */}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">{t('contestant.photo')}</span>
          {/* The button first, then what it produced: the control is what the
              eye needs before there is a picture, and the preview reads as its
              result rather than as something to be got past. */}
          <div className="flex h-10 items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="!min-h-0 shrink-0 !px-3 !py-2 text-xs"
              onClick={() => setCropping(true)}
            >
              {t(previewUrl ? 'contestant.modifyPhoto' : 'photoCrop.choosePhoto')}
            </Button>
            {/* Only once there is one. An empty frame beside the button would
                be a second control saying the same thing, and the button is
                already the clearer of the two. */}
            {previewUrl && (
              <ContestantPhotoButton
                name={values.name || t('contestant.thisContestant')}
                photoUrl={previewUrl}
                photoCrop={values.photoCrop}
                onClick={() => setCropping(true)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mounted only while it is open, which is what drops the file chosen
          last time it was used. The dialog holds that file until it closes —
          so a dialog left mounted across two contestants opened on the
          previous one's photo instead of the file picker, and only came right
          after being cancelled once. See ContestantPhotoDialog. */}
      {cropping && (
        <ContestantPhotoDialog
          open
          onClose={() => setCropping(false)}
          photoUrl={previewUrl}
          photoCrop={values.photoCrop}
          // Kept on the form until it is saved. Nothing is uploaded from here:
          // see ContestantPhotoDialog for why the write is the caller's.
          onSave={({ crop, file }) => {
            onChange({ ...values, photoFile: file ?? values.photoFile, photoCrop: crop })
            setCropping(false)
          }}
        />
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
