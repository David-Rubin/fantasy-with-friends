import type { ReactNode } from 'react'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** What the switch decides — rendered beside it and read out with it. */
  label: ReactNode
  hint?: string
  id?: string
}

/**
 * An on/off control, as a switch.
 *
 * A `<button role="switch">` rather than a styled checkbox: a switch is what
 * the question is — it has two states and is always in one of them — and the
 * role is what a screen reader announces as "on" and "off" rather than
 * "checked". Because it is always in a state, "required" is satisfied by its
 * existence; there is no unanswered form to stop.
 */
export function Switch({ checked, onChange, label, hint, id }: SwitchProps) {
  const labelId = id ? `${id}-label` : undefined
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          id={id}
          aria-checked={checked}
          aria-labelledby={labelId}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
            checked ? 'bg-blue-600' : 'bg-gray-300'
          }`}
        >
          <span
            aria-hidden="true"
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
        <span id={labelId} className="text-sm font-medium text-gray-700">
          {label}
        </span>
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  )
}
