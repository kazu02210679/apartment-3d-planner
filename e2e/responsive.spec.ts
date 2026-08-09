import { expect, test, type Page } from '@playwright/test'

async function downloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON書き出し' }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

for (const viewport of [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet' },
  { width: 390, height: 844, name: 'mobile' },
]) {
  test(`complete visible workflow remains reachable at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    const errors: Error[] = []
    const consoleErrors: string[] = []
    page.on('pageerror', (error) => errors.push(error))
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    await page.setViewportSize(viewport)
    await page.goto('/')
    const mobile = viewport.width <= 820

    if (mobile) await page.getByRole('button', { name: 'カタログ' }).click()
    else await page.locator('.tab-list button').first().click()
    const catalog = mobile ? page.getByTestId('mobile-sheet') : page
    await catalog.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
    if (mobile) await page.getByRole('button', { name: 'アウトライナー' }).click()
    else await page.locator('.tab-list button').nth(1).click()
    const outliner = mobile ? page.getByTestId('mobile-sheet') : page
    await outliner.getByRole('button', { name: /Power cable/ }).click()
    if (mobile) await page.getByRole('button', { name: 'プロパティ' }).click()
    const inspector = mobile ? page.getByTestId('mobile-sheet') : page
    await expect(inspector.getByTestId('cable-inspector')).toBeVisible()

    if (mobile) await page.getByRole('button', { name: 'シートを閉じる' }).click()
    if (mobile) await page.getByRole('button', { name: 'カタログ' }).click()
    else await page.locator('.tab-list button').first().click()
    const editCatalog = mobile ? page.getByTestId('mobile-sheet') : page
    await editCatalog.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
    if (mobile) await page.getByRole('button', { name: 'プロパティ' }).click()
    const editInspector = mobile ? page.getByTestId('mobile-sheet') : page
    const positionX = editInspector.getByTestId('position-x')
    await expect(positionX).toBeVisible()
    await positionX.fill('50')
    await positionX.press('Enter')
    await expect(positionX).toHaveValue('50')
    await page.getByRole('button', { name: '元に戻す' }).click()

    const exported = await downloadText(page)
    await page.getByRole('button', { name: 'JSON読み込み' }).click()
    await page.locator('input[type="file"]').setInputFiles({
      name: `${viewport.name}-roundtrip.json`,
      mimeType: 'application/json',
      buffer: Buffer.from(exported),
    })
    expect(await downloadText(page)).toBe(exported)

    await page.getByRole('button', { name: 'プレビュー' }).click()
    await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
      'data-renderer-profile',
      'preview',
    )
    await testInfo.attach(`${viewport.name}-preview`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    await page.getByRole('button', { name: '編集' }).click()

    if (mobile) {
      await page.getByRole('button', { name: 'カタログ' }).click()
      const scroll = await page.getByTestId('mobile-sheet').evaluate((sheet) => {
        const content = sheet.querySelector<HTMLElement>('.panel-scroll')
        if (!content) throw new Error('The mobile sheet has no scrollable panel.')
        content.scrollTop = content.scrollHeight
        const rect = content.getBoundingClientRect()
        return {
          scrollTop: content.scrollTop,
          scrollHeight: content.scrollHeight,
          clientHeight: content.clientHeight,
          top: rect.top,
          bottom: rect.bottom,
          viewportHeight: window.innerHeight,
        }
      })
      expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight)
      expect(scroll.scrollTop).toBeGreaterThan(0)
      expect(scroll.top).toBeGreaterThanOrEqual(0)
      expect(scroll.bottom).toBeLessThanOrEqual(scroll.viewportHeight)
      await page.getByRole('button', { name: 'シートを閉じる' }).click()
    }

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)
    const canvas = await page.locator('canvas').boundingBox()
    expect(canvas?.width).toBeGreaterThan(0)
    expect(canvas?.height).toBeGreaterThan(0)
    await testInfo.attach(`${viewport.name}-editor`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    expect(errors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}
