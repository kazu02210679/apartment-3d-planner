import { expect, test } from '@playwright/test'

test('opens the production planner shell without page errors', async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.goto('/')

  await expect(page).toHaveTitle('暮らしの3Dプランナー')
  await expect(page.getByRole('heading', { name: '暮らしの3Dプランナー' })).toBeVisible()
  await expect(page.getByRole('button', { name: '新規シーン' })).toBeEnabled()
  await expect(page.getByRole('button', { name: '編集' })).toBeEnabled()
  await expect(
    page.getByRole('button', { name: '高品質プレビュー', exact: true }),
  ).toBeEnabled()

  await page.getByRole('button', { name: '高品質プレビュー', exact: true }).click()
  await expect(page.getByRole('button', { name: '編集に戻る', exact: true })).toBeVisible()
  await expect(page.getByText('高品質プレビュー', { exact: true })).toBeVisible()

  expect(pageErrors).toHaveLength(0)
})
