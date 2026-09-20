import { useState } from 'react'
import type { DragEvent } from 'react'
import { t } from '../lib/i18n'
import { teamIds, teamNumberOf, type Assignments } from '../lib/teamAssignment'
import { UserAvatar } from './UserAvatar'
import type { SeasonMember } from '../lib/types'

interface TeamAssignmentBoardProps {
  members: SeasonMember[]
  teamCount: number
  /** The layout as it stands — see effectiveAssignments. */
  assignments: Assignments
  /** What each team is called, where one already has a name. */
  teamNames: Record<string, string>
  /** `null` takes the member off every team. */
  onAssign: (uid: string, teamId: string | null) => void
}

/**
 * Putting players on teams, by dragging them into boxes.
 *
 * One box per team, and one for everybody not yet on one. Dragging is the
 * obvious gesture, but as in PickOrderList it is not the only one offered:
 * HTML5 drag events do not fire on touch, and a dragged chip is unreachable
 * from the keyboard. Each chip therefore carries a select that does the same
 * move, which is also what a screen reader operates — and what the test
 * drives, since jsdom has no dragging.
 *
 * The board writes nothing. It reports each move to the setup panel, which
 * holds the layout beside the rest of the draft settings and saves them all
 * together.
 */
export function TeamAssignmentBoard({
  members,
  teamCount,
  assignments,
  teamNames,
  onAssign,
}: TeamAssignmentBoardProps) {
  const [draggingUid, setDraggingUid] = useState<string | null>(null)
  // Which box the drag is over, so it can say it will take the drop.
  const [overZone, setOverZone] = useState<string | null | undefined>(undefined)

  const ids = teamIds(teamCount)
  const nameOf = (teamId: string) =>
    teamNames[teamId] ?? t('team.defaultName', { n: teamNumberOf(teamId) ?? 0 })
  const inZone = (teamId: string | null) =>
    members.filter((m) => (assignments[m.uid] ?? null) === teamId)

  function dropHandlers(teamId: string | null) {
    return {
      onDragOver: (e: DragEvent) => {
        // Without this the box is not a drop target and the cursor says so.
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overZone !== teamId) setOverZone(teamId)
      },
      onDragLeave: () => setOverZone(undefined),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        const uid = draggingUid ?? e.dataTransfer.getData('text/plain')
        setDraggingUid(null)
        setOverZone(undefined)
        if (uid && (assignments[uid] ?? null) !== teamId) onAssign(uid, teamId)
      },
    }
  }

  function chip(member: SeasonMember) {
    const current = assignments[member.uid] ?? null
    return (
      <li
        key={member.uid}
        draggable
        onDragStart={(e) => {
          setDraggingUid(member.uid)
          // Firefox starts no drag at all without data on the transfer.
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', member.uid)
        }}
        onDragEnd={() => {
          setDraggingUid(null)
          setOverZone(undefined)
        }}
        className={`flex cursor-grab items-center gap-2 rounded-lg border bg-white px-2 py-1.5 text-sm shadow-sm ${
          draggingUid === member.uid ? 'border-blue-400 opacity-60' : 'border-gray-200'
        }`}
      >
        <span
          aria-hidden="true"
          title={t('team.assign.dragHandle', { name: member.displayName })}
          className="select-none text-gray-400"
        >
          {'⠿'}
        </span>
        <UserAvatar
          displayName={member.displayName}
          photoUrl={member.photoUrl}
          photoCrop={member.photoCrop}
        />
        <span className="min-w-0 flex-1 truncate text-gray-800">{member.displayName}</span>
        <select
          aria-label={t('team.assign.selectFor', { name: member.displayName })}
          value={current ?? ''}
          onChange={(e) => onAssign(member.uid, e.target.value || null)}
          className="max-w-28 rounded border border-gray-300 bg-white px-1 py-0.5 text-base sm:text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">{t('team.assign.unassigned')}</option>
          {ids.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      </li>
    )
  }

  function zone(teamId: string | null) {
    const inside = inZone(teamId)
    const isOver = overZone === teamId
    const isTeam = teamId !== null
    return (
      <section
        key={teamId ?? 'unassigned'}
        aria-label={isTeam ? nameOf(teamId) : t('team.assign.unassigned')}
        {...dropHandlers(teamId)}
        className={`flex min-h-28 flex-col rounded-xl border p-3 transition-colors ${
          isOver
            ? 'border-blue-400 bg-blue-50/70'
            : isTeam
              ? 'border-dashed border-gray-300 bg-white/60'
              : 'border-gray-200 bg-gray-50/70'
        }`}
      >
        {/* The label sits in the middle of an empty box — that is what an
            empty team looks like — and moves to the top once it has people. */}
        <div className={`text-center ${inside.length === 0 ? 'm-auto' : 'mb-2'}`}>
          <h5 className={`text-sm font-semibold ${isTeam ? 'text-gray-700' : 'text-gray-500'}`}>
            {isTeam ? nameOf(teamId) : t('team.assign.unassigned')}
          </h5>
          {inside.length === 0 && isTeam && (
            <p className="text-xs text-gray-400">{t('team.assign.emptyTeam')}</p>
          )}
        </div>
        {inside.length > 0 && <ul className="flex flex-col gap-1.5">{inside.map(chip)}</ul>}
      </section>
    )
  }

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700">{t('team.assign.heading')}</h4>
      <p className="mb-3 mt-1 text-xs text-gray-500">{t('team.assign.help')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {zone(null)}
        {ids.map((id) => zone(id))}
      </div>
    </div>
  )
}
