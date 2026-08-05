import { expect, test } from '@playwright/test'

test('opens the production planner shell without page errors', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/')

  await expect(page).toHaveTitle('暮らしの3Dプランナー')
  await expect(page.getByRole('heading', { name: '暮らしの3Dプランナー' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新規シーン' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '編集' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'プレビュー' })).toBeEnabled()

  await page.getByRole('button', { name: 'プレビュー' }).click()
  await expect(page.getByRole('button', { name: 'プレビュー' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  expect(pageErrors).toHaveLength(0)
})
