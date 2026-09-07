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
 * `aspect` is that rectangle's shape in pixels, and it is stored rather than
 * worked out because working it out needs the image's own dimensions, which CSS
 * does not have. A profile picture is cropped square, because it is drawn in
 * circles; a contestant is cropped to the shape of the card on the draft board,
 * because that is the biggest thing their photo appears in.
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
  /** The region's width over its height, in pixels. See the note above. */
  aspect: number
}

/** The shape a photo is being cropped to, and how the editor marks it out. */
export interface CropShape {
  /** Width over height of the region kept. */
  aspect: number
  /** Drawn as a circle rather than a rectangle, because that is how it appears. */
  round: boolean
}

/** A person: drawn in circles everywhere, so cropped square. */
export const AVATAR_CROP_SHAPE: CropShape = { aspect: 1, round: true }

/**
 * A contestant: cropped to the shape of the photo on a draft-board card.
 *
 * That card is fluid — three to a column on a desktop board, two on a narrow
 * one — so its photo is about 207×160 at the width the board is usually read
 * at and wider on a phone. 4:3 is that desktop shape, and the card cover-fits
 * whatever it is given, so a board at another width shows a little more or a
 * little less of the same region rather than something else entirely.
 */
export const CONTESTANT_CROP_SHAPE: CropShape = { aspect: 4 / 3, round: false }

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
 * The largest region of that shape the image holds, as fractions of it.
 *
 * This is zoom 1, and it is deliberately what `object-fit: cover` already shows
 * in a frame of the same shape — so opening the editor on an untouched photo
 * shows the picture exactly as the app has been drawing it, and the first thing
 * somebody sees is the thing they are changing.
 */
export function coverRegion(natural: ImageSize, aspect: number): { w: number; h: number } {
  const imageAspect = natural.width / natural.height
  // Wider than the shape asks for: the height is the limit and the region is a
  // full-height slice of it. Narrower, and it is the width.
  return imageAspect >= aspect
    ? { w: (natural.height * aspect) / natural.width, h: 1 }
    : { w: 1, h: natural.width / aspect / natural.height }
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
export function cropFromView(view: CropView, natural: ImageSize, shape: CropShape): PhotoCrop {
  const cover = coverRegion(natural, shape.aspect)
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  // Rounded before the height is taken from it, not after, so that reading a
  // stored crop back into the controls and writing it out again lands on the
  // same numbers. Round each independently and the last digit drifts a little
  // every time somebody opens the dialog and presses Save.
  const w = round(cover.w / zoom)
  const h = round((w * natural.width) / shape.aspect / natural.height)
  return {
    x: round(clamp(view.cx - w / 2, 0, 1 - w)),
    y: round(clamp(view.cy - h / 2, 0, 1 - h)),
    w,
    h,
    aspect: shape.aspect,
  }
}

/** The zoom and centre behind a stored rectangle, for editing it again. */
export function viewFromCrop(crop: PhotoCrop, natural: ImageSize): CropView {
  const cover = coverRegion(natural, crop.aspect)
  return {
    zoom: clamp(cover.w / crop.w, MIN_ZOOM, MAX_ZOOM),
    cx: crop.x + crop.w / 2,
    cy: crop.y + crop.h / 2,
  }
}

/**
 * The centre after dragging the picture by so many pixels.
 *
 * The cutout in the editor holds exactly the region being kept, so one
 * cutout-width of drag is one crop-width of image — which is why this needs the
 * cutout's size on screen and not the image's. Dragging the picture right
 * reveals what is to its left, so the region moves the other way.
 */
export function panView(
  view: CropView,
  drag: { dx: number; dy: number },
  cutout: { width: number; height: number },
  natural: ImageSize,
  shape: CropShape
): CropView {
  if (cutout.width <= 0 || cutout.height <= 0) return view
  const cover = coverRegion(natural, shape.aspect)
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM)
  const w = cover.w / zoom
  const h = cover.h / zoom
  return {
    ...view,
    cx: clamp(view.cx - (drag.dx / cutout.width) * w, w / 2, 1 - w / 2),
    cy: clamp(view.cy - (drag.dy / cutout.height) * h, h / 2, 1 - h / 2),
  }
}

/** The zoom clamped to what the slider offers. */
export function zoomView(view: CropView, zoom: number): CropView {
  return { ...view, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) }
}

/**
 * Where to put the image so a frame shows the crop and nothing else.
 *
 * Read against a box of the crop's own shape that covers the frame (see
 * CroppedPhoto): sizing the image to `1/w` of that box's width and `1/h` of its
 * height makes the crop exactly the box, and because the box is drawn at the
 * crop's pixel aspect, the two scale factors come out equal — the picture is
 * not stretched. A frame shaped differently then shows the crop cover-fitted
 * into it, the same way an uncropped photo is cover-fitted today.
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
  const crop = { x, y, w, h, aspect: 1 } as PhotoCrop
  const { aspect } = value as Record<string, unknown>
  if (typeof aspect === 'number' && Number.isFinite(aspect) && aspect > 0) crop.aspect = aspect
  if (crop.w <= 0 || crop.h <= 0 || crop.w > 1 || crop.h > 1) return undefined
  if (crop.x < 0 || crop.y < 0 || crop.x + crop.w > 1.0001 || crop.y + crop.h > 1.0001) {
    return undefined
  }
  return crop
}

/**
 * How much of the editor's square stage the cutout takes.
 *
 * Short of the whole thing on purpose: the dimmed picture around it is the
 * point of the overlay, and with no margin there would be nothing to see out
 * there and no sense of what panning would bring in.
 */
export const CUTOUT_FRACTION = 0.72

/** The cutout's size, as fractions of a square stage. */
export function cutoutBox(aspect: number): { w: number; h: number } {
  return aspect >= 1
    ? { w: CUTOUT_FRACTION, h: CUTOUT_FRACTION / aspect }
    : { w: CUTOUT_FRACTION * aspect, h: CUTOUT_FRACTION }
}

/**
 * Where to put the whole picture on the editor's stage so the cutout lands on
 * the crop.
 *
 * The same arithmetic as croppedImageStyle, measured against the cutout instead
 * of the frame: the image is however many cutouts wide the crop is a fraction
 * of, and shifted so the crop's corner meets the cutout's. What falls outside
 * the cutout is the rest of the photo, which is exactly what the editor wants
 * to show — dimmed, as the part that will not be kept.
 */
export function stageImageStyle(
  crop: PhotoCrop,
  cutout: { w: number; h: number }
): { width: string; height: string; left: string; top: string } {
  const width = cutout.w / crop.w
  const height = cutout.h / crop.h
  return {
    width: `${width * 100}%`,
    height: `${height * 100}%`,
    left: `${(0.5 - cutout.w / 2 - crop.x * width) * 100}%`,
    top: `${(0.5 - cutout.h / 2 - crop.y * height) * 100}%`,
  }
}
