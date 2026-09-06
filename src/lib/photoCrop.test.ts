import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CROP_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  coverSquare,
  cropFromView,
  croppedImageStyle,
  isUsableSize,
  panView,
  readCrop,
  viewFromCrop,
  zoomView,
  type PhotoCrop,
} from './photoCrop'

/** A landscape photo: twice as wide as it is tall. */
const landscape = { width: 800, height: 400 }
/** A portrait one, the other way round. */
const portrait = { width: 400, height: 800 }
const square = { width: 500, height: 500 }

describe('coverSquare', () => {
  it('takes the whole of the short side and the middle of the long one', () => {
    expect(coverSquare(landscape)).toEqual({ w: 0.5, h: 1 })
    expect(coverSquare(portrait)).toEqual({ w: 1, h: 0.5 })
    expect(coverSquare(square)).toEqual({ w: 1, h: 1 })
  })
})

describe('cropFromView', () => {
  it('starts on the centred square, which is what object-cover already showed', () => {
    expect(cropFromView(DEFAULT_CROP_VIEW, landscape)).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 })
    expect(cropFromView(DEFAULT_CROP_VIEW, portrait)).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 })
    expect(cropFromView(DEFAULT_CROP_VIEW, square)).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('keeps the region square in pixels, which is what the frames expect', () => {
    for (const natural of [landscape, portrait, square]) {
      for (const zoom of [1, 1.7, 3]) {
        const crop = cropFromView({ zoom, cx: 0.5, cy: 0.5 }, natural)
        // Within a tenth of a pixel: the fractions are stored to four places,
        // which on an 800px side is worth about a twelfth of one. Squarer than
        // that is precision nothing can draw.
        expect(Math.abs(crop.w * natural.width - crop.h * natural.height)).toBeLessThan(0.1)
      }
    }
  })

  it('takes half as much of the picture at twice the zoom', () => {
    expect(cropFromView({ zoom: 2, cx: 0.5, cy: 0.5 }, landscape)).toEqual({
      x: 0.375,
      y: 0.25,
      w: 0.25,
      h: 0.5,
    })
  })

  it('never lets the region leave the picture', () => {
    // Asked for a square centred hard against the top-left corner.
    const crop = cropFromView({ zoom: 2, cx: 0, cy: 0 }, landscape)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)

    const far = cropFromView({ zoom: 2, cx: 9, cy: 9 }, landscape)
    expect(far.x + far.w).toBeCloseTo(1, 4)
    expect(far.y + far.h).toBeCloseTo(1, 4)
  })

  it('refuses to zoom further out than the whole picture', () => {
    expect(cropFromView({ zoom: 0.2, cx: 0.5, cy: 0.5 }, landscape)).toEqual(
      cropFromView(DEFAULT_CROP_VIEW, landscape)
    )
  })
})

describe('viewFromCrop', () => {
  it('round-trips a crop back into the controls that made it', () => {
    for (const natural of [landscape, portrait, square]) {
      for (const view of [
        { zoom: 1, cx: 0.5, cy: 0.5 },
        { zoom: 2.5, cx: 0.3, cy: 0.4 },
        { zoom: 1.4, cx: 0.8, cy: 0.2 },
      ]) {
        const crop = cropFromView(view, natural)
        expect(cropFromView(viewFromCrop(crop, natural), natural)).toEqual(crop)
      }
    }
  })
})

describe('panView', () => {
  it('moves the window the other way, so the picture follows the drag', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 }
    // A quarter of the viewport to the right shows a quarter of the crop more
    // of what was off to the left.
    const moved = panView(start, { dx: 72, dy: 0 }, 288, landscape)
    expect(moved.cx).toBeCloseTo(0.5 - 0.25 * 0.25, 4)
    expect(moved.cy).toBe(0.5)
  })

  it('stops at the edge of the picture rather than letting a gap in', () => {
    const start = { zoom: 1, cx: 0.5, cy: 0.5 }
    const moved = panView(start, { dx: 5000, dy: 5000 }, 288, landscape)
    const crop = cropFromView(moved, landscape)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  it('has nowhere to go on the axis the picture exactly fills', () => {
    // A landscape photo at zoom 1 fills a square frame's height exactly, so
    // only the horizontal drag can do anything.
    const moved = panView({ zoom: 1, cx: 0.5, cy: 0.5 }, { dx: 0, dy: 40 }, 288, landscape)
    expect(moved.cy).toBe(0.5)
  })

  it('ignores a viewport that has not been measured yet', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 }
    expect(panView(start, { dx: 20, dy: 20 }, 0, landscape)).toEqual(start)
  })
})

describe('zoomView', () => {
  it('holds the slider inside its own bounds', () => {
    expect(zoomView(DEFAULT_CROP_VIEW, 99).zoom).toBe(MAX_ZOOM)
    expect(zoomView(DEFAULT_CROP_VIEW, -1).zoom).toBe(MIN_ZOOM)
  })
})

describe('croppedImageStyle', () => {
  it('sizes and offsets the image so the crop is exactly the frame', () => {
    expect(croppedImageStyle({ x: 0.25, y: 0, w: 0.5, h: 1 })).toEqual({
      width: '200%',
      height: '100%',
      left: '-50%',
      top: '0%',
    })
  })

  it('scales both axes by the same amount, so nothing is stretched', () => {
    // The crop is square in pixels, so 1/w of the box's width and 1/h of its
    // height are the same multiple of the image's own sides.
    const crop = cropFromView({ zoom: 1.5, cx: 0.4, cy: 0.6 }, landscape)
    const style = croppedImageStyle(crop)
    const renderedAspect =
      (parseFloat(style.width) / parseFloat(style.height)) * (landscape.height / landscape.width)
    // A square box: equal percentages mean the picture keeps its own shape.
    expect(renderedAspect).toBeCloseTo(1, 3)
  })
})

describe('readCrop', () => {
  const good: PhotoCrop = { x: 0.1, y: 0.2, w: 0.5, h: 0.6 }

  it('reads a crop that is really there', () => {
    expect(readCrop(good)).toEqual(good)
  })

  it('reads anything else as no crop at all, not as an error', () => {
    for (const value of [
      undefined,
      null,
      'centre',
      {},
      { x: 0, y: 0, w: 0, h: 1 },
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 0.9, y: 0, w: 0.5, h: 1 },
      { x: -0.1, y: 0, w: 0.5, h: 1 },
      { x: 0, y: 0, w: 0.5, h: Number.NaN },
    ]) {
      expect(readCrop(value)).toBeUndefined()
    }
  })
})

describe('isUsableSize', () => {
  it('refuses an image with no dimensions, which is one that failed to decode', () => {
    expect(isUsableSize({ width: 0, height: 10 })).toBe(false)
    expect(isUsableSize(null)).toBe(false)
    expect(isUsableSize(square)).toBe(true)
  })
})
