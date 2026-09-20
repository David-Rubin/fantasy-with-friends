import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
  /**
   * Sits beside the label — an info tooltip, say. Outside the <label> element
   * on purpose: anything interactive in there would steal the click that is
   * supposed to focus the field.
   */
  labelAdornment?: ReactNode
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  error?: string
  hint?: string
}

/**
 * `text-base sm:text-sm` rather than plain `text-sm`, and the same goes for
 * every other field, select and textarea in the app.
 *
 * iOS zooms the whole page in when you focus a control whose text is smaller
 * than 16px, and never zooms back out — the scale then follows you from page
 * to page, so signing in left the entire app zoomed with its edges off the
 * screen. Nothing can undo that from script: there is no API for the pinch
 * scale, and the viewport-meta trick that forces a reset works by taking
 * pinch-zoom away from everybody. 16px on a phone is what stops it happening,
 * and `sm:` keeps the 14px this had everywhere a pointer is likely.
 */
const inputBase =
  'block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-500'

export function Input({
  label,
  error,
  hint,
  labelAdornment,
  id,
  className = '',
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
          {props.required && (
            <span aria-hidden="true" className="ml-1 text-red-500">
              *
            </span>
          )}
        </label>
        {labelAdornment}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      <input
        id={inputId}
        aria-required={props.required}
        aria-describedby={
          [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={!!error}
        className={[inputBase, error ? 'border-red-500 focus:ring-red-500/20' : '', className].join(
          ' '
        )}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}

export function Textarea({ label, error, hint, id, className = '', ...props }: TextareaProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
        {props.required && (
          <span aria-hidden="true" className="ml-1 text-red-500">
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-gray-500">
          {hint}
        </p>
      )}
      <textarea
        id={inputId}
        aria-required={props.required}
        aria-describedby={
          [error ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={!!error}
        rows={3}
        className={[
          inputBase,
          error ? 'border-red-500 focus:ring-red-500/20' : '',
          'resize-y',
          className,
        ].join(' ')}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
