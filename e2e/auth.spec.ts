import { test, expect } from '@playwright/test'

// These tests run against the Firebase emulator suite.
// Start emulators with: firebase emulators:start --only auth,firestore,functions,storage

test.describe('Auth flow', () => {
  test('landing page shows sign up and log in', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /fantasy/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /sign up/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /log in/i })).toBeVisible()
  })

  test('sign up page renders form', async ({ page }) => {
    await page.goto('/signup')
    await expect(page.getByRole('heading', { name: /sign up/i })).toBeVisible()
    await expect(page.getByLabel(/display name/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /sign up/i })).toBeVisible()
  })

  test('login page renders form', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: /log in/i })).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/pin/i)).toBeVisible()
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
