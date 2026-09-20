/**
 * What may be uploaded as a photo — a profile picture, or a contestant's.
 *
 * The security rules in storage.rules enforce the same two limits — once for
 * each path that takes an upload — and those are what count — this exists so someone picking a 40MB RAW file is told
 * before it uploads, rather than after. The size is written down in both
 * places because a rules file cannot import one; src/lib/rulesLimits.test.ts
 * fails if they stop agreeing.
 *
 * PNG and JPEG only. "jpg" and "jpeg" are the same format and both arrive as
 * image/jpeg, so the type check covers all three extensions the form offers.
 *
 * Kept free of Firebase (see src/lib/documentTitle.ts for the same reasoning).
 */

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024

/**
 * The same limit as the copy says it, so the two cannot drift. The message and
 * the hint used to spell "2 MB" out in the strings file, where nothing connects
 * them to the number actually enforced — this was raised in four places, and
 * the two that are only words would have been the easy ones to miss.
 */
export const MAX_PHOTO_MB = MAX_PHOTO_BYTES / (1024 * 1024)
export const ACCEPTED_PHOTO_TYPES = ['image/png', 'image/jpeg'] as const

/** The `accept` attribute for the file input, kept beside the types it mirrors. */
export const PHOTO_ACCEPT = '.png,.jpg,.jpeg,image/png,image/jpeg'

export type PhotoProblem = 'type' | 'size'

/**
 * Why this file cannot be used, or null if it can.
 *
 * Takes the two fields it needs rather than a File, so it can be tested without
 * a DOM. A browser reports type from the file's content sniffing, not its
 * extension, so renaming a .exe to .png does not get past this.
 */
export function photoFileProblem(file: { type: string; size: number }): PhotoProblem | null {
  if (!(ACCEPTED_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'type'
  if (file.size > MAX_PHOTO_BYTES) return 'size'
  return null
}
