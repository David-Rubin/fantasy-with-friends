import { useState } from 'react'
import { PhotoCropDialog } from './PhotoCropDialog'
import { CONTESTANT_CROP_SHAPE, type PhotoCrop } from '../lib/photoCrop'
import { MAX_PHOTO_MB, photoFileProblem } from '../lib/photoFile'
import { useObjectUrl } from '../lib/useObjectUrl'
import { t } from '../lib/i18n'

/** A picture confirmed in the dialog. `file` is absent when only the crop moved. */
export interface ContestantPhotoChoice {
  crop: PhotoCrop
  file?: File
}

/**
 * Choosing and framing a contestant's photo.
 *
 * Everything about a contestant's picture that is the same wherever it is
 * edited: picking a file, refusing one that cannot be used, framing it before
 * it goes anywhere, and doing all of that on an empty frame as readily as on a
 * photo that is already there.
 *
 * What differs is what "save" means, so that is the caller's: the roster writes
 * the contestant document there and then, while the setup form holds the choice
 * until the contestant it belongs to has been saved — a contestant being added
 * has no document to upload against yet. Hence a choice handed back rather than
 * a write performed here.
 *
 * The file is framed before it is uploaded, as a profile picture is: sending it
 * first would put an unframed photo in front of the league for as long as it
 * took to position it.
 *
 * **Mount it only while it is open.** A file that has been chosen lives here
 * until the dialog is closed or saved — deliberately, so a save that fails can
 * be retried without finding the picture again — which means a dialog left
 * mounted carries that file to whatever it is opened on next. Left mounted
 * under the add-a-contestant form, it opened on the previous contestant's
 * photo rather than the file picker.
 */
export function ContestantPhotoDialog({
  open,
  onClose,
  photoUrl,
  photoCrop,
  onSave,
  saving = false,
  error = '',
}: {
  open: boolean
  onClose: () => void
  /** The photo as it stands — a stored address, or '' for a contestant with none. */
  photoUrl: string
  photoCrop?: PhotoCrop
  onSave: (choice: ContestantPhotoChoice) => void
  saving?: boolean
  /** A failure from whatever the caller does with the choice. */
  error?: string
}) {
  // A file chosen here and not yet handed back. Its blob URL is the hook's to
  // create and revoke — see useObjectUrl.
  const [picked, setPicked] = useState<File | null>(null)
  const pickedUrl = useObjectUrl(picked)
  const [pickError, setPickError] = useState('')

  function handlePick(file: File) {
    const problem = photoFileProblem(file)
    if (problem) {
      // Refused before anything is sent. The storage rule refuses it too; this
      // is so the message lands on the control that chose it.
      setPickError(
        t(problem === 'type' ? 'contestant.photoWrongType' : 'contestant.photoTooBig', {
          max: MAX_PHOTO_MB,
        })
      )
      return
    }
    setPickError('')
    setPicked(file)
  }

  function handleClose() {
    // A picture chosen and never confirmed is dropped, so reopening starts from
    // what is actually stored rather than from an abandoned choice.
    setPicked(null)
    setPickError('')
    onClose()
  }

  const src = pickedUrl ?? photoUrl

  return (
    <PhotoCropDialog
      // Keyed on the picture, so choosing a file mounts a fresh dialog: a new
      // photo is framed from the middle rather than under the zoom and offset
      // of the one it replaces.
      key={src}
      open={open}
      onClose={handleClose}
      onSave={(crop) => onSave({ crop, file: picked ?? undefined })}
      src={src}
      // A crop describes one picture. A newly chosen file has none yet, and the
      // stored one would frame a face that is not in it.
      crop={picked ? undefined : photoCrop}
      shape={CONTESTANT_CROP_SHAPE}
      title={t('photoCrop.titleContestant')}
      onPickFile={handlePick}
      pickLabel={t(src ? 'photoCrop.replacePhoto' : 'photoCrop.choosePhoto')}
      pickHint={t('contestant.photoHint', { max: MAX_PHOTO_MB })}
      saving={saving}
      error={pickError || error}
    />
  )
}
