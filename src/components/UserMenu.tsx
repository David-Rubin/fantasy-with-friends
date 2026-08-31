import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Link } from 'react-router-dom'
import { UserAvatar } from './UserAvatar'
import { t } from '../lib/i18n'

interface UserMenuProps {
  displayName: string
  photoUrl?: string
  /** App-level role. Only a superadmin is offered the user directory. */
  isSuperadmin: boolean
  onLogOut: () => void
}

/**
 * The account menu behind the signed-in name.
 *
 * The destinations here used to sit in the header as bare links, which meant
 * the bar grew a link every time the app gained a page only some people can
 * reach. Collapsing them behind the name keeps the header the same width for a
 * superadmin as for everyone else.
 *
 * The name is in the accessibility tree at every width and visible from `sm`
 * up: on a phone the button is just the avatar, and without the name it would
 * announce as an unlabelled button.
 */
export function UserMenu({ displayName, photoUrl, isSuperadmin, onLogOut }: UserMenuProps) {
  // data-focus, not focus: Headless UI v2 tracks the highlighted item virtually
  // and marks it with that attribute rather than moving DOM focus to it, so a
  // plain focus: variant never fires and arrow-key users see nothing move.
  const itemClass =
    'block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 data-focus:bg-gray-100 focus:outline-none'

  return (
    <Menu as="div" className="relative">
      <MenuButton className="flex cursor-pointer items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
        <UserAvatar displayName={displayName} photoUrl={photoUrl} />
        <span className="sr-only text-sm text-gray-600 sm:not-sr-only sm:block">{displayName}</span>
      </MenuButton>

      <MenuItems className="absolute right-0 z-50 mt-2 w-48 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg focus:outline-none">
        {isSuperadmin && (
          <MenuItem>
            <Link to="/admin/users" className={itemClass}>
              {t('nav.users')}
            </Link>
          </MenuItem>
        )}
        <MenuItem>
          <Link to="/settings" className={itemClass}>
            {t('nav.settings')}
          </Link>
        </MenuItem>
        {/* Separated: the others navigate, this one ends the session. */}
        <div className="my-1 border-t border-gray-100" />
        <MenuItem>
          <button type="button" onClick={onLogOut} className={`cursor-pointer ${itemClass}`}>
            {t('nav.logOut')}
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
