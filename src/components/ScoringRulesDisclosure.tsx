import { RuleSummary } from './ScoringRulesPanel'
import type { ScoringRule } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * The season's scoring rules, for anyone playing in it.
 *
 * How points are earned is the thing a player checks mid-episode and otherwise
 * never thinks about, so it sits on the season page collapsed: present on every
 * screen, in the way on none of them. Read-only regardless of who is looking —
 * admins change the rules from the season's Edit dialog.
 *
 * A native <details>, which gets the toggle, the keyboard behaviour and the
 * open/closed semantics without any state or ARIA of our own.
 */
export function ScoringRulesDisclosure({ rules }: { rules: ScoringRule[] }) {
  return (
    <details className="mb-6 rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-gray-700 marker:content-none hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl">
        <span className="inline-flex items-center gap-2">
          <svg
            className="h-4 w-4 text-gray-400 transition-transform [details[open]_&]:rotate-90"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          {t('rules.heading', { n: rules.length })}
        </span>
      </summary>
      <div className="border-t border-gray-100 px-5 py-4">
        {rules.length === 0 ? (
          <p className="text-sm text-gray-400">{t('rules.none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((rule) => (
              <li key={rule.id}>
                <RuleSummary rule={rule} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
