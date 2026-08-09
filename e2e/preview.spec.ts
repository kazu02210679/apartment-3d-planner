import { expect, test, type Page } from '@playwright/test'

async function exportedScene(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON/ }).first().click()
  const stream = await (await downloadPromise).createReadStream()
  if (!stream) throw new Error('The exported scene did not provide a readable stream.')
  let json = ''
  for await (const chunk of stream) json += chunk.toString()
  return json
}

test('preview is transient, keeps the selected workstation entity, and removes direct editing chrome', async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.goto('/')
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'editor',
  )

  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  const selectedId = await page.locator('.inspector-title .muted-copy').textContent()
  if (!selectedId)
    throw new Error('The selected desk did not expose its stable entity ID.')
  const before = await exportedScene(page)

  await page.locator('.mode-switch .mode-button').nth(1).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  await expect(page.locator('.tool-switch .mode-button').first()).toBeDisabled()
  await expect(page.locator('.inspector-title .muted-copy')).toHaveText(selectedId)
  await testInfo.attach('preview-mode', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })

  const after = await exportedScene(page)
  expect(after).toBe(before)
  expect(pageErrors).toHaveLength(0)
})

test('preview visual profiles remain usable at desktop and narrow mobile viewports', async ({
  page,
}, testInfo) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  for (const viewport of [
    { width: 1440, height: 900, name: 'desktop' },
    { width: 390, height: 844, name: 'mobile' },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.locator('canvas')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)
    const editorImage = await page
      .locator('canvas')
      .evaluate((canvas) => canvas.toDataURL())
    await testInfo.attach(`${viewport.name}-editor`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    })

    await page.locator('.mode-switch .mode-button').nth(1).click()
    await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
      'data-renderer-profile',
      'preview',
    )
    const previewImage = await page
      .locator('canvas')
      .evaluate((canvas) => canvas.toDataURL())
    expect(previewImage).not.toBe(editorImage)
    await testInfo.attach(`${viewport.name}-preview`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  }

  expect(pageErrors).toHaveLength(0)
})
