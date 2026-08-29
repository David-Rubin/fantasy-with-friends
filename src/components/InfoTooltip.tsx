import { useEffect, useId, useRef, useState } from 'react'

/**
 * A note about a field, behind an info icon.
 *
 * Two ways in, tracked separately, because one state cannot serve both: a
 * pointer *peeks* — open while hovering, gone when it leaves — and a click
 * *pins*, so the tip survives the mouse moving away and touch has any way in at
 * all. Folding both into one flag made a click land on an already-open tip and
 * read as closing it.
 *
 * The bubble is absolutely positioned so opening it never moves the form.
 */
export function InfoTooltip({ text, label }: { text: string; label: string }) {
  const [pinned, setPinned] = useState(false)
  const [peeking, setPeeking] = useState(false)
  const open = pinned || peeking
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement>(null)

  // Escape closes it, and so does a click anywhere else — the same two ways out
  // every other dismissible thing in a browser offers.
  useEffect(() => {
    if (!pinned) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPinned(false)
    }
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [pinned])

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        // Explicitly not a submit button: this sits inside the add-rule form,
        // and the default would post it every time somebody read the tip.
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={() => setPeeking(true)}
        onMouseLeave={() => setPeeking(false)}
        onFocus={() => setPeeking(true)}
        onBlur={() => setPeeking(false)}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-4 w-4">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-4a1 1 0 100 2 1 1 0 000-2z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-10 mb-2 w-52 -translate-x-1/2 rounded-lg bg-gray-900 px-3 py-2 text-xs font-normal leading-snug text-white shadow-lg"
        >
          {text}
          <span className="absolute left-1/2 top-full -ml-1 border-4 border-transparent border-t-gray-900" />
        </span>
      )}
    </span>
  )
}
