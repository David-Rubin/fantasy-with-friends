import { useEffect, useMemo } from 'react'

/**
 * A blob URL for a file, handed back when it is no longer needed.
 *
 * An object URL is a handle on memory the browser holds until it is revoked,
 * so a picture that was chosen and then replaced, cancelled or uploaded has to
 * give one back. Doing that by hand meant an effect beside every piece of state
 * holding a File, and the one that was forgotten leaked a whole photo.
 *
 * The URL is worked out while rendering rather than set from an effect: it is
 * derived from the file and nothing else, and setting it as state would render
 * once with no picture and again with one. The effect only does the giving
 * back, which is what an effect is for.
 *
 * Kept free of Firebase — it is a browser fact, not an app one.
 */
export function useObjectUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => {
    if (!url) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  return url
}
