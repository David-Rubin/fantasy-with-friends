import { croppedImageStyle, readCrop, type PhotoCrop } from '../lib/photoCrop'

/**
 * A photo inside a frame, showing the part of it somebody chose.
 *
 * Renders the contents of a frame, not the frame: the caller supplies a box
 * that is `relative` and `overflow-hidden` and whatever shape it wants — a
 * circle, a card banner — and this fills it. Every picture in the app goes
 * through here so one stored crop looks the same in all of them, which is the
 * whole promise the editor's preview makes.
 *
 * With no crop it is the `object-cover` image the app has always drawn. That is
 * not a fallback for something missing: it is what an untouched photo is, and
 * keeping the two paths identical means adding this changed nothing about how
 * existing pictures look.
 *
 * With one, an invisible square sits in the middle of the frame, big enough to
 * cover it whatever its shape, and the image is laid out inside that square so
 * the crop fills it exactly — see croppedImageStyle for why the arithmetic
 * comes out undistorted. The square is what makes a non-square frame behave:
 * the banner on a contestant card shows a wide slice through the middle of the
 * crop, rather than the crop squeezed into a letterbox.
 */
export function CroppedPhoto({
  src,
  crop,
  alt = '',
  className = '',
}: {
  src: string
  crop?: PhotoCrop
  /** Empty by default: most frames sit beside the name they belong to. */
  alt?: string
  className?: string
}) {
  // Checked here rather than trusted, because this is the one place every
  // picture in the app goes through: a crop that has been hand-edited into
  // nonsense draws as the uncropped photo instead of putting the image
  // somewhere nobody can see it. See readCrop.
  const safe = readCrop(crop)
  if (!safe) {
    return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />
  }

  return (
    <span className="absolute left-1/2 top-1/2 block aspect-square min-h-full min-w-full -translate-x-1/2 -translate-y-1/2">
      {/* max-w-none because the width below is deliberately far more than 100%
          and Tailwind's preflight caps images at their container otherwise. */}
      <img
        src={src}
        alt={alt}
        style={croppedImageStyle(safe)}
        className={`absolute max-w-none ${className}`}
      />
    </span>
  )
}
