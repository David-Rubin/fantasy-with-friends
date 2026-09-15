import { useState } from 'react'
import { t } from '../lib/i18n'
import { movePickOrder } from '../lib/draft'
import { PlayerAvatars, playerNames, type EntryPlayer } from './PlayerAvatars'
import { accentLeftBorder } from './accentStyles'
import { teamColorFor } from '../lib/teamColor'
import type { AccentColor } from '../lib/types'

/**
 * One row of the order: a member in a solo season, a team in team mode. See
 * src/lib/entries.ts — `key` is what the saved order holds.
 */
export interface PickOrderRow {
  key: string
  /** What the row is called: the member's name, or the team's. */
  label: string
  players: EntryPlayer[]
  /** Absent on a roster row written before teams had colours. */
  teamColor?: AccentColor
}

interface PickOrderListProps {
  /** The entries, keyed — order here does not matter. */
  rows: PickOrderRow[]
  /** The arrangement, as entry keys. Every row is expected to appear exactly once. */
  order: string[]
  onChange: (order: string[]) => void
}

/**
 * The draft order, arranged by hand.
 *
 * Dragging is the obvious gesture for a short list, but it is not the only one
 * offered: HTML5 drag events do not fire on touch at all, and a dragged row is
 * unreachable from the keyboard. Each row therefore carries earlier/later
 * buttons that do the same thing, which is also what a screen reader announces
 * and operates.
 *
 * Rows reorder as the pointer passes over them rather than only on drop, so
 * what you are about to get is what you are already looking at.
 */
export function PickOrderList({ rows: entries, order, onChange }: PickOrderListProps) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null)

  const byKey = new Map(entries.map((p) => [p.key, p]))
  const rows = order.map((key) => byKey.get(key)).filter((p): p is PickOrderRow => Boolean(p))

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{t('draft.pickOrder.empty')}</p>
  }

  function move(from: number, to: number) {
    const next = movePickOrder(order, from, to)
    if (next !== order) onChange(next)
  }

  return (
    <ol className="flex max-w-md flex-col gap-2">
      {rows.map((row, index) => (
        <li
          key={row.key}
          draggable
          onDragStart={(e) => {
            setDraggingKey(row.key)
            // Firefox starts no drag at all without data on the transfer.
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', row.key)
          }}
          onDragEnd={() => setDraggingKey(null)}
          onDragOver={(e) => {
            // Without this the row is not a drop target and the cursor says so.
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDragEnter={() => {
            if (!draggingKey || draggingKey === row.key) return
            move(order.indexOf(draggingKey), index)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDraggingKey(null)
          }}
          className={`flex cursor-grab items-center gap-3 rounded-lg border border-l-4 bg-white px-3 py-2 ${
            accentLeftBorder[teamColorFor(row)]
          } ${
            draggingKey === row.key
              ? 'border-blue-400 opacity-60 ring-2 ring-blue-200'
              : 'border-gray-200'
          }`}
        >
          <span
            aria-hidden="true"
            title={t('draft.pickOrder.dragHandle', { name: row.label })}
            className="select-none text-gray-400"
          >
            {'⠿'}
          </span>
          <span className="w-14 shrink-0 text-xs font-medium text-gray-500">
            {t('draft.pickOrder.position', { n: index + 1 })}
          </span>
          <PlayerAvatars players={row.players} />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
            {row.label}
            {/* A team's players, after its name — one line, so a row stays a
                row. Nothing extra for a member, whose label is their name. */}
            {row.players.length > 1 && (
              <span className="text-gray-400"> · {playerNames(row.players)}</span>
            )}
          </span>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={t('draft.pickOrder.moveUp', { name: row.label })}
              className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {'▲'}
            </button>
            <button
              type="button"
              onClick={() => move(index, index + 1)}
              disabled={index === rows.length - 1}
              aria-label={t('draft.pickOrder.moveDown', { name: row.label })}
              className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {'▼'}
            </button>
          </span>
        </li>
      ))}
    </ol>
  )
}
