import { describe, it, expect } from 'vitest'
import {
  AVATAR_CROP_SHAPE,
  CONTESTANT_CROP_SHAPE,
  DEFAULT_CROP_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  coverRegion,
  cropFromView,
  croppedImageStyle,
  cutoutBox,
  isUsableSize,
  panView,
  readCrop,
  stageImageStyle,
  viewFromCrop,
  zoomView,
  type PhotoCrop,
} from './photoCrop'

/** A square cutout, as a person is cropped. */
const sq = AVATAR_CROP_SHAPE

/** A landscape photo: twice as wide as it is tall. */
const landscape = { width: 800, height: 400 }
/** A portrait one, the other way round. */
const portrait = { width: 400, height: 800 }
const square = { width: 500, height: 500 }

describe('coverRegion', () => {
  it('takes the whole of the short side and the middle of the long one', () => {
    expect(coverRegion(landscape, 1)).toEqual({ w: 0.5, h: 1 })
    expect(coverRegion(portrait, 1)).toEqual({ w: 1, h: 0.5 })
    expect(coverRegion(square, 1)).toEqual({ w: 1, h: 1 })
  })

  it('takes the largest region of whatever shape is asked for', () => {
    // A 2:1 photo holds a full-height 4:3 region across two thirds of it.
    expect(coverRegion(landscape, 4 / 3)).toEqual({ w: (400 * (4 / 3)) / 800, h: 1 })
    // And a full-width one when the shape is wider than the photo.
    expect(coverRegion(landscape, 4)).toEqual({ w: 1, h: 800 / 4 / 400 })
  })

  it('takes the whole picture when the shapes match', () => {
    expect(coverRegion({ width: 400, height: 300 }, 4 / 3)).toEqual({ w: 1, h: 1 })
  })
})

