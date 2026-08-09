import { expect, test } from '@playwright/test'

test('numeric inspector edits and direct nudge share the production scene state', async ({
  page,
}) => {
  await page.goto('/')

  await page.locator('.catalog-item .small-action').nth(3).click()
  const positionX = page.getByTestId('position-x')
  await expect(positionX).toBeVisible()

  await positionX.fill('120')
  await positionX.press('Enter')
  await expect(positionX).toHaveValue('120')

  const nudge = page.getByRole('button', { name: 'Nudge selected right' })
  await expect(nudge).toBeEnabled()
  await nudge.click()
  await expect(positionX).toHaveValue('130')

  await page.getByRole('button', { name: 'Resize' }).click()
  await expect(page.getByRole('button', { name: 'Resize' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
