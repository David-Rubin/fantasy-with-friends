import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { doc, updateDoc } from 'firebase/firestore'
import { db, storage } from './firebase'
import { avatarFileProblem } from './avatarFile'

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
export async function uploadAvatar(uid: string, file: File): Promise<string> {
  const problem = avatarFileProblem(file)
  // Belt and braces: callers validate to show a message on the right control,
  // and the storage rule refuses anyway. This stops a caller that forgot.
  if (problem) throw new Error(`avatar/${problem}`)

  const object = ref(storage, `avatars/${uid}/avatar`)
  await uploadBytes(object, file, { contentType: file.type })
  const photoUrl = await getDownloadURL(object)
  await updateDoc(doc(db, 'users', uid), { photoUrl })
  return photoUrl
}

/** Go back to the lettered circle. The stored object is left to be overwritten. */
export async function removeAvatar(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { photoUrl: '' })
}

/** Rename yourself. The header follows, since it subscribes to this document. */
export async function updateDisplayName(uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { displayName })
}
