import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 1280, height: 720 } })

test('numeric, nudge, and direct resize editing share the production scene state', async ({
  page,
}) => {
  await page.goto('/')

  const desk = page.locator('.catalog-item').filter({ hasText: 'L字昇降デスク' })
  await desk.getByRole('button', { name: 'L字昇降デスクを追加' }).click()
  const positionX = page.getByTestId('position-x')
  await expect(positionX).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()

  await positionX.fill('120')
  await positionX.press('Enter')
  await expect(positionX).toHaveValue('120')

  const nudge = page.getByRole('button', { name: '選択対象を右へ移動' })
  await expect(nudge).toBeEnabled()
  await nudge.click()
  await expect(positionX).toHaveValue('130')

  await page.getByRole('button', { name: 'サイズツール' }).click()
  await expect(page.getByRole('button', { name: 'サイズツール' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const dimensionsWidth = page.getByTestId('dimensions-width')
  const widthBeforePointerDrag = await dimensionsWidth.inputValue()
  const canvas = page.locator('canvas')
  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('The production canvas did not have a bounding box.')

  // Positive-width handle for the deterministically added desk, derived from
  // the fixed Desktop Chrome canvas layout and verified by inspector updates.
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.64,
    canvasBox.y + canvasBox.height * 0.53,
  )
  await page.mouse.down()
  await page.mouse.move(
    canvasBox.x + canvasBox.width * 0.69,
    canvasBox.y + canvasBox.height * 0.53,
  )
  await page.mouse.up()
  await expect(dimensionsWidth).not.toHaveValue(widthBeforePointerDrag)
  await expect(positionX).not.toHaveValue('130')
})
