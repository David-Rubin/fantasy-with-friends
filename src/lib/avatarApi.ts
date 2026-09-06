import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { deleteField, doc, updateDoc } from 'firebase/firestore'
import { db, storage } from './firebase'
import { avatarFileProblem } from './avatarFile'
import type { PhotoCrop } from './photoCrop'

/**
 * The thin writer beside src/lib/avatarFile.ts, which decides.
 *
 * One fixed object per person, so uploading again replaces the picture rather
 * than leaving the old one orphaned in the bucket. Overwriting mints a fresh
 * download token, so the URL changes and no cache serves the previous image.
 *
 * The URL goes on users/{uid} because that is what the app already reads to
 * draw someone — the header takes it straight from the profile it subscribes
 * to, so the new picture appears without a reload.
 */
export async function uploadAvatar(uid: string, file: File, crop?: PhotoCrop): Promise<string> {
  const problem = avatarFileProblem(file)
  // Belt and braces: callers validate to show a message on the right control,
  // and the storage rule refuses anyway. This stops a caller that forgot.
  if (problem) throw new Error(`avatar/${problem}`)

  const object = ref(storage, `avatars/${uid}/avatar`)
  await uploadBytes(object, file, { contentType: file.type })
  const photoUrl = await getDownloadURL(object)
  // The crop belongs to the picture, so the two are written together: a new
  // photo landing without its crop would be framed by the last one's, and the
  // face would be somewhere else entirely. No crop clears the old one for the
  // same reason — see photoCrop.readCrop for why absent is a legitimate value.
  await updateDoc(doc(db, 'users', uid), { photoUrl, photoCrop: crop ?? deleteField() })
  return photoUrl
}

/**
 * Move the crop on the picture that is already there.
 *
 * A separate write from the upload because re-framing a photo you uploaded last
 * month should not mean finding the file again.
 */
export async function setAvatarCrop(uid: string, crop: PhotoCrop): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { photoCrop: crop })
}

/** Go back to the lettered circle. The stored object is left to be overwritten. */
export async function removeAvatar(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { photoUrl: '', photoCrop: deleteField() })
}

/** Rename yourself. The header follows, since it subscribes to this document. */
export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName })
}
