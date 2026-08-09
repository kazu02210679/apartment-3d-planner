import { expect, test } from '@playwright/test'

test('production build loads initial and lazy renderer assets from a static subpath', async ({
  page,
}, testInfo) => {
  const failures: string[] = []
  const assetResponses: { readonly url: string; readonly status: number }[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
    if (new URL(response.url()).pathname.startsWith('/apartment-planner/assets/')) {
      assetResponses.push({ url: response.url(), status: response.status() })
    }
  })

  const base = new URL(String(testInfo.project.use.baseURL))
  await page.goto(new URL('/apartment-planner/', base).toString())
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  const javascriptAssets = assetResponses.filter((response) =>
    response.url.endsWith('.js'),
  )
  expect(javascriptAssets.length).toBeGreaterThanOrEqual(2)
  expect(
    assetResponses.every((response) => response.status >= 200 && response.status < 300),
  ).toBe(true)
  expect(failures).toEqual([])
  await testInfo.attach('static-subpath-assets.json', {
    body: JSON.stringify(assetResponses, null, 2),
    contentType: 'application/json',
  })
})
