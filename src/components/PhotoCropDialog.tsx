import { useRef, useState } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'
import { CroppedPhoto } from './CroppedPhoto'
import {
  DEFAULT_CROP_VIEW,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  cropFromView,
  isUsableSize,
  panView,
  viewFromCrop,
  zoomView,
  type CropView,
  type ImageSize,
  type PhotoCrop,
} from '../lib/photoCrop'
import { t } from '../lib/i18n'

/** The shapes a picture is drawn in, so the preview can show all of them. */
export type PreviewShape = 'avatar' | 'card'

/** The viewport's width in the layout, used only until it has been measured. */
const VIEWPORT_PX = 288

/**
 * Choosing which part of a photo is the photo.
 *
 * A square viewport showing what will be kept, a slider for how far in, and
 * beside them the picture drawn at the sizes and shapes the app actually uses.
 * The previews are the same CroppedPhoto every one of those places renders, so
 * "this is what it will look like" is not an approximation of the real thing —
 * it is the real thing, in a dialog.
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
  displayName,
  shapes = ['avatar'],
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
  /** Shown under the previews so a face has something to sit beside. */
  displayName?: string
  shapes?: PreviewShape[]
  title: string
  saving?: boolean
  error?: string
}) {
  const [natural, setNatural] = useState<ImageSize | null>(null)
  const [view, setView] = useState<CropView>(DEFAULT_CROP_VIEW)
  const [failed, setFailed] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
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

  const liveCrop = natural ? cropFromView(view, natural) : undefined

  function startDrag(event: React.PointerEvent) {
    if (!natural) return
    dragging.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onDrag(event: React.PointerEvent) {
    const from = dragging.current
    if (!from || !natural) return
    const box = viewport.current?.getBoundingClientRect()
    setView((current) =>
      panView(
        current,
        { dx: event.clientX - from.x, dy: event.clientY - from.y },
        box?.width ?? VIEWPORT_PX,
        natural
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
      size="wide"
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
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">{t('photoCrop.help')}</p>
            {/* The viewport shows exactly the square that will be kept, so what
                is inside it is the answer and what is outside is not. Nothing
                dims the surroundings because there are none — the image is
                drawn cropped, not full-bleed behind a mask. */}
            <div
              ref={viewport}
              onPointerDown={startDrag}
              onPointerMove={onDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              className="relative aspect-square w-full max-w-72 shrink-0 cursor-grab touch-none select-none overflow-hidden rounded-xl border border-gray-300 bg-gray-100 active:cursor-grabbing"
            >
              {/* Loaded once, hidden, purely to learn the image's own size. The
                  visible copies are all CroppedPhoto, which needs the crop that
                  cannot be computed until this has landed. */}
              <img
                src={src}
                alt=""
                onLoad={handleLoaded}
                onError={() => setFailed(true)}
                className="pointer-events-none absolute h-px w-px opacity-0"
              />
              {liveCrop && (
                <CroppedPhoto src={src} crop={liveCrop} className="pointer-events-none" />
              )}
            </div>

            <label className="flex items-center gap-3">
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

          <div className="flex flex-col gap-4">
            <p className="text-sm font-medium text-gray-700">{t('photoCrop.previewTitle')}</p>
            {shapes.includes('avatar') && (
              <div className="flex items-end gap-4">
                {/* The two sizes the app draws a person at, both of them real:
                    the header's 32px circle and the account page's 80px one. */}
                <Preview label={t('photoCrop.previewLarge')} className="h-20 w-20 rounded-full">
                  {liveCrop && <CroppedPhoto src={src} crop={liveCrop} />}
                </Preview>
                <Preview label={t('photoCrop.previewSmall')} className="h-8 w-8 rounded-full">
                  {liveCrop && <CroppedPhoto src={src} crop={liveCrop} />}
                </Preview>
              </div>
            )}
            {shapes.includes('card') && (
              <Preview label={t('photoCrop.previewCard')} className="h-24 w-40 rounded-t-xl">
                {liveCrop && <CroppedPhoto src={src} crop={liveCrop} />}
              </Preview>
            )}
            {displayName && <p className="text-sm text-gray-500">{displayName}</p>}
          </div>
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

/** One shape the photo is drawn in, with the name of where it appears. */
function Preview({
  label,
  className,
  children,
}: {
  label: string
  className: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`relative block overflow-hidden bg-gray-100 ${className}`}>{children}</span>
      <span className="text-xs text-gray-400">{label}</span>
    </div>
  )
}
