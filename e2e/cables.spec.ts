import { expect, test, type Page } from '@playwright/test'

async function exportScene(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON/ }).first().click()
  const stream = await (await downloadPromise).createReadStream()
  if (!stream) throw new Error('The production export did not provide a stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

async function selectPowerCable(page: Page): Promise<void> {
  await page.locator('.tab-list button').nth(1).click()
  await page.getByRole('button', { name: /Power cable/ }).click()
  await expect(page.getByTestId('cable-inspector')).toBeVisible()
}

async function selectVisibleOption(
  select: ReturnType<Page['getByTestId']>,
  label: RegExp,
): Promise<void> {
  const option = select.locator('option').filter({ hasText: label })
  await select.selectOption(
    await option.evaluate((element) => element.getAttribute('value')!),
  )
}

test('cable routing remains editable, persistable, and preview-invariant in production', async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto('/')
  await selectPowerCable(page)
  await page.getByTestId('cable-end-end-a-detach').click()
  await expect(page.getByTestId('cable-end-end-a-x')).toBeVisible()

  await page.getByTestId('tool-cable').click()
  await selectVisibleOption(page.getByTestId('cable-tool-end'), /Power cable \/ End A/)
  await page.getByTestId('cable-tool-begin').click()
  await selectVisibleOption(
    page.getByTestId('cable-tool-target'),
    /Power strip one \/ Outlet/,
  )
  await page.getByTestId('cable-tool-complete').click()
  await selectPowerCable(page)
  await page.getByTestId('cable-end-end-a-detach').click()
  const endX = page.getByTestId('cable-end-end-a-x')
  await endX.fill('321')
  await endX.press('Enter')
  await expect(endX).toHaveValue('321')

  await page.getByTestId('cable-waypoint-add').click()
  const waypointX = page.locator('[data-testid^="cable-waypoint-"][data-testid$="-x"]')
  await expect(waypointX).toHaveCount(1)
  await waypointX.fill('42')
  await waypointX.press('Enter')
  await expect(waypointX).toHaveValue('42')
  const waypointId = (await waypointX.getAttribute('data-testid'))!.slice(
    'cable-waypoint-'.length,
    -'-x'.length,
  )
  await page.getByTestId(`cable-waypoint-${waypointId}-delete`).click()
  await expect(waypointX).toHaveCount(0)
  await page.getByTestId('cable-waypoint-add').click()
  await expect(waypointX).toHaveCount(1)

  await page.waitForTimeout(350)
  const editorJson = await exportScene(page)
  const parsed = JSON.parse(editorJson) as {
    entities: {
      name: string
      properties: { routing?: { waypoints: unknown[] } }
      ports: { extensions: { catalogPortId?: string }; position?: { x: number } }[]
    }[]
    connections: unknown[]
  }
  const cable = parsed.entities.find((entity) => entity.name === 'Power cable')
  expect(cable?.properties.routing?.waypoints).toHaveLength(1)
  expect(
    cable?.ports.find((port) => port.extensions.catalogPortId === 'end-a')?.position?.x,
  ).toBe(321)

  await page.getByTestId('tool-cable').click()
  await expect(page.locator('.cable-tool')).toBeVisible()
  await page.locator('.mode-switch .mode-button').nth(1).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  await expect(page.locator('.cable-tool')).toHaveCount(0)
  const previewJson = await exportScene(page)
  expect(previewJson).toBe(editorJson)
  await testInfo.attach('cables-desktop-preview', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  await page.locator('.mode-switch .mode-button').first().click()
  await page.reload()
  await selectPowerCable(page)
  await expect(page.getByTestId('cable-end-end-a-x')).toHaveValue('321')

  const upload = page.locator('input[type="file"]')
  await upload.setInputFiles({
    name: 'cables.json',
    mimeType: 'application/json',
    buffer: Buffer.from(editorJson),
  })
  await selectPowerCable(page)
  await expect(page.getByTestId('cable-end-end-a-x')).toHaveValue('321')
  expect(pageErrors).toHaveLength(0)
  expect(consoleErrors).toEqual([])
})

test('cable workflow remains usable on a narrow viewport', async ({ page }, testInfo) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('canvas')).toBeVisible()
  await page.getByTestId('tool-cable').click()
  await expect(page.locator('.cable-tool')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await testInfo.attach('cables-mobile-editor', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  expect(pageErrors).toHaveLength(0)
})
