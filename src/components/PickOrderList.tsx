import { useState } from 'react'
import { t } from '../lib/i18n'
import { movePickOrder } from '../lib/draft'
import { UserAvatar } from './UserAvatar'

export interface PickOrderPlayer {
  uid: string
  displayName: string
  photoUrl?: string
}

interface PickOrderListProps {
  /** The roster, keyed by uid — order here does not matter. */
  players: PickOrderPlayer[]
  /** The arrangement, as uids. Every player is expected to appear exactly once. */
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
export function PickOrderList({ players, order, onChange }: PickOrderListProps) {
  const [draggingUid, setDraggingUid] = useState<string | null>(null)

  const byUid = new Map(players.map((p) => [p.uid, p]))
  const rows = order.map((uid) => byUid.get(uid)).filter((p): p is PickOrderPlayer => Boolean(p))

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">{t('draft.pickOrder.empty')}</p>
  }

  function move(from: number, to: number) {
    const next = movePickOrder(order, from, to)
    if (next !== order) onChange(next)
  }

  return (
    <ol className="flex max-w-md flex-col gap-2">
      {rows.map((player, index) => (
        <li
          key={player.uid}
          draggable
          onDragStart={(e) => {
            setDraggingUid(player.uid)
            // Firefox starts no drag at all without data on the transfer.
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', player.uid)
          }}
          onDragEnd={() => setDraggingUid(null)}
          onDragOver={(e) => {
            // Without this the row is not a drop target and the cursor says so.
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }}
          onDragEnter={() => {
            if (!draggingUid || draggingUid === player.uid) return
            move(order.indexOf(draggingUid), index)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDraggingUid(null)
          }}
          className={`flex cursor-grab items-center gap-3 rounded-lg border bg-white px-3 py-2 ${
            draggingUid === player.uid
              ? 'border-blue-400 opacity-60 ring-2 ring-blue-200'
              : 'border-gray-200'
          }`}
        >
          <span
            aria-hidden="true"
            title={t('draft.pickOrder.dragHandle', { name: player.displayName })}
            className="select-none text-gray-400"
          >
            {'⠿'}
          </span>
          <span className="w-14 shrink-0 text-xs font-medium text-gray-500">
            {t('draft.pickOrder.position', { n: index + 1 })}
          </span>
          <UserAvatar displayName={player.displayName} photoUrl={player.photoUrl} />
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
            {player.displayName}
          </span>
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => move(index, index - 1)}
              disabled={index === 0}
              aria-label={t('draft.pickOrder.moveUp', { name: player.displayName })}
              className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              {'▲'}
            </button>
            <button
              type="button"
              onClick={() => move(index, index + 1)}
              disabled={index === rows.length - 1}
              aria-label={t('draft.pickOrder.moveDown', { name: player.displayName })}
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
