import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Input } from './Input'
import { Modal } from './Modal'
import { RuleSummary } from './ScoringRulesPanel'
import {
  DEFAULT_DRAFT_SETTINGS,
  NO_CARRY_OVER_ANSWERS,
  carriedDraftSettings,
  carriedMember,
  carriedRule,
  carryOverAnswered,
  carryOverSource,
  copies,
  orderedParticipants,
  type CarriedDraftSettings,
  type CarryOverAnswers,
  type CarryOverTopic,
} from '../lib/seasonCarryOver'
import { createSeason, readCarryOverSource, type CarryOverSourceData } from '../lib/seasonApi'
import type { Season, SeasonMemberDoc } from '../lib/types'
import { t } from '../lib/i18n'

/** A member of the league, as this dialog needs them. */
export interface LeagueRosterEntry {
  uid: string
  displayName: string
  photoUrl?: string
}

interface NewSeasonModalProps {
  /**
   * Whether the dialog is on screen. Nothing in here resets itself when this
   * goes true — the league page remounts the dialog instead, by changing its
   * `key` as it opens it, so a half-filled form is gone the next time rather
   * than cleared by an effect nobody can see the order of.
   */
  open: boolean
  onClose: () => void
  leagueId: string
  /** Every season of this league, which is where the one to copy comes from. */
  seasons: Season[]
  /** The league's current roster — who a first season starts with. */
  leagueMembers: LeagueRosterEntry[]
  /** Called with the new season's id once it and everything under it exist. */
  onCreated: (seasonId: string) => void
}

/**
 * Creating a season, and deciding what it inherits from the last one.
 *
 * A league plays one show, season after season, with much the same people and
 * much the same rules — so the second season used to mean typing last season's
 * answers out again. Where there is a season worth copying from, this asks
 * three questions before creating anything: the roster, the scoring rules and
 * the draft configuration, each with last season's answer available to read
 * before deciding.
 *
 * The questions are only asked when there is a season to copy — see
 * carryOverSource. Without one this is the dialog it always was: a label, an
 * episode count, and the league's current members added to the season.
 *
 * Which season is copied is named in every question rather than left to "the
 * previous season", because a league with three seasons behind it has no way to
 * know which one that means.
 */
