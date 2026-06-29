import { test, expect } from '@playwright/test'

test.describe('Scoring (smoke tests — requires emulator)', () => {
  test('episode scoring page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/leagues/test-league/seasons/test-season/score/1')
    await expect(page).toHaveURL(/\/login/)
  })

  test('season awards page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/leagues/test-league/seasons/test-season/awards')
    await expect(page).toHaveURL(/\/login/)
  })
})
