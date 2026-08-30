/**
 * How the roster table orders itself, decided without Firebase in sight.
 *
 * Free of any import that reaches ./firebase, so the ordering can be asserted
 * on in CI, where the VITE_FIREBASE_* variables do not exist. The table itself
 * only renders what this returns.
 */

/** The roster's columns, in the order they are rendered. */
export const ROSTER_COLUMNS = ['contestant', 'owner', 'status'] as const
export type RosterColumn = (typeof ROSTER_COLUMNS)[number]

export type SortDirection = 'asc' | 'desc'

export interface RosterSort {
  column: RosterColumn
  direction: SortDirection
}

/**
 * Contestant, ascending — the roster is a cast list, and a cast list is read by
 * name. Every other order is something the reader has to ask for.
 */
export const DEFAULT_ROSTER_SORT: RosterSort = { column: 'contestant', direction: 'asc' }

/**
 * The sort after a header is clicked.
 *
 * Clicking a new column starts it ascending rather than carrying the previous
 * column's direction over: a first click that lands on Z–A is a click nobody
 * asked for. Clicking the column already sorted flips it.
 */
export function nextRosterSort(current: RosterSort, column: RosterColumn): RosterSort {
  if (current.column !== column) return { column, direction: 'asc' }
  return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

/**
 * A row as the table shows it: the three cells, already resolved to the text
 * the reader sees.
 *
 * Sorting works on those strings and not on the underlying documents, because
 * what a reader means by "sort by owner" is the name in front of them — not the
 * uid behind it, and not the elimination episode number behind "Eliminated".
 */
export interface RosterRowText {
  contestant: string
  owner: string
  status: string
}

/**
 * Case- and accent-insensitive, and numeral-aware, so a cast entered as
 * "Contestant 2" and "Contestant 10" reads in the order a person would write
 * it rather than in code-point order.
 */
function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
}

/**
 * The rows in the order the table should render them.
 *
 * Returns a new array; the caller's is left alone.
 *
 * Ties break on contestant name, ascending, whichever column is sorted. Without
 * that, two eliminated contestants would hold whatever order Firestore handed
 * back, which is arbitrary and changes between loads — so a roster sorted by
 * Status would visibly reshuffle itself for no reason the reader can see.
 */
export function sortRosterRows<T extends RosterRowText>(rows: readonly T[], sort: RosterSort): T[] {
  const factor = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const primary = compareText(a[sort.column], b[sort.column])
    if (primary !== 0) return primary * factor
    return compareText(a.contestant, b.contestant)
  })
}