describe('cropFromView', () => {
  it('starts on the centred square, which is what object-cover already showed', () => {
    expect(cropFromView(DEFAULT_CROP_VIEW, landscape, sq)).toMatchObject({
      x: 0.25,
      y: 0,
      w: 0.5,
      h: 1,
    })
    expect(cropFromView(DEFAULT_CROP_VIEW, portrait, sq)).toMatchObject({
      x: 0,
      y: 0.25,
      w: 1,
      h: 0.5,
    })
    expect(cropFromView(DEFAULT_CROP_VIEW, square, sq)).toMatchObject({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('keeps the region the shape it was asked for, which is what the frames expect', () => {
    for (const natural of [landscape, portrait, square]) {
      for (const shape of [sq, CONTESTANT_CROP_SHAPE]) {
        for (const zoom of [1, 1.7, 3]) {
          const crop = cropFromView({ zoom, cx: 0.5, cy: 0.5 }, natural, shape)
          const pixels = (crop.w * natural.width) / (crop.h * natural.height)
          // Within a thousandth: the fractions are stored to four places, so
          // the shape is right to about a tenth of a pixel on a 900px side.
          expect(pixels).toBeCloseTo(shape.aspect, 3)
          expect(crop.aspect).toBe(shape.aspect)
        }
      }
    }
  })

  it('takes half as much of the picture at twice the zoom', () => {
    expect(cropFromView({ zoom: 2, cx: 0.5, cy: 0.5 }, landscape, sq)).toMatchObject({
      x: 0.375,
      y: 0.25,
      w: 0.25,
      h: 0.5,
    })
  })

  it('never lets the region leave the picture', () => {
    // Asked for a square centred hard against the top-left corner.
    const crop = cropFromView({ zoom: 2, cx: 0, cy: 0 }, landscape, sq)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)

    const far = cropFromView({ zoom: 2, cx: 9, cy: 9 }, landscape, sq)
    expect(far.x + far.w).toBeCloseTo(1, 4)
    expect(far.y + far.h).toBeCloseTo(1, 4)
  })

  it('refuses to zoom further out than the whole picture', () => {
    expect(cropFromView({ zoom: 0.2, cx: 0.5, cy: 0.5 }, landscape, sq)).toEqual(
      cropFromView(DEFAULT_CROP_VIEW, landscape, sq)
    )
  })
})

describe('viewFromCrop', () => {
  it('round-trips a crop back into the controls that made it', () => {
    for (const natural of [landscape, portrait, square]) {
      for (const shape of [sq, CONTESTANT_CROP_SHAPE]) {
        for (const view of [
          { zoom: 1, cx: 0.5, cy: 0.5 },
          { zoom: 2.5, cx: 0.3, cy: 0.4 },
          { zoom: 1.4, cx: 0.8, cy: 0.2 },
        ]) {
          const crop = cropFromView(view, natural, shape)
          expect(cropFromView(viewFromCrop(crop, natural), natural, shape)).toEqual(crop)
        }
      }
    }
  })
})

describe('panView', () => {
  it('moves the window the other way, so the picture follows the drag', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 }
    // A quarter of the viewport to the right shows a quarter of the crop more
    // of what was off to the left.
    const moved = panView(start, { dx: 72, dy: 0 }, { width: 288, height: 288 }, landscape, sq)
    expect(moved.cx).toBeCloseTo(0.5 - 0.25 * 0.25, 4)
    expect(moved.cy).toBe(0.5)
  })

  it('stops at the edge of the picture rather than letting a gap in', () => {
    const start = { zoom: 1, cx: 0.5, cy: 0.5 }
    const moved = panView(start, { dx: 5000, dy: 5000 }, { width: 288, height: 288 }, landscape, sq)
    const crop = cropFromView(moved, landscape, sq)
    expect(crop.x).toBe(0)
    expect(crop.y).toBe(0)
  })

  it('has nowhere to go on the axis the picture exactly fills', () => {
    // A landscape photo at zoom 1 fills a square frame's height exactly, so
    // only the horizontal drag can do anything.
    const moved = panView(
      { zoom: 1, cx: 0.5, cy: 0.5 },
      { dx: 0, dy: 40 },
      { width: 288, height: 288 },
      landscape,
      sq
    )
    expect(moved.cy).toBe(0.5)
  })

  it('ignores a viewport that has not been measured yet', () => {
    const start = { zoom: 2, cx: 0.5, cy: 0.5 }
    expect(panView(start, { dx: 20, dy: 20 }, { width: 0, height: 0 }, landscape, sq)).toEqual(
      start
    )
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
    expect(croppedImageStyle({ x: 0.25, y: 0, w: 0.5, h: 1, aspect: 1 })).toEqual({
      width: '200%',
      height: '100%',
      left: '-50%',
      top: '0%',
    })
  })

  it('scales both axes by the same amount, so nothing is stretched', () => {
    // The crop is square in pixels, so 1/w of the box's width and 1/h of its
    // height are the same multiple of the image's own sides.
    const crop = cropFromView({ zoom: 1.5, cx: 0.4, cy: 0.6 }, landscape, sq)
    const style = croppedImageStyle(crop)
    const renderedAspect =
      (parseFloat(style.width) / parseFloat(style.height)) * (landscape.height / landscape.width)
    // A square box: equal percentages mean the picture keeps its own shape.
    expect(renderedAspect).toBeCloseTo(1, 3)
  })
})

describe('readCrop', () => {
  const good: PhotoCrop = { x: 0.1, y: 0.2, w: 0.5, h: 0.6, aspect: 4 / 3 }

  it('reads a crop that is really there', () => {
    expect(readCrop(good)).toEqual(good)
  })

  it('reads a crop with no aspect as the square one every crop used to be', () => {
    expect(readCrop({ x: 0.25, y: 0, w: 0.5, h: 1 })?.aspect).toBe(1)
  })

  it('reads anything else as no crop at all, not as an error', () => {
    for (const value of [
      undefined,
      null,
      'centre',
      {},
      { x: 0, y: 0, w: 0, h: 1, aspect: 1 },
      { x: 0, y: 0, w: 2, h: 1, aspect: 1 },
      { x: 0.9, y: 0, w: 0.5, h: 1, aspect: 1 },
      { x: -0.1, y: 0, w: 0.5, h: 1, aspect: 1 },
      { x: 0, y: 0, w: 0.5, h: Number.NaN, aspect: 1 },
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

describe('the editor stage', () => {
  it("gives a round cutout a square, and a card-shaped one the card's shape", () => {
    const round = cutoutBox(AVATAR_CROP_SHAPE.aspect)
    expect(round.w).toBe(round.h)

    const card = cutoutBox(CONTESTANT_CROP_SHAPE.aspect)
    expect(card.w / card.h).toBeCloseTo(CONTESTANT_CROP_SHAPE.aspect, 6)
    expect(card.w).toBeLessThanOrEqual(1)
    expect(card.h).toBeLessThanOrEqual(1)
  })

  it('lays the whole picture out so the crop lands exactly on the cutout', () => {
    const crop = cropFromView({ zoom: 2, cx: 0.5, cy: 0.5 }, landscape, sq)
    const cutout = cutoutBox(sq.aspect)
    const style = stageImageStyle(crop, cutout)

    // The image is as many cutouts wide as the crop is a fraction of it…
    const width = parseFloat(style.width) / 100
    const height = parseFloat(style.height) / 100
    expect(width).toBeCloseTo(cutout.w / crop.w, 6)
    expect(height).toBeCloseTo(cutout.h / crop.h, 6)

    // …and the crop's own corner sits on the cutout's corner.
    const left = parseFloat(style.left) / 100
    const top = parseFloat(style.top) / 100
    expect(left + crop.x * width).toBeCloseTo(0.5 - cutout.w / 2, 6)
    expect(top + crop.y * height).toBeCloseTo(0.5 - cutout.h / 2, 6)
  })

  it('draws the picture undistorted on the stage, which is square', () => {
    for (const shape of [sq, CONTESTANT_CROP_SHAPE]) {
      const crop = cropFromView({ zoom: 1.3, cx: 0.5, cy: 0.5 }, landscape, shape)
      const style = stageImageStyle(crop, cutoutBox(shape.aspect))
      const drawn = parseFloat(style.width) / parseFloat(style.height)
      expect(drawn).toBeCloseTo(landscape.width / landscape.height, 2)
    }
  })
})
