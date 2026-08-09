import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from '@playwright/test'

test('production build loads initial and lazy renderer assets from a static subpath', async ({
  page,
}, testInfo) => {
  const failures: string[] = []
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`)
  })

  const base = new URL('http://127.0.0.1:4174')
  await page.goto(new URL('/apartment-planner/', base).toString())
  await expect(page.getByTestId('scene-canvas')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  expect(new URL(page.url()).origin).toBe(base.origin)
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ) as Record<
    string,
    {
      readonly file: string
      readonly css?: readonly string[]
      readonly dynamicImports?: readonly string[]
    }
  >
  const entry = manifest['index.html']!
  const renderer = manifest['src/renderer/SceneCanvas.tsx']!
  expect(entry.dynamicImports).toContain('src/renderer/SceneCanvas.tsx')
  const requestedUrls = [entry.file, ...(entry.css ?? []), renderer.file].map((file) =>
    new URL(`/apartment-planner/${file}`, base).toString(),
  )
  expect(
    requestedUrls.filter((url) => url.endsWith('.js')).length,
  ).toBeGreaterThanOrEqual(2)
  expect(
    requestedUrls.every((url) =>
      new URL(url).pathname.startsWith('/apartment-planner/assets/'),
    ),
  ).toBe(true)
  const requestedAssets = await Promise.all(
    requestedUrls.map(async (url) => ({
      url,
      status: (await page.request.get(url)).status(),
    })),
  )
  expect(
    requestedAssets.every((asset) => asset.status >= 200 && asset.status < 300),
  ).toBe(true)
  expect(failures).toEqual([])
  const knownAsset = new URL(requestedUrls[0]!)
  const rootAssetResponse = await page.request.get(
    new URL(knownAsset.pathname.replace('/apartment-planner', ''), base).toString(),
  )
  expect(rootAssetResponse.status()).toBe(404)
  await testInfo.attach('static-subpath-assets.json', {
    body: JSON.stringify(requestedAssets, null, 2),
    contentType: 'application/json',
  })
})