export function NewSeasonModal({
  open,
  onClose,
  leagueId,
  seasons,
  leagueMembers,
  onCreated,
}: NewSeasonModalProps) {
  const [form, setForm] = useState({ label: '', episodeCount: '' })
  const [answers, setAnswers] = useState<CarryOverAnswers>(NO_CARRY_OVER_ANSWERS)
  const [expanded, setExpanded] = useState<Record<CarryOverTopic, boolean>>({
    participants: false,
    scoringRules: false,
    draftSettings: false,
  })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [sourceData, setSourceData] = useState<CarryOverSourceData | null>(null)
  const [sourceError, setSourceError] = useState(false)

  const source = useMemo(() => carryOverSource(seasons), [seasons])

  // Last season is read when the dialog opens, not while the league page sits
  // idle: it is two collection reads that only matter to an admin who is about
  // to create a season.
  useEffect(() => {
    if (!open || !source) return
    let live = true
    readCarryOverSource(source.id)
      .then((data) => {
        if (live) setSourceData(data)
      })
      .catch((error) => {
        console.error('Could not read the previous season', error)
        if (live) setSourceError(true)
      })
    return () => {
      live = false
    }
  }, [open, source])

  // Derived rather than a flag of its own: the read is in flight exactly while
  // there is a season to copy and neither its data nor a failure has arrived.
  // A flag would have to be set from inside the effect, and the one thing worse
  // than a spinner is a spinner an early return forgot to turn off.
  const loadingSource = source !== null && sourceData === null && !sourceError

  // The questions are only honest once last season is in hand: offering to copy
  // rules nobody could read would be a promise the create could not keep, so a
  // failed read falls back to the dialog's behaviour without a previous season.
  const offered = source !== null && sourceData !== null && !sourceError

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (creating) return
    // The radios carry `required`, so the browser stops an unanswered form
    // before this runs. Asked again here because "required" is the whole point
    // of the question: a browser that let it through would otherwise create a
    // season out of answers nobody gave.
    if (offered && !carryOverAnswered(answers)) {
      setCreateError(t('season.carryOver.required'))
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const episodeCount = parseInt(form.episodeCount, 10)
      const now = Date.now()
      const copyParticipants = offered && copies(answers, 'participants')
      const copyRules = offered && copies(answers, 'scoringRules')
      const copySettings = offered && copies(answers, 'draftSettings')

      // Without a season to copy from, a new season starts with the league as
      // it stands — which is what creating one has always done. With one, the
      // admin has just been asked, and "No" means nobody: league members let
      // themselves in from the league page while the season is in setup.
      const members: SeasonMemberDoc[] = copyParticipants
        ? (sourceData?.members ?? []).map((member) => carriedMember(member, now))
        : offered
          ? []
          : leagueMembers.map((member) => ({
              uid: member.uid,
              displayName: member.displayName,
              ...(member.photoUrl ? { photoUrl: member.photoUrl } : {}),
              teamName: `${member.displayName}'s Team`,
              pickPosition: null,
              joinedAt: now,
            }))

      const seasonId = await createSeason({
        leagueId,
        label: form.label.trim(),
        episodeCount,
        draftSettings:
          copySettings && source ? carriedDraftSettings(source) : DEFAULT_DRAFT_SETTINGS,
        members,
        scoringRules: copyRules
          ? (sourceData?.scoringRules ?? []).map((rule) => carriedRule(rule, episodeCount))
          : [],
        ...(copyParticipants || copyRules || copySettings
          ? { copiedFromSeasonId: source!.id }
          : {}),
      })
      onCreated(seasonId)
    } catch (error) {
      console.error('Could not create the season', error)
      setCreateError(t('season.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const participants = orderedParticipants(sourceData?.members ?? [])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('season.create')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {/* Off while last season is still being read: the questions below
              are not on screen yet, and a season created in that window would
              silently take the answers nobody was offered. */}
          <Button form="new-season-form" type="submit" loading={creating} disabled={loadingSource}>
            {t('season.create')}
          </Button>
        </>
      }
    >
      <form id="new-season-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label={t('season.label')}
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Season 15 — 2026"
          required
          autoFocus
        />
        <Input
          label={t('season.episodeCount')}
          type="number"
          min={1}
          value={form.episodeCount}
          onChange={(e) => setForm((f) => ({ ...f, episodeCount: e.target.value }))}
          required
        />

        {source && loadingSource && (
          <p className="text-sm text-gray-400">
            {t('season.carryOver.loading', { season: source.label })}
          </p>
        )}

        {source && sourceError && (
          <p className="text-sm text-amber-700">
            {t('season.carryOver.loadFailed', { season: source.label })}
          </p>
        )}

        {/* Divided rather than merely spaced: three questions of the same shape
            run together into one wall of radios otherwise, and the preview
            panel under each one makes that worse. */}
        {offered && source && sourceData && (
          <div className="flex flex-col divide-y divide-gray-200 border-t border-gray-200">
            <CarryOverQuestion
              topic="participants"
              question={t('season.carryOver.participants', { season: source.label })}
              answer={answers.participants}
              onAnswer={(value) => setAnswers((a) => ({ ...a, participants: value }))}
              expanded={expanded.participants}
              onToggle={() => setExpanded((e) => ({ ...e, participants: !e.participants }))}
              showLabel={t('season.carryOver.showParticipants')}
              hideLabel={t('season.carryOver.hideParticipants')}
            >
              {participants.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {t('season.carryOver.noParticipants', { season: source.label })}
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {participants.map((member) => (
                    <li key={member.uid} className="text-sm text-gray-700">
                      {member.displayName}
                    </li>
                  ))}
                </ul>
              )}
            </CarryOverQuestion>

            <CarryOverQuestion
              topic="scoringRules"
              question={t('season.carryOver.scoringRules', { season: source.label })}
              answer={answers.scoringRules}
              onAnswer={(value) => setAnswers((a) => ({ ...a, scoringRules: value }))}
              expanded={expanded.scoringRules}
              onToggle={() => setExpanded((e) => ({ ...e, scoringRules: !e.scoringRules }))}
              showLabel={t('season.carryOver.showScoringRules')}
              hideLabel={t('season.carryOver.hideScoringRules')}
            >
              {sourceData.scoringRules.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {t('season.carryOver.noScoringRules', { season: source.label })}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sourceData.scoringRules.map((rule) => (
                    <li key={rule.id}>
                      <RuleSummary rule={rule} />
                    </li>
                  ))}
                </ul>
              )}
            </CarryOverQuestion>

            <CarryOverQuestion
              topic="draftSettings"
              question={t('season.carryOver.draftSettings', { season: source.label })}
              answer={answers.draftSettings}
              onAnswer={(value) => setAnswers((a) => ({ ...a, draftSettings: value }))}
              expanded={expanded.draftSettings}
              onToggle={() => setExpanded((e) => ({ ...e, draftSettings: !e.draftSettings }))}
              showLabel={t('season.carryOver.showDraftSettings')}
              hideLabel={t('season.carryOver.hideDraftSettings')}
            >
              <DraftSettingsSummary settings={carriedDraftSettings(source)} />
            </CarryOverQuestion>
          </div>
        )}

        {createError && <p className="text-sm text-red-600">{createError}</p>}
      </form>
    </Modal>
  )
}

