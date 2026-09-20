import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { db, storage } from './firebase'
import { photoFileProblem } from './photoFile'
import type { PhotoCrop } from './photoCrop'

/**
 * Putting a picture on a contestant.
 *
 * The thin writer beside src/lib/photoFile.ts, which decides what may be
 * uploaded — the same module the avatar upload uses, because they are the same
 * kind of file with the same limits behind them.
 *
 * The object is keyed by the uploader and the contestant, which is what
 * storage.rules can express: a Storage rule cannot read Firestore, so it
 * cannot ask whether somebody administers this season. The write that needs
 * that authority is the one below, to the contestant document, and the
 * Firestore rules have allowed only a season's admin to make it all along.
 *
 * Re-photographing the same contestant overwrites the same object rather than
 * leaving the old file orphaned — as uploadAvatar does — and overwriting mints
 * a fresh download token, so no cache serves the previous picture.
 */
export async function uploadContestantPhoto(
  seasonId: string,
  contestantId: string,
  uploaderUid: string,
  file: File,
  crop?: PhotoCrop
): Promise<string> {
  const problem = photoFileProblem(file)
  // Belt and braces, as in uploadAvatar: the caller validates to put the
  // message on the right control, and the storage rule refuses anyway.
  if (problem) throw new Error(`contestantPhoto/${problem}`)

  const object = ref(storage, `contestantPhotos/${uploaderUid}/${seasonId}_${contestantId}`)
  await uploadBytes(object, file, { contentType: file.type })
  const photoUrl = await getDownloadURL(object)
  // Written together, because a crop belongs to one picture: a new photo
  // landing under the last one's crop would frame a face that is not there.
  // deleteField rather than an omitted key, so an unframed picture genuinely
  // loses the old crop. See uploadAvatar for the same pairing.
  await updateDoc(doc(db, 'seasons', seasonId, 'contestants', contestantId), {
    photoUrl,
    photoCrop: crop ?? deleteField(),
  })
  return photoUrl
}
