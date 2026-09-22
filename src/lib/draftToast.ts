import { entryByKey, type Entry } from './entries'
import type { Contestant, PhotoCrop } from './types'

/**
 * Deciding what the draft board should shout about.
 *
 * Every client in a draft already listens to the season's contestants, and a
 * pick is written there — `draftedByUid` goes from null to an entry key. So a
 * pick announces itself to everyone the moment the write lands, with no second
 * listener, no new collection and nothing for the security rules to authorise.
 * That is the whole mechanism: this module turns "the cast list I have now"
 * against "the cast list I had a moment ago" into the toasts to raise.
 *
 * Firebase is deliberately out of reach from here — see CLAUDE.md. The writer
 * is the draft's existing pick path; this only reads what it produced.
 */

/** How long a toast stays up before it retires itself. */
export const DRAFT_TOAST_MS = 5000

/**
 * How many toasts may be on screen at once.
 *
 * Two, because the stack has to fit whole on the shortest phone anybody uses
 * — a third card ran off the top of a 320x568 screen with its photo and its
 * dismiss button above the fold. Picks arrive one at a time in a draft, so a
 * queue this deep is already the unusual case: a pick landing beside a bench
 * assignment, or two snapshots delivered together.
 */
export const DRAFT_TOAST_MAX = 2

/** What the board knew about who held whom, keyed by contestant id. */
export type DraftedOwners = Record<string, string>

/** One announcement: a contestant, and the team that just took them. */
export interface DraftToast {
  /**
   * The contestant's id. Also the toast's identity, which is why a second
   * pick of the same contestant cannot happen — a drafted contestant is off
   * the board — and so a re-render cannot duplicate a toast already showing.
   */
  id: string
  contestantName: string
  photoUrl: string
  photoCrop?: PhotoCrop
  /** The team's name, for the sentence the toast reads out. */
  teamName: string
  /**
   * Whether the viewer plays for the entry that took the pick. In solo mode
   * that is "I picked"; in team mode it is true for every member of the team,
   * including the ones who only watched their team-mate pick.
   */
  mine: boolean
}

/** Who holds whom right now — the state to compare the next snapshot against. */
export function draftedOwners(
  contestants: Pick<Contestant, 'id' | 'draftedByUid'>[]
): DraftedOwners {
  const owners: DraftedOwners = {}
  for (const c of contestants) {
    if (c.draftedByUid) owners[c.id] = c.draftedByUid
  }
  return owners
}

/**
 * The toasts to show after `fresh` arrives, oldest first.
 *
 * A toast already showing for a contestant is replaced rather than stacked
 * beside itself — a snapshot can be re-delivered, and the same pick twice on
 * screen reads as two picks — and the oldest are dropped once the stack is
 * fuller than a short screen can hold.
 */
export function mergeDraftToasts(current: DraftToast[], fresh: DraftToast[]): DraftToast[] {
  const incoming = new Set(fresh.map((toast) => toast.id))
  const merged = [...current.filter((toast) => !incoming.has(toast.id)), ...fresh]
  return merged.slice(-DRAFT_TOAST_MAX)
}

/**
 * The picks that happened between two snapshots of the cast.
 *
 * Only undrafted → drafted counts. An admin moving somebody from one team to
 * another during bench settlement is a correction rather than a pick, and a
 * board full of toasts is not how anyone wants to be told about it.
 *
 * `previous` of null means this client has only just started listening and has
 * nothing to compare against, so nothing is announced — otherwise every pick
 * taken before you opened the page would arrive at once as if it were live.
 *
 * An empty cast is treated the same way, and that is not a nicety. A query
 * listener's first snapshot can arrive empty and be filled a beat later, so
 * priming from it recorded "nobody is drafted" and then announced the entire
 * board — which is exactly what opening a draft in progress did, three toasts
 * at once for picks taken minutes earlier. A draft cannot be running with no
 * cast, so an empty list is always the listener rather than the truth.
 */
export function newDraftToasts(
  previous: DraftedOwners | null,
  contestants: Contestant[],
  entries: Entry[],
  myKey: string | null
): DraftToast[] {
  if (!previous || contestants.length === 0) return []
  const toasts: DraftToast[] = []
  for (const c of contestants) {
    if (!c.draftedByUid) continue
    if (previous[c.id]) continue
    const entry = entryByKey(entries, c.draftedByUid)
    // A pick by an entry this client cannot name yet — a roster snapshot that
    // has not caught up. Skipped rather than announced without a team, since
    // naming the team is most of what the toast is for.
    if (!entry) continue
    toasts.push({
      id: c.id,
      contestantName: c.name,
      photoUrl: c.photoUrl,
      photoCrop: c.photoCrop,
      teamName: entry.teamName,
      mine: !!myKey && myKey === entry.key,
    })
  }
  return toasts
}
