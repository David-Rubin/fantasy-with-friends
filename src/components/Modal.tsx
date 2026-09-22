import { Fragment, type ReactNode } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { t } from '../lib/i18n'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Replaces the default close button */
  footer?: ReactNode
  /**
   * 'wide' for a dialog that holds a list or a row of fields rather than a
   * short form. The default stays narrow, which is right for a confirmation.
   */
  size?: 'default' | 'wide'
}

export function Modal({ open, onClose, title, children, footer, size = 'default' }: ModalProps) {
  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        </Transition.Child>

        {/* Panel.
            `h-dvh` rather than `inset-0` alone. A fixed overlay is laid out
            against the *layout* viewport, which on a phone runs on behind the
            browser's own toolbars — so a sheet anchored to its bottom edge put
            its confirm button underneath the URL bar, and there was no way to
            scroll to it, because a fixed element does not scroll. The dynamic
            viewport unit is the visible area, toolbars excluded, and it
            follows them as they retract. It is `100vh` on a desktop, where
            there is nothing to exclude. */}
        <div className="fixed inset-0 h-dvh flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-full sm:translate-y-0 sm:scale-95"
          >
            <Dialog.Panel
              // `max-h-dvh` with the scrolling body inside it: the dialog as a
              // whole can never be taller than the screen, so its footer — the
              // button somebody opened it to press — is always on it. Long
              // content scrolls within the body instead of pushing the footer
              // off the bottom.
              className={`flex max-h-dvh w-full flex-col ${size === 'wide' ? 'sm:max-w-3xl' : 'sm:max-w-lg'} bg-white rounded-t-2xl sm:rounded-2xl shadow-xl`}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4">
                <Dialog.Title className="text-lg font-semibold text-gray-900">{title}</Dialog.Title>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('common.close')}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
              {footer && (
                // The safe-area inset keeps the buttons clear of the home
                // indicator, which otherwise sits over the bottom row of a
                // sheet flush with the edge of the screen.
                <div
                  className="flex shrink-0 justify-end gap-3 border-t border-gray-200 px-6 py-4"
                  style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                >
                  {footer}
                </div>
              )}
            </Dialog.Panel>
          </Transition.Child>
        </div>
      </Dialog>
    </Transition>
  )
}
