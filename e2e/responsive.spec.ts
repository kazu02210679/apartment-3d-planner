import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1440, height: 900, name: 'desktop' },
  { width: 1024, height: 768, name: 'tablet' },
  { width: 390, height: 844, name: 'mobile' },
]) {
  test(`complete visible workflow remains reachable at ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    const errors: Error[] = []
    page.on('pageerror', (error) => errors.push(error))
    await page.setViewportSize(viewport)
    await page.goto('/')
    if (viewport.width <= 820)
      await page.locator('.mobile-controls button').first().click()
    const catalog = viewport.width <= 820 ? page.getByTestId('mobile-sheet') : page
    await catalog.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
    if (viewport.width <= 820)
      await page.locator('.mobile-controls button').nth(2).click()
    const inspector = viewport.width <= 820 ? page.getByTestId('mobile-sheet') : page
    const positionX = inspector.getByTestId('position-x')
    await expect(positionX).toBeVisible()
    await positionX.fill('50')
    await positionX.press('Enter')
    await page.locator('.toolbar-button').nth(1).click()
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
    await page.getByRole('button', { name: /JSON書き出し/ }).click()
    await page.getByTestId('tool-cable').click()
    await expect(page.locator('.cable-tool')).toBeVisible()
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
  })
}
