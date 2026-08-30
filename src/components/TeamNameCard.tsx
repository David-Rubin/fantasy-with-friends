import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { renameTeam } from '../lib/seasonApi'
import { normalizeTeamName, teamNameProblem, TEAM_NAME_MAX_LENGTH } from '../lib/teamName'
import { t } from '../lib/i18n'

interface TeamNameCardProps {
  seasonId: string
  leagueId: string
  uid: string
  /** The stored name, straight from the roster listener. */
  teamName: string
  /** Decided by canRenameTeam — see ../lib/teamName for where that line falls. */
  canEdit: boolean
}

/**
 * Naming your own team, in the draft room.
 *
 * It sits here rather than on the season page because that is where the name
 * matters and where it is still yours to set: the lobby, the board while the
 * draft runs, and the "Draft complete!" banner. Once the season is being
 * scored the name is on a leaderboard people are reading, so the field goes
 * read-only — enforced by the roster's `update` rule, not only here.
 */
export function TeamNameCard({ seasonId, leagueId, uid, teamName, canEdit }: TeamNameCardProps) {
  const [value, setValue] = useState(teamName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [justSaved, setJustSaved] = useState(false)

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

  if (!canEdit) {
    return (
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {t('team.name.heading')}
        </h2>
        <p className="mt-2 font-semibold text-gray-900">{teamName}</p>
        <p className="mt-1 text-xs text-gray-500">{t('team.name.locked')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        {t('team.name.heading')}
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Input
            id="team-name"
            label={t('team.name.label')}
            hint={t('team.name.hint')}
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
  )
}
