import { useRef, useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import {
  AVATAR_CROP_SHAPE,
  DEFAULT_CROP_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  cropFromView,
  cutoutBox,
  isUsableSize,
  panView,
  stageImageStyle,
  viewFromCrop,
  zoomView,
  type CropShape,
  type CropView,
  type ImageSize,
  type PhotoCrop,
} from '../lib/photoCrop'
import { t } from '../lib/i18n'

/** The stage's width in the layout, used only until it has been measured. */
const STAGE_PX = 320

/**
 * Choosing which part of a photo is the photo.
 *
 * The whole picture is on the stage and can be dragged and zoomed under a
 * cutout in the shape it will actually be drawn in — a circle for a person, the
 * shape of a draft-board card for a contestant. Everything outside the cutout
 * is dimmed, so the preview is not a thumbnail off to one side claiming to
 * represent the result: it is the picture itself, with the part that will be
 * kept picked out of it.
 *
 * Nothing is written from here. The dialog hands back a crop and the caller
 * decides what that means: a new picture to upload, or an adjustment to one
 * that is already stored.
 *
 * A different picture is a different crop, and this holds no state that would
 * survive one: callers key it on `src`, so choosing another photo mounts a
 * fresh dialog rather than opening the last one's zoom over a new face.
 */
export function PhotoCropDialog({
  open,
  onClose,
  onSave,
  src,
  crop,
  shape = AVATAR_CROP_SHAPE,
  title,
  saving = false,
  error = '',
}: {
  open: boolean
  onClose: () => void
  onSave: (crop: PhotoCrop) => void
  /** What to crop. A blob: URL for a file being uploaded, or a stored address. */
  src: string
  /** The crop being adjusted, if this photo already has one. */
  crop?: PhotoCrop
  /** The shape the picture will be drawn in. See CropShape. */
  shape?: CropShape
  title: string
  saving?: boolean
  error?: string
}) {
  const [natural, setNatural] = useState<ImageSize | null>(null)
  const [view, setView] = useState<CropView>(DEFAULT_CROP_VIEW)
  const [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const dragging = useRef<{ x: number; y: number } | null>(null)

  // The stored crop can only be turned back into a zoom and a centre once the
  // image's own size is known, so it is applied when the image lands.
  function handleLoaded(event: React.SyntheticEvent<HTMLImageElement>) {
    const size = {
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    }
    if (!isUsableSize(size)) {
      setFailed(true)
      return
    }
    setNatural(size)
    setView(crop ? viewFromCrop(crop, size) : DEFAULT_CROP_VIEW)
  }

  const cutout = cutoutBox(shape.aspect)
  const liveCrop = natural ? cropFromView(view, natural, shape) : undefined

  function startDrag(event: React.PointerEvent) {
    if (!natural) return
    dragging.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onDrag(event: React.PointerEvent) {
    const from = dragging.current
    if (!from || !natural) return
    // Measured rather than assumed: the stage is a percentage of a dialog that
    // is itself a percentage of the window, so its size on screen is only known
    // once it is on screen.
    const stagePx = stage.current?.getBoundingClientRect().width ?? STAGE_PX
    setView((current) =>
      panView(
        current,
        { dx: event.clientX - from.x, dy: event.clientY - from.y },
        { width: stagePx * cutout.w, height: stagePx * cutout.h },
        natural,
        shape
      )
    )
    dragging.current = { x: event.clientX, y: event.clientY }
  }

  function endDrag(event: React.PointerEvent) {
    dragging.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            loading={saving}
            disabled={!liveCrop}
            onClick={() => liveCrop && onSave(liveCrop)}
          >
            {t('photoCrop.save')}
          </Button>
        </>
      }
    >
      {failed ? (
        <p className="text-sm text-red-600">{t('photoCrop.failed')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">{t('photoCrop.help')}</p>

          <div
            ref={stage}
            onPointerDown={startDrag}
            onPointerMove={onDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative mx-auto aspect-square w-full max-w-80 cursor-grab touch-none select-none overflow-hidden rounded-xl bg-gray-900 active:cursor-grabbing"
          >
            {/* The whole picture, placed so the cutout below lands on the crop.
                Hidden until its own size is known, because until then there is
                no crop and so nowhere to put it. */}
            <img
              src={src}
              alt=""
              onLoad={handleLoaded}
              onError={() => setFailed(true)}
              style={liveCrop ? stageImageStyle(liveCrop, cutout) : { opacity: 0 }}
              className="pointer-events-none absolute max-w-none"
            />

            {/* The dim is this element's own shadow, spread far enough to fill
                the stage: one box, and it follows the border radius, which four
                panels around a rectangle could not do for a circle. */}
            <div
              aria-hidden="true"
              style={{
                width: `${cutout.w * 100}%`,
                height: `${cutout.h * 100}%`,
                // The dim, and — inside the white ring — a dark hairline, so
                // the edge of the frame is visible against a pale photo as well
                // as a dark one.
                boxShadow:
                  '0 0 0 9999px rgba(17, 24, 39, 0.6), inset 0 0 0 1px rgba(17, 24, 39, 0.35)',
              }}
              className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ring-2 ring-white/90 ${
                shape.round ? 'rounded-full' : 'rounded-md'
              }`}
            />
          </div>

          <label className="mx-auto flex w-full max-w-80 items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{t('photoCrop.zoom')}</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={ZOOM_STEP}
              value={view.zoom}
              disabled={!natural}
              onChange={(e) => setView((v) => zoomView(v, Number(e.target.value)))}
              className="h-1 flex-1 cursor-pointer accent-blue-600"
              aria-label={t('photoCrop.zoom')}
            />
            <Button
              variant="ghost"
              className="!min-h-0 !px-3 !py-1 text-xs"
              disabled={!natural}
              onClick={() => setView(DEFAULT_CROP_VIEW)}
            >
              {t('photoCrop.reset')}
            </Button>
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </Modal>
  )
}
