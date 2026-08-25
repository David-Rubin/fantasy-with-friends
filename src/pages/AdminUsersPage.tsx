import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { adminUsersTrail } from '../lib/breadcrumbs'
import { listAllUsers } from '../lib/adminApi'
import type { AppUser } from '../lib/types'
import { t } from '../lib/i18n'

/**
 * Superadmin user directory: every account on the app, with display name and
 * email. The route guard only hides this page — the data behind it is gated by
 * the listAllUsers function, so reaching the URL without the role shows nothing.
 */
export function AdminUsersPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  )
}
