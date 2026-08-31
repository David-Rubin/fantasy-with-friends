import { test, expect } from '@playwright/test'

// These tests run against the Firebase emulator suite.
// Start emulators with: firebase emulators:start --only auth,firestore,functions,storage

test.describe('Auth flow', () => {
  test('landing page shows sign up and log in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /fantasy/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible()
    // Scoped to the nav: the hero repeats the same link, and an unscoped
    // locator matches both.
    await expect(page.getByRole('navigation').getByRole('link', { name: /log in/i })).toBeVisible()
  })

  test('sign up page renders form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible()
    await expect(page.getByLabel(/display name/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
  })

  test('login page renders form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /log in/i })).toBeVisible()
  })

  test('unauthenticated access to dashboard redirects to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  // Leagues are browsable by any signed-in user, which is not the same as
  // public: without an account there is nothing to see.
  test('unauthenticated access to a league page redirects to login', async ({ page }) => {
    await page.goto('/leagues/test-league')
    await expect(page).toHaveURL(/\/login/)
  })
})

/**
 * Who a login lands on, and whose session a tab holds.
 *
 * The rule under test: a captured path is followed only in a tab nobody has
 * signed in to yet. Once someone has been signed in here, the next person goes
 * to their own dashboard rather than to whatever the last person was reading.
 */

let seq = 0
const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${seq++}@example.com`

const PASSWORD = 'abcd1234'

async function signUp(page: import('@playwright/test').Page, displayName: string, email: string) {
  await page.goto('/signup')
  await page.getByLabel(/display name/i).fill(displayName)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^sign up$/i }).click()
  // Creating the account signs you in, so there is nowhere to land but inside.
  await expect(page).toHaveURL(/\/dashboard$/)
}

/** Log out lives behind the account menu now, not in the header. */
async function logOut(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: /account menu|log out/i })
    .or(page.locator('[id^="headlessui-menu-button"]'))
    .first()
    .click()
  await page.getByRole('menuitem', { name: /^log out$/i }).click()
}

/** Assumes the login form is already on screen. */
async function logIn(page: import('@playwright/test').Page, email: string) {
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(PASSWORD)
  await page.getByRole('button', { name: /^log in$/i }).click()
}

test.describe('Landing after login', () => {
  test('a second user in the same tab lands on their dashboard, not the first user’s page', async ({
    page,
  }) => {
    const ada = uniqueEmail('ada')
    const bob = uniqueEmail('bob')
    await signUp(page, 'Ada Owner', ada)
    await signUp(page, 'Bob Member', bob)
    await logOut(page)

    await page.goto('/login')
    await logIn(page, ada)
    await expect(page).toHaveURL(/\/dashboard$/)

    await logOut(page)
    await expect(page).toHaveURL(/\/$/)

    // Ada's page is no longer offered to whoever logs in next: the bounce keeps
    // no redirect at all, so Bob cannot be dropped onto it.
    await page.goto('/leagues/test-league')
    await expect(page).toHaveURL(/\/login$/)

    await logIn(page, bob)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('a shared link still works in a tab nobody has signed in to', async ({ browser }) => {
    const setup = await browser.newContext()
    const mia = uniqueEmail('mia')
    await signUp(await setup.newPage(), 'Mia Requester', mia)
    await setup.close()

    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/leagues/test-league')
    await expect(page).toHaveURL(/\/login\?redirect=%2Fleagues%2Ftest-league$/)

    await logIn(page, mia)
    await expect(page).toHaveURL(/\/leagues\/test-league$/)
    await context.close()
  })
})

test.describe('Per-tab sessions', () => {
  // Only true with VITE_TAB_SCOPED_AUTH=true; with the flag off, Firebase's
  // shared persistence means the second login takes over both tabs by design.
  test.skip(
    process.env.VITE_TAB_SCOPED_AUTH !== 'true',
    'requires VITE_TAB_SCOPED_AUTH=true in the dev server’s environment'
  )

  test('two tabs hold two different users at once', async ({ browser }) => {
    const context = await browser.newContext()
    const ada = uniqueEmail('ada')
    const bob = uniqueEmail('bob')

    const first = await context.newPage()
    await signUp(first, 'Ada Owner', ada)
    await signUp(first, 'Bob Member', bob)
    await logOut(first)

    await first.goto('/login')
    await logIn(first, ada)
    await expect(first).toHaveURL(/\/dashboard$/)

    const second = await context.newPage()
    await second.goto('/login')
    await logIn(second, bob)
    await expect(second).toHaveURL(/\/dashboard$/)

    // Bob signing in must not have displaced Ada, and a reload must not pick up
    // Bob's session from a store the two tabs share.
    await first.reload()
    await expect(first.getByText('Ada Owner')).toBeVisible()
    await expect(second.getByText('Bob Member')).toBeVisible()

    // The tab strip is what tells them apart without switching tabs.
    await expect(first).toHaveTitle('RealTV Draft — Ada Owner')
    await expect(second).toHaveTitle('RealTV Draft — Bob Member')

    await context.close()
  })
})

/**
 * The password is actually checked.
 *
 * Worth an explicit test because for a while it was not: login took an email and
 * handed back a session for it, and nothing in the suite noticed.
 */
test.describe('Passwords', () => {
  test('the wrong password does not get you in', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const ada = uniqueEmail('ada')

    await signUp(page, 'Ada Owner', ada)
    await logOut(page)

    await page.goto('/login')
    await page.getByLabel(/email/i).fill(ada)
    await page.getByLabel(/password/i).fill('not-the-password')
    await page.getByRole('button', { name: /^log in$/i }).click()

    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    await context.close()
  })

  test('changing your password on the settings page takes effect', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    const bob = uniqueEmail('bob')
    const nextPassword = 'wxyz5678'

    await signUp(page, 'Bob Member', bob)
    // The account page opens on User Info; the password form is its own view.
    await page.goto('/settings?tab=password')

    // By id, not by label: "New password" is also a substring of "Confirm new
    // password", and the required marker sits inside the label element.
    await page.locator('#current-password').fill(PASSWORD)
    await page.locator('#new-password').fill(nextPassword)
    await page.locator('#confirm-new-password').fill(nextPassword)
    await page.getByRole('button', { name: /^change password$/i }).click()
    await expect(page.getByRole('status')).toBeVisible()

    await logOut(page)
    await page.goto('/login')
    await page.getByLabel(/email/i).fill(bob)
    await page.getByLabel(/password/i).fill(nextPassword)
    await page.getByRole('button', { name: /^log in$/i }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await context.close()
  })
})