/**
 * One yes/no question, with last season's answer to it behind a toggle.
 *
 * A `<fieldset>` and `<legend>` rather than a paragraph and two labels: the two
 * radios are one control answering one question, and that is the only markup
 * that says so to a screen reader.
 *
 * `required` on both inputs is what makes the question required — a constraint
 * the browser enforces on submit and names on screen, rather than a disabled
 * Create button that never explains itself. Nothing here is a security
 * boundary: the answers only decide what the admin's own writes contain.
 */
function CarryOverQuestion({
  topic,
  question,
  answer,
  onAnswer,
  expanded,
  onToggle,
  showLabel,
  hideLabel,
  children,
}: {
  topic: CarryOverTopic
  question: string
  answer: CarryOverAnswers[CarryOverTopic]
  onAnswer: (value: 'yes' | 'no') => void
  expanded: boolean
  onToggle: () => void
  showLabel: string
  hideLabel: string
  children: ReactNode
}) {
  const panelId = `carry-over-${topic}-preview`
  return (
    <fieldset className="flex flex-col gap-2 py-4">
      {/* The asterisk matches the one Input puts beside a required field, so
          the two kinds of required control on this form look required in the
          same way. */}
      <legend className="mb-2 text-sm font-medium text-gray-700">
        {question}
        <span aria-hidden="true" className="ml-1 text-red-500">
          *
        </span>
      </legend>
      {(['yes', 'no'] as const).map((value) => (
        <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="radio"
            name={`carry-over-${topic}`}
            value={value}
            checked={answer === value}
            onChange={() => onAnswer(value)}
            required
            className="h-4 w-4 cursor-pointer border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {value === 'yes' ? t('common.yes') : t('common.no')}
        </label>
      ))}
      {/* Under the "No" option, where the question is being turned down and
          "what exactly am I turning down?" is the thing left to ask. */}
      <div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="cursor-pointer rounded text-sm font-medium text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {expanded ? hideLabel : showLabel}
        </button>
      </div>
      {/* Kept mounted and hidden rather than unmounted, so `aria-controls`
          always names something that exists. */}
      <div
        id={panelId}
        hidden={!expanded}
        className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
      >
        {children}
      </div>
    </fieldset>
  )
}

const pickOrderLabels: Record<CarriedDraftSettings['pickOrderMethod'], string> = {
  'admin-set': 'draft.pickOrder.adminSet',
  randomized: 'draft.pickOrder.randomized',
}

const timerExpiryLabels: Record<CarriedDraftSettings['timerExpiry'], string> = {
  'auto-pick': 'draft.timerExpiry.autoPick',
  'admin-picks': 'draft.timerExpiry.adminPicks',
  skip: 'draft.timerExpiry.skip',
}

/**
 * Last season's draft configuration, read-only.
 *
 * The same four settings the setup panel edits, under the same labels, so what
 * is being copied is recognisable as what will be there afterwards.
 */
function DraftSettingsSummary({ settings }: { settings: CarriedDraftSettings }) {
  const rows: Array<[string, string]> = [
    [t('draft.format'), t('draft.format.snake')],
    [t('draft.pickOrder'), t(pickOrderLabels[settings.pickOrderMethod])],
    // 'draft.timerPerPick' rather than the setup panel's label, which ends in
    // "(seconds)" for the sake of its number box and reads as a stutter beside
    // a value that says seconds itself.
    [t('draft.timerPerPick'), t('draft.timerSecondsValue', { n: settings.timerSeconds })],
    [t('draft.timerExpiry'), t(timerExpiryLabels[settings.timerExpiry])],
  ]
  return (
    <dl className="flex flex-col gap-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap justify-between gap-2 text-sm">
          <dt className="text-gray-500">{label}</dt>
          <dd className="font-medium text-gray-700">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
