import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { AccentColorPicker } from './AccentColorPicker'
import { TeamColorDot } from './TeamColorDot'
import { isColorTakenError, renameTeam, setTeamColor } from '../lib/seasonApi'
import { normalizeTeamName, teamNameProblem, TEAM_NAME_MAX_LENGTH } from '../lib/teamName'
import type { AccentColor, SeasonState } from '../lib/types'
import { t } from '../lib/i18n'

interface TeamIdentityCardProps {
  seasonId: string
  leagueId: string
  uid: string
  /** The stored name, straight from the roster listener. */
  teamName: string
  /** The stored colour, or the fallback one this team is being drawn in. */
  teamColor: AccentColor
  /** Colours other teams in this season hold. */
  takenColors: AccentColor[]
  /** Which team holds a taken colour, for the swatch's label. */
  takenLabel?: (color: AccentColor) => string | undefined
  /** setup | draft | active | complete — from the season listener. */
  seasonState: SeasonState
}

/**
 * Your team: what it is called and what colour it is.
 *
 * Offered wherever a member can see the season — the season page in every
 * state, and the draft room — rather than only in the draft. Naming used to
 * close the moment an episode was scored, which meant a member who joined a
 * season already under way had no way to name their team at all, and anyone
 * who thought of a better joke in week three was stuck with the first one.
 * Nothing in a season depends on the name, so nothing was being protected.
 *
 * The two fields save differently on purpose. A name is the member's alone, so
 * it is typed and then committed with Save. A colour is a claim against a
 * season-wide list — see setTeamColor — so a swatch commits on click: there is
 * nothing to compose, and holding the claim behind a Save button would let two
 * members sit on the same pending choice and only find out on submit.
 */
export function TeamIdentityCard({
  seasonId,
  leagueId,
  uid,
  teamName,
  teamColor,
  takenColors,
  takenLabel,
  seasonState,
}: TeamIdentityCardProps) {
  // Once the season is under way, naming your team is something you did weeks
  // ago; while it is still being set up or drafted, an open form is easier to
  // notice than one you have to expand first.
  const startCollapsed = seasonState === 'active' || seasonState === 'complete'
  const [editing, setEditing] = useState(!startCollapsed)
  const [value, setValue] = useState(teamName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)
  // The swatch that has been clicked but whose write has not come back yet.
  // Without it the selection snaps back to the stored colour for as long as the
  // round trip takes, which reads as the click having missed.
  const [pendingColor, setPendingColor] = useState<AccentColor | null>(null)
  const [colorError, setColorError] = useState('')

  // The roster listener is the source of truth: when the stored name changes —
  // the first snapshot after load, or our own save coming back normalized —
  // the field follows it. Adjusting state during render rather than in an
  // effect keeps the input from flashing the old value for a frame.
  const [lastStored, setLastStored] = useState(teamName)
  if (teamName !== lastStored) {
    setLastStored(teamName)
    setValue(teamName)
  }

  const problem = teamNameProblem(value)
  const unchanged = normalizeTeamName(value) === teamName

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving || problem || unchanged) return

    setSaving(true)
    setError('')
    try {
      await renameTeam(seasonId, leagueId, uid, teamName, value)
      setJustSaved(true)
    } catch (cause) {
      console.error('Team rename rejected', cause)
      setError(t('team.name.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleColor(color: AccentColor) {
    if (color === teamColor) return
    setPendingColor(color)
    setColorError('')
    try {
      await setTeamColor({ seasonId, teamColor: color })
    } catch (cause) {
      // Somebody claimed it in between the roster snapshot this picker drew
      // itself from and the click. Ordinary, and worth saying plainly.
      setColorError(
        isColorTakenError(cause) ? t('team.color.takenRace') : t('team.color.saveFailed')
      )
      if (!isColorTakenError(cause)) console.error('Team colour rejected', cause)
    } finally {
      setPendingColor(null)
    }
  }

  if (!editing) {
    return (
      <div className="mb-6 flex items-center gap-2 px-4 py-2.5 text-lg">
        <TeamColorDot color={teamColor} teamName={teamName} />
        {/* The name alone. The dot beside it is the colour, and the heading
            this collapses from already said whose team it is. */}
        <span className="min-w-0 truncate text-gray-700">{teamName}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={t('team.edit')}
          title={t('team.edit')}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 hover:cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 "
        >
          {/* Sized in `em` so it tracks the line it sits on. */}
          <svg
            className="size-[1.15em]"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M13.6 2.9a1.6 1.6 0 0 1 2.3 2.3L6.8 14.3l-3 .8.8-3z" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('team.name.heading')}
        </h2>
        {/* Only where the card opened closed — otherwise there is nothing to
            go back to, and a collapse control on a season still being set up
            hides the field it is there to offer. */}
        {startCollapsed && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:cursor-pointer hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {t('common.done')}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <Input
              id="team-name"
              label={t('team.name.label')}
              hint={
                seasonState === 'setup' || seasonState === 'draft' ? t('team.name.hint') : undefined
              }
              value={value}
              maxLength={TEAM_NAME_MAX_LENGTH}
              onChange={(e) => {
                setValue(e.target.value)
                setJustSaved(false)
                setError('')
              }}
              error={
                error ||
                // Nothing typed yet is not a mistake to shout about; an emptied
                // field is only a problem once they try to save it.
                (problem === 'too-long' ? t('team.name.tooLong', { n: TEAM_NAME_MAX_LENGTH }) : '')
              }
            />
          </div>
          <Button type="submit" loading={saving} disabled={!!problem || unchanged}>
            {t('common.save')}
          </Button>
        </div>
        {problem === 'empty' && !error && (
          <p className="mt-2 text-xs text-red-600">{t('team.name.empty')}</p>
        )}
        {justSaved && unchanged && !problem && (
          <p role="status" className="mt-2 text-xs text-green-700">
            {t('team.name.saved')}
          </p>
        )}
      </form>

      <div className="mt-5 border-t border-gray-100 pt-4">
        <AccentColorPicker
          label={t('team.color.label')}
          value={pendingColor ?? teamColor}
          onChange={handleColor}
          taken={takenColors}
          takenLabel={takenLabel}
        />
        {colorError && (
          <p role="status" className="mt-2 text-xs text-red-600">
            {colorError}
          </p>
        )}
      </div>
    </div>
  )
}
