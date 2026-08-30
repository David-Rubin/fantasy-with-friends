import { useId, useState } from 'react'
import { Modal } from './Modal'
import { Button } from './Button'
import { confirmationMatches } from '../lib/deletion'
import { t } from '../lib/i18n'

interface ConfirmDeleteModalProps {
  open: boolean
  onClose: () => void
  /** Dialog heading, e.g. "Delete this league?" */
  title: string
  /** The name the admin has to type, and the thing being destroyed. */
  name: string
  /**
   * What will be destroyed, in plain words — one line per thing, already
   * counted, e.g. "3 seasons" / "12 members". Shown as a list so the scale of
   * the deletion is legible before it happens rather than after.
   */
  consequences: string[]
  /**
   * A fact about what the deletion does *not* destroy. Shown under the list of
   * consequences, because "what survives" is as much a part of understanding a
   * deletion as what does not.
   */
  note?: string
  /** Label for the confirming button. */
  confirmLabel: string
  busy?: boolean
  /** Set when the last attempt was refused, e.g. by a season still drafting. */
  error?: string
  onConfirm: () => void
}

/**
 * The one dialog behind every delete in the app.
 *
 * It asks the admin to type the name of what they are deleting. That is the
 * "additional confirmation": a second red button is still a button, and these
 * three actions are the only ones in the app with no undo behind them — a
 * deleted season takes its draft, its rosters and every episode score with it,
 * and nothing restores them.
 *
 * Typing forces the admin to read the name, which is the specific mistake worth
 * preventing: deleting the right kind of thing and the wrong one of them.
 */
function ConfirmDeleteModalBody({
  open,
  onClose,
  title,
  name,
  consequences,
  note,
  confirmLabel,
  busy,
  error,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [typed, setTyped] = useState('')
  const inputId = useId()
  const errorId = useId()

  const confirmed = confirmationMatches(typed, name)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!confirmed || busy} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">{t('delete.permanent')}</p>

        {consequences.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{t('delete.willBeDeleted')}</p>
            <ul className="mt-2 list-disc pl-5 text-sm text-red-700">
              {consequences.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {note && <p className="text-sm text-gray-500">{note}</p>}

        <div>
          <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
            {t('delete.typeToConfirm', { name })}
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            // Nothing here should be guessable by a password manager or a
            // browser's form history — the point is that it is typed.
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={error ? errorId : undefined}
            className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/**
 * Remounts the dialog each time it opens, and whenever it is pointed at a
 * different thing.
 *
 * The typed name is state that must not outlive one opening: a cancelled
 * deletion that left the name still in the box would leave the next one already
 * armed — including a deletion of something else entirely, since these dialogs
 * are reused across every row of a list. Resetting by key rather than in an
 * effect is React's own answer to state that should reset on a prop change.
 */
export function ConfirmDeleteModal(props: ConfirmDeleteModalProps) {
  return <ConfirmDeleteModalBody key={`${props.open}:${props.name}`} {...props} />
}
