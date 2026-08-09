import { expect, test, type Page } from '@playwright/test'

async function exportedScene(page: Page): Promise<Record<string, unknown>> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON書き出し/ }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return JSON.parse(text) as Record<string, unknown>
}

test('first run exposes the local Future Workstation and preserves entities while room bounds change', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '暮らしの3Dプランナー' })).toBeVisible()
  await expect(page.locator('.save-state')).toHaveText('未保存')
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  expect(await page.locator('canvas, .renderer-fallback').count()).toBeGreaterThan(0)
  await expect(page.getByText('1畳 = 1.62 m²')).toBeVisible()

  const presets = [
    ['6-tatami', '2700', '3600'],
    ['8-tatami', '3600', '3600'],
    ['10-tatami', '3600', '4500'],
    ['12-tatami', '3600', '5400'],
  ] as const
  const select = page.getByLabel('部屋プリセット')
  const dimensions = page.locator('.inspector-content input[type="number"]')
  for (const [preset, width, depth] of presets) {
    await select.selectOption(preset)
    await expect(dimensions.nth(0)).toHaveValue(width)
    await expect(dimensions.nth(1)).toHaveValue(depth)
  }

  const before = await exportedScene(page)
  const beforeEntities = JSON.stringify(before.entities)
  const beforeConnections = JSON.stringify(before.connections)
  await dimensions.nth(0).fill('1000')
  await dimensions.nth(0).press('Enter')
  await expect(page.locator('.warning-box li')).not.toHaveCount(0)
  const after = await exportedScene(page)
  expect(JSON.stringify(after.entities)).toBe(beforeEntities)
  expect(JSON.stringify(after.connections)).toBe(beforeConnections)
  expect((after.room as { width: number }).width).toBe(1000)

  await page.locator('.toolbar-button').nth(1).click()
  await expect(dimensions.nth(0)).toHaveValue('3600')
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
