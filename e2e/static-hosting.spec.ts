import { expect, test } from '@playwright/test'

test('production build loads initial and lazy renderer assets from a static subpath', async ({
  page,
}, testInfo) => {
  const failures: string[] = []
  const assetResponses: { readonly url: string; readonly status: number }[] = []
  const allAssetResponses: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
    const pathname = new URL(response.url()).pathname
    if (pathname.includes('/assets/')) allAssetResponses.push(pathname)
    if (pathname.startsWith('/apartment-planner/assets/')) {
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
    allAssetResponses.every((pathname) =>
      pathname.startsWith('/apartment-planner/assets/'),
    ),
  ).toBe(true)
  expect(
    assetResponses.every((response) => response.status >= 200 && response.status < 300),
  ).toBe(true)
  expect(failures).toEqual([])
  const knownAsset = new URL(assetResponses[0]!.url)
  const rootAssetResponse = await page.request.get(
    new URL(knownAsset.pathname.replace('/apartment-planner', ''), base).toString(),
  )
  expect(rootAssetResponse.status()).toBe(404)
  await testInfo.attach('static-subpath-assets.json', {
    body: JSON.stringify(assetResponses, null, 2),
    contentType: 'application/json',
  })
})
