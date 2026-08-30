import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { adminUsersTrail } from '../lib/breadcrumbs'
import { listAllUsers } from '../lib/adminApi'
import { deleteUser, deletionErrorMessage } from '../lib/deleteApi'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { Button } from '../components/Button'
import { useAuth } from '../contexts/AuthContext'
import type { AppUser } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * Superadmin user directory: every account on the app, with display name and
 * email. The route guard only hides this page — the data behind it is gated by
 * the listAllUsers function, so reaching the URL without the role shows nothing.
 */
export function AdminUsersPage() {
  const { user: signedInUser } = useAuth()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [deleted, setDeleted] = useState('')

  /**
   * Drop the row rather than reloading the directory. listAllUsers writes an
   * audit entry every time it is called, so re-fetching to learn something the
   * call already told us would put a spurious "directory viewed" in the log
   * after every deletion.
   */
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteUser({ uid: deleteTarget.uid })
      setUsers((current) => current.filter((u) => u.uid !== deleteTarget.uid))
      setDeleted(t('admin.users.deleted', { name: deleteTarget.displayName || deleteTarget.email }))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Could not delete the account', err)
      setDeleteError(deletionErrorMessage(err, t('admin.users.deleteFailed')))
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    listAllUsers()
      .then(({ data }) => setUsers(data.users))
      .catch((err) => {
        console.error('Could not load the user directory', err)
        setError((err as { message?: string }).message ?? 'Could not load users.')
      })
      .finally(() => setLoading(false))
  }, [])

  const needle = filter.trim().toLowerCase()
  const shown = needle
    ? users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle)
      )
    : users

  return (
    <Layout breadcrumbs={adminUsersTrail()}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('admin.users.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {loading
              ? t('common.loading')
              : t('admin.users.count', { count: users.length, shown: shown.length })}
          </p>
        </div>
        {!loading && users.length > 0 && (
          <div>
            <label htmlFor="user-filter" className="sr-only">
              {t('admin.users.filter')}
            </label>
            <input
              id="user-filter"
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t('admin.users.filter')}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700"
        >
          {error}
        </p>
      )}

      {deleted && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-green-800"
        >
          {deleted}
        </p>
      )}

      {!loading && !error && shown.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-12 text-center">
          <p className="text-gray-500">
            {users.length === 0 ? t('admin.users.empty') : t('admin.users.noMatches')}
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th scope="col" className="px-5 py-3 font-semibold text-gray-700">
                  {t('admin.users.name')}
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-gray-700">
                  {t('admin.users.email')}
                </th>
                <th scope="col" className="px-5 py-3 font-semibold text-gray-700">
                  {t('admin.users.joined')}
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold text-gray-700">
                  {t('admin.users.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u) => (
                <tr key={u.uid} className="border-b border-gray-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-gray-900">{u.displayName || '—'}</td>
                  <td className="px-5 py-3 text-gray-600">{u.email || '—'}</td>
                  <td className="px-5 py-3 text-gray-500 tabular-nums">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {/* Their own row has no button rather than a disabled one:
                        deleting yourself is not a thing you are briefly unable
                        to do, it is not on offer. The function refuses it too. */}
                    {u.uid !== signedInUser?.uid && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeleteError('')
                          setDeleted('')
                          setDeleteTarget(u)
                        }}
                        className="!min-h-0 !px-3 !py-1 text-xs !text-red-700 hover:!bg-red-50"
                      >
                        {t('common.delete')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('admin.users.deleteTitle', {
          name: deleteTarget?.displayName || deleteTarget?.email || '',
        })}
        // The display name is what the directory shows and what the dialog
        // titles itself with, so that is what there is to read and retype. An
        // account with no name falls back to the email, which is never empty.
        name={deleteTarget?.displayName || deleteTarget?.email || ''}
        consequences={[t('admin.users.deleteAccount'), t('admin.users.deleteMemberships')]}
        note={t('admin.users.deleteKeeps')}
        confirmLabel={t('admin.users.delete')}
        busy={deleting}
        error={deleteError}
        onConfirm={handleDelete}
      />
    </Layout>
  )
}
