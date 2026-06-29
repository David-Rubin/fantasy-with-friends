import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { t } from '../lib/i18n'

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <nav className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-lg font-bold text-gray-900">{t('nav.appName')}</span>
          <div className="flex gap-3">
            <Link to="/login">
              <Button variant="secondary">{t('auth.logIn')}</Button>
            </Link>
            <Link to="/signup">
              <Button>{t('auth.signUp')}</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">
          Fantasy leagues for reality TV
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          Draft your favourite contestants, earn points each episode, and compete with friends
          across any reality show — Bake Off, Survivor, Drag Race, and more.
        </p>
        <div className="mt-8 flex gap-4">
          <Link to="/signup">
            <Button className="px-6">Get started</Button>
          </Link>
          <Link to="/login">
            <Button variant="secondary" className="px-6">{t('auth.logIn')}</Button>
          </Link>
        </div>
      </main>
    </div>
  )
}
