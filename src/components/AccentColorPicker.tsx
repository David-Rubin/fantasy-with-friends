import type { AccentColor } from '../lib/types'

const ACCENT_COLORS: { value: AccentColor; label: string; bg: string; ring: string }[] = [
  { value: 'violet', label: 'Violet', bg: 'bg-violet-600', ring: 'ring-violet-600' },
  { value: 'purple', label: 'Purple', bg: 'bg-purple-600', ring: 'ring-purple-600' },
  { value: 'pink', label: 'Pink', bg: 'bg-pink-600', ring: 'ring-pink-600' },
  { value: 'rose', label: 'Rose', bg: 'bg-rose-600', ring: 'ring-rose-600' },
  { value: 'orange', label: 'Orange', bg: 'bg-orange-600', ring: 'ring-orange-600' },
  { value: 'amber', label: 'Amber', bg: 'bg-amber-500', ring: 'ring-amber-500' },
  { value: 'emerald', label: 'Emerald', bg: 'bg-emerald-600', ring: 'ring-emerald-600' },
  { value: 'teal', label: 'Teal', bg: 'bg-teal-600', ring: 'ring-teal-600' },
  { value: 'cyan', label: 'Cyan', bg: 'bg-cyan-500', ring: 'ring-cyan-500' },
  { value: 'blue', label: 'Blue', bg: 'bg-blue-600', ring: 'ring-blue-600' },
  { value: 'indigo', label: 'Indigo', bg: 'bg-indigo-600', ring: 'ring-indigo-600' },
  { value: 'slate', label: 'Slate', bg: 'bg-slate-600', ring: 'ring-slate-600' },
]

interface AccentColorPickerProps {
  value: AccentColor
  onChange: (color: AccentColor) => void
  label?: string
}

export function AccentColorPicker({ value, onChange, label = 'Accent color' }: AccentColorPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">{label}</legend>
      <div className="flex flex-wrap gap-2" role="group">
        {ACCENT_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            aria-label={color.label}
            aria-pressed={value === color.value}
            className={[
              'h-8 w-8 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              color.bg,
              value === color.value ? `ring-2 ring-offset-2 ${color.ring} scale-110` : 'hover:scale-105',
            ].join(' ')}
          />
        ))}
      </div>
    </fieldset>
  )
}
