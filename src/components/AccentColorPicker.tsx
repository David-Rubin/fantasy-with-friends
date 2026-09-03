import type { AccentColor } from '../lib/types'
import { ACCENT_COLORS, accent } from '../lib/accentColor'
import { accentBg, accentRing } from './accentStyles'
import { t } from '../lib/i18n'

/**
 * What each swatch is called. The order and the membership of the palette are
 * ACCENT_COLORS' business and the classes are accentStyles', so this is only
 * the word — which is the one thing neither of those can supply.
 */
const LABELS: Record<AccentColor, string> = {
  violet: 'Violet',
  lavender: 'Lavender',
  pink: 'Pink',
  rose: 'Rose',
  orange: 'Orange',
  amber: 'Amber',
  emerald: 'Emerald',
  sage: 'Sage',
  cyan: 'Cyan',
  blue: 'Blue',
  brown: 'Brown',
  slate: 'Slate',
}

interface AccentColorPickerProps {
  value: AccentColor
  onChange: (color: AccentColor) => void
  label?: string
  /**
   * Colours somebody else has already claimed — team colours are unique within
   * a season. Shown rather than hidden: a palette that changes size depending
   * on who else has joined is a palette nobody can learn, and "that one is
   * taken" is more useful than a gap where a colour used to be.
   */
  taken?: AccentColor[]
  /** Names the holder of a taken colour, for the swatch's label. */
  takenLabel?: (color: AccentColor) => string | undefined
}

export function AccentColorPicker({
  value,
  onChange,
  label = 'Accent color',
  taken = [],
  takenLabel,
}: AccentColorPickerProps) {
  // A stored colour the palette does not know would leave the picker with
  // nothing selected, which reads as the league never having had a colour.
  // See accent().
  const selected = accent(value)
  const takenNow = taken.map(accent)

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-gray-700">{label}</legend>
      <div className="flex flex-wrap gap-2" role="group">
        {ACCENT_COLORS.map((color) => {
          const swatchLabel = LABELS[color]
          const isTaken = takenNow.includes(color) && color !== selected
          const holder = isTaken ? takenLabel?.(color) : undefined

          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              disabled={isTaken}
              // The name carries the state, because the state is carried
              // visually by a dimmed swatch and a slash — neither of which a
              // screen reader can see. `disabled` alone would announce the
              // swatch as unavailable without ever saying why.
              aria-label={
                isTaken
                  ? holder
                    ? t('team.color.takenBy', { color: swatchLabel, team: holder })
                    : t('team.color.taken', { color: swatchLabel })
                  : swatchLabel
              }
              // The hover tooltip says only that the colour is spoken for. Who
              // holds it is in the aria-label above, where it earns its length:
              // a screen reader has no dimmed swatch to look at.
              title={isTaken ? t('team.color.takenTooltip') : swatchLabel}
              aria-pressed={selected === color}
              className={[
                'relative h-8 w-8 rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                isTaken
                  ? 'cursor-not-allowed'
                  : selected === color
                    ? `ring-2 ring-offset-2 ${accentRing[color]} scale-110`
                    : 'hover:scale-105',
              ].join(' ')}
            >
              {/* The colour is faded on its own layer rather than on the
                  button, so the slash over it stays at full strength — faded
                  along with everything else it was barely there at all. */}
              <span
                className={`absolute inset-0 rounded-full ${accentBg[color]} ${
                  isTaken ? 'opacity-25 saturate-50' : ''
                }`}
              />
              {/* Opacity alone reads as "a paler colour" next to eleven
                  saturated ones, and is the first thing to disappear for
                  anyone who cannot separate hues by brightness. */}
              {isTaken && (
                <svg
                  className="absolute inset-0 h-full w-full text-gray-500"
                  viewBox="0 0 32 32"
                  aria-hidden="true"
                >
                  <line
                    x1="7"
                    y1="25"
                    x2="25"
                    y2="7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
