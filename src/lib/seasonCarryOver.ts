import { allEpisodeNumbers } from './scoringRules'
import type { ScoringRuleDoc, SeasonDoc, SeasonMemberDoc, SeasonState } from './types'

/**
 * What a new season inherits from the one before it, decided without Firebase
 * in sight.
 *
 * A league plays the same show year after year with mostly the same people and
 * mostly the same rules, so building the second season from scratch is typing
 * out last season's answers again. The new-season dialog offers to copy three
 * things instead; this module decides which season it copies from and what each
 * copy comes out as, and ./seasonApi does the writing. Kept free of Firebase
 * for the reason given in ./seasonDetails.
 */

/** One answer to one of the three questions. Required — there is no default. */
export type CarryOverAnswer = 'yes' | 'no'

/**
 * The three questions, in the order the dialog asks them.
 *
 * Deliberately a list rather than three loose booleans: the dialog renders one
 * block per topic and the "have they answered everything" test below walks the
 * same list, so a fourth question is one entry here rather than an edit in four
 * places.
 */
export const CARRY_OVER_TOPICS = ['participants', 'scoringRules', 'draftSettings'] as const
export type CarryOverTopic = (typeof CARRY_OVER_TOPICS)[number]

export type CarryOverAnswers = Record<CarryOverTopic, CarryOverAnswer | null>

/** Nothing answered yet — what the dialog opens with. */
export const NO_CARRY_OVER_ANSWERS: CarryOverAnswers = {
  participants: null,
  scoringRules: null,
  draftSettings: null,
}

/** Whether every question has an answer, which all three of them need. */
export function carryOverAnswered(answers: CarryOverAnswers): boolean {
  return CARRY_OVER_TOPICS.every((topic) => answers[topic] !== null)
}

/** Shorthand for "this topic was answered yes". */
export function copies(answers: CarryOverAnswers, topic: CarryOverTopic): boolean {
  return answers[topic] === 'yes'
}

/**
 * The states a season has to have reached before it is worth copying.
 *
 * `active` and `complete` only. A season still in `setup` is half-written by
 * definition, and one that is `draft` has its roster and rules settled but is
 * mid-event — copying from a season nobody has finished setting up their side
 * of would carry over a decision that has not been made yet. What is left is a
 * season that was actually played, which is what "last season" means to the
 * admin reading the question.
 */
const CARRYABLE_STATES: readonly SeasonState[] = ['active', 'complete']

/** What this module needs of a season to consider copying from it. */
export interface CarryOverCandidate {
  id: string
  label: string
  state: SeasonState
  createdAt: number
}

/**
 * The season a new one offers to copy: the most recently created season of this
 * league that has been played.
 *
 * Returns null when there is none, which is what the dialog reads as "ask
 * nothing and behave as it always did". Ties on `createdAt` break on `id` so the
 * answer does not depend on the order a query happened to return — two seasons
 * created in the same millisecond is unlikely, but "unlikely" is how a listener
 * that reshuffles itself between loads gets shipped.
 */
export function carryOverSource<T extends CarryOverCandidate>(seasons: readonly T[]): T | null {
  let source: T | null = null
  for (const season of seasons) {
    if (!CARRYABLE_STATES.includes(season.state)) continue
    if (
      source === null ||
      season.createdAt > source.createdAt ||
      (season.createdAt === source.createdAt && season.id > source.id)
    ) {
      source = season
    }
  }
  return source
}

/** The draft configuration a season carries, and nothing else from its document. */
export type CarriedDraftSettings = Pick<
  SeasonDoc,
  'draftFormat' | 'pickOrderMethod' | 'timerSeconds' | 'timerExpiry'
>

/**
 * What a season is configured with when nobody copies anything — the values a
 * new season has always been created with.
 */
export const DEFAULT_DRAFT_SETTINGS: CarriedDraftSettings = {
  draftFormat: 'snake',
  pickOrderMethod: 'admin-set',
  timerSeconds: 60,
  timerExpiry: 'auto-pick',
}

/**
 * Last season's draft configuration, picked field by field.
 *
 * Named explicitly rather than spread, so a field added to SeasonDoc later
 * cannot arrive in a new season by accident. `adminPickOrder` is deliberately
 * not among them: it is a list of uids in a hand-arranged order, and carrying
 * it into a season whose roster is still being decided would promise an order
 * the draft may not keep. The admin arranges it in the setup panel, as before.
 */
export function carriedDraftSettings(season: CarriedDraftSettings): CarriedDraftSettings {
  return {
    draftFormat: season.draftFormat,
    pickOrderMethod: season.pickOrderMethod,
    timerSeconds: season.timerSeconds,
    timerExpiry: season.timerExpiry,
  }
}

/**
 * A member of last season, as a member of the new one.
 *
 * The team name comes across: it is theirs, they chose it, and a league that
 * plays the same show every year has teams with names people recognise. What
 * does not come across is anything the new season assigns for itself —
 * `pickPosition`, which belongs to a draft that has not happened, and
 * `teamColor`, which has to be unique within a season and is handed out by the
 * onSeasonMemberWritten trigger the moment this document lands.
 */
export function carriedMember(member: SeasonMemberDoc, joinedAt: number): SeasonMemberDoc {
  return {
    uid: member.uid,
    displayName: member.displayName,
    ...(member.photoUrl ? { photoUrl: member.photoUrl } : {}),
    teamName: member.teamName,
    pickPosition: null,
    joinedAt,
  }
}

/**
 * One of last season's scoring rules, as a rule of the new one.
 *
 * The episode selection is the only thing that cannot be copied as written: a
 * rule scored in episodes 1–12 means nothing in a season that runs eight. It is
 * narrowed to the episodes the new season actually has, on the same terms
 * draftToRule uses — a selection covering all of them becomes `null`, which
 * follows the season if the count changes later. See
 * ScoringRuleDoc.episodeNumbers.
 *
 * A selection that survives the narrowing with nothing left — a finale bonus
 * copied into a season shorter than the episode it named — is kept as an empty
 * list rather than quietly turned into "every episode". The rule then scores
 * nowhere and says so in the rules list, which an admin can see and fix; a rule
 * silently applying to the whole season is a scoring change nobody asked for.
 */
export function carriedRule(rule: ScoringRuleDoc, episodeCount: number): ScoringRuleDoc {
  const episodes = allEpisodeNumbers(episodeCount)
  const selected = rule.episodeNumbers
    ? episodes.filter((n) => rule.episodeNumbers!.includes(n))
    : null
  return {
    type: rule.type,
    name: rule.name,
    points: rule.points,
    episodeNumbers: selected && selected.length < episodes.length ? selected : null,
  }
}

/**
 * Last season's players, in the order the dialog lists them.
 *
 * By display name, because the list is read to answer one question — "is this
 * the group I mean?" — and a roster in Firestore's document order answers it
 * with a list that reshuffles between loads. Case- and accent-insensitive and
 * numeral-aware, matching how the roster table sorts (see ./roster).
 *
 * Returns a new array; the caller's is left alone.
 */
export function orderedParticipants<T extends { displayName: string }>(members: readonly T[]): T[] {
  return [...members].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base', numeric: true })
  )
}
