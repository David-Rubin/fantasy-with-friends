import { useTooltipDisclosure } from '../lib/useTooltipDisclosure'

/**
 * A note about a field, behind an info icon.
 *
 * The bubble is absolutely positioned so opening it never moves the form. How
 * it opens and closes lives in useTooltipDisclosure, shared with the bio
 * tooltip on a contestant card.
 */
export function InfoTooltip({ text, label }: { text: string; label: string }) {
  const { open, id, wrapRef, triggerProps } = useTooltipDisclosure<HTMLSpanElement>()

  return (
    <span ref={wrapRef} className="relative inline-flex">
      <button
        // Explicitly not a submit button: this sits inside the add-rule form,
        // and the default would post it every time somebody read the tip.
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        {...triggerProps}
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
