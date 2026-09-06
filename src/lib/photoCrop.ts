/**
 * Which part of a picture is the picture, decided without Firebase in sight.
 *
 * A photo is shown all over the app in frames it was never shaped for: circles
 * of two sizes, a wide banner on a contestant card. Left to `object-fit: cover`
 * the browser keeps the middle, which is where faces are not — a group shot
 * becomes somebody's shoulder. So a photo can carry a crop, and everything that
 * draws it honours the same one.
 *
 * ── What is stored ──────────────────────────────────────────────────────────
 *
 * A rectangle in the image's own coordinates, as fractions: `x`/`w` of its
 * width, `y`/`h` of its height. Fractions rather than pixels so it survives the
 * same picture being re-encoded at another size, and so a frame can lay it out
 * knowing nothing about the file.
 *
 * The region is always square *in pixels* — `w × imageWidth == h × imageHeight`
 * — which is what the editor produces and what every frame in the app expects.
 * Two numbers rather than one because a frame renders from the stored crop
 * alone, and recovering the second from a single side would need the image's
 * dimensions, which CSS does not have.
 *
 * ── What is not stored ──────────────────────────────────────────────────────
 *
 * A photo with no crop is left exactly as it was: no crop means `object-cover`,
 * which is what every picture in the app did before this existed. So nothing
 * needs rewriting, and a photo somebody never adjusted looks the same as it
 * always did rather than being silently re-centred.
 */

/** A rectangle of an image, in fractions of that image. See the note above. */
export interface PhotoCrop {
  x: number
  y: number
  w: number
  h: number
}

/** An image's own size in pixels — all the editor needs to know about the file. */
export interface ImageSize {
  width: number
  height: number
}

/**
 * The crop as the editor holds it: how far in, and what it is centred on.
 *
 * A zoom and a centre, rather than the four numbers that get stored, because
 * that is what the two controls are — a slider and a drag. The rectangle is
 * derived on every change, so the two can never disagree.
 */
export interface CropView {
  /** 1 shows as much as a square frame can hold; above that, further in. */
  zoom: number
  /** The centre of the kept square, in fractions of the image. */
  cx: number
  cy: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
/** Fine enough to frame a face, coarse enough that the slider is not fiddly. */
export const ZOOM_STEP = 0.01

/** Where a photo starts: the whole of it, as far out as the frame allows. */
export const DEFAULT_CROP_VIEW: CropView = { zoom: 1, cx: 0.5, cy: 0.5 }

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}

/** Whether an image is one this module can work with at all. */
export function isUsableSize(size: ImageSize | null | undefined): size is ImageSize {
  return !!size && size.width > 0 && size.height > 0
}

/**
 * The largest square the image holds, as fractions of it.
 *
 * This is zoom 1, and it is deliberately what `object-fit: cover` already shows
 * in a square frame — so opening the editor on an untouched photo shows the
 * picture exactly as the app has been drawing it, and the first thing the admin
 * sees is the thing they are changing.
 */
export function coverSquare(natural: ImageSize): { w: number; h: number } {
  const side = Math.min(natural.width, natural.height)
  return { w: side / natural.width, h: side / natural.height }
}

/** Round-trip precision. Enough to be exact on screen, short enough to read. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * The stored rectangle for a zoom and a centre.
 *
 * Clamped into the image on both axes, so the frame can never be asked to show
 * anything that is not there: a drag that runs off the edge stops at it rather
 * than letting a strip of background in.
 */
export function cropFromView(view: CropView, natural: ImageSize): PhotoCrop {
  const cover = coverSquare(natural)
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  // Rounded before the height is taken from it, not after, so that reading a
  // stored crop back into the controls and writing it out again lands on the
  // same four numbers. Round each independently and the last digit drifts a
  // little every time somebody opens the dialog and presses Save.
  const w = round(cover.w / zoom)
  const h = round(w * (natural.width / natural.height))
  return {
    x: round(clamp(view.cx - w / 2, 0, 1 - w)),
    y: round(clamp(view.cy - h / 2, 0, 1 - h)),
    w,
    h,
  }
}

/** The zoom and centre behind a stored rectangle, for editing it again. */
export function viewFromCrop(crop: PhotoCrop, natural: ImageSize): CropView {
  const cover = coverSquare(natural)
  return {
    zoom: clamp(cover.w / crop.w, MIN_ZOOM, MAX_ZOOM),
    cx: crop.x + crop.w / 2,
    cy: crop.y + crop.h / 2,
  }
}

/**
 * The centre after dragging the picture by so many pixels.
 *
 * The viewport shows exactly the kept square, so one viewport-width of drag is
 * one crop-width of image — which is why this needs the viewport's size and not
 * the image's. Dragging the picture right reveals what is to its left, so the
 * window moves the other way.
 */
export function panView(
  view: CropView,
  drag: { dx: number; dy: number },
  viewportPx: number,
  natural: ImageSize
): CropView {
  if (viewportPx <= 0) return view
  const cover = coverSquare(natural)
  const w = cover.w / clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const h = cover.h / clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  return {
    ...view,
    cx: clamp(view.cx - (drag.dx / viewportPx) * w, w / 2, 1 - w / 2),
    cy: clamp(view.cy - (drag.dy / viewportPx) * h, h / 2, 1 - h / 2),
  }
}

/** The zoom clamped to what the slider offers. */
export function zoomView(view: CropView, zoom: number): CropView {
  return { ...view, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }
}

/**
 * Where to put the image so a frame shows the crop and nothing else.
 *
 * Read against a square box that covers the frame (see CroppedPhoto): sizing
 * the image to `1/w` of that box's width and `1/h` of its height makes the crop
 * exactly the box, and because the crop is square in pixels and the box is
 * square on screen, the two scale factors come out equal — the picture is not
 * stretched. A frame that is not square then shows the crop cover-fitted into
 * it, the same way an uncropped photo is cover-fitted today.
 *
 * Percentages rather than pixels throughout, so one stored crop draws correctly
 * in a 32px circle and an 80px one without measuring either.
 */
export function croppedImageStyle(crop: PhotoCrop): {
  width: string
  height: string
  left: string
  top: string
} {
  return {
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-crop.x * 100) / crop.w}%`,
    top: `${(-crop.y * 100) / crop.h}%`,
  }
}

/**
 * A crop as it comes back from Firestore, or undefined if there is not one.
 *
 * Anything malformed is read as no crop at all rather than trusted: the numbers
 * go straight into a style, and a stray null or a hand-edited zero width would
 * put the image somewhere nobody can see it. An absent crop is the ordinary
 * case — every photo uploaded before this existed — not an error.
 */
export function readCrop(value: unknown): PhotoCrop | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { x, y, w, h } = value as Record<string, unknown>
  if (![x, y, w, h].every((n) => typeof n === 'number' && Number.isFinite(n))) return undefined
  const crop = { x, y, w, h } as PhotoCrop
  if (crop.w <= 0 || crop.h <= 0 || crop.w > 1 || crop.h > 1) return undefined
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001) {
    return undefined
  }
  return crop
}
