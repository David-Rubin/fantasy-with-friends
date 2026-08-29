import { useEffect, useId, useRef, useState } from 'react'
import { t } from '../lib/i18n'

/**
 * Which episodes a scoring rule applies to.
 *
 * A dropdown rather than an inline list of checkboxes: a season can run to
 * twenty-odd episodes, and that many boxes inline would bury the two fields
 * beside it. The button carries the summary, so the common answers — every
 * episode, or a handful — are readable without opening anything.
 *
 * Selecting nothing is allowed here and refused on save. Emptying the list is
 * the natural way to start picking a few, and a control that fought you at
 * every click would be worse than a message when you try to keep it.
 */
export function EpisodeMultiSelect({
  episodeNumbers,
  selected,
  onChange,
}: {
  /** Every episode in the season, in order. */
  episodeNumbers: number[]
  selected: number[]
  onChange: (next: number[]) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  const allSelected = episodeNumbers.length > 0 && selected.length === episodeNumbers.length
  const summary = allSelected
    ? t('rules.episodes.all')
    : selected.length === 0
      ? t('rules.episodes.none')
      : t('rules.episodes.some', { n: selected.length, total: episodeNumbers.length })

  function toggle(episode: number) {
    onChange(
      selected.includes(episode)
        ? selected.filter((n) => n !== episode)
        : [...selected, episode].sort((a, b) => a - b)
    )
  }

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-700">{t('rules.episodes')}</span>
      <button
        // Never a submit button: this sits inside the add-rule form.
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-[38px] w-44 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      >
        <span className={selected.length === 0 ? 'text-red-600' : undefined}>{summary}</span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-gray-400"
        >
          <path d="M5 8l5 5 5-5H5z" />
        </svg>
      </button>

      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={t('rules.episodes')}
          className="absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="flex gap-2 border-b border-gray-100 px-3 py-2">
            <button
              type="button"
              onClick={() => onChange([...episodeNumbers])}
              className="text-xs font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {t('rules.episodes.selectAll')}
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
            >
              {t('rules.episodes.deselectAll')}
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {episodeNumbers.map((episode) => (
              <li key={episode}>
                <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(episode)}
                    onChange={() => toggle(episode)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t('nav.episode', { n: episode })}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
