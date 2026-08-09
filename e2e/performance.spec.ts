import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { createPerformanceScene } from '../src/test/performance-scene'

function median(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

test.use({ viewport: { width: 1440, height: 900 } })

test('100-object production selection and numeric edit median is below 250ms with a lazy renderer chunk', async ({
  page,
}, testInfo) => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ) as Record<string, { file: string; dynamicImports?: string[] }>
  const entry = Object.values(manifest).find((entry) =>
    entry.file.startsWith('assets/index-'),
  )
  const renderer = Object.values(manifest).find((entry) =>
    entry.file.startsWith('assets/SceneCanvas-'),
  )
  expect(entry?.dynamicImports).toBeTruthy()
  expect(renderer).toBeTruthy()
  expect(statSync(join(process.cwd(), 'dist', entry!.file)).size).toBeLessThan(500_000)

  let delayed = false
  await page.route(`**/${renderer!.file}`, async (route) => {
    if (!delayed) {
      delayed = true
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByTestId('scene-canvas-loading')).toBeVisible()
  await expect(page.getByTestId('scene-canvas')).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles({
    name: 'performance.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createPerformanceScene(100))),
  })
  await page.locator('.tab-list button').nth(1).click()
  const target = page
    .locator('.outliner-row')
    .filter({ hasText: 'Performance table 001' })
  await expect(target).toBeVisible()
  const targetId = (await target.getAttribute('data-testid'))!.replace(
    'outliner-entity-',
    '',
  )
  const samples: number[] = []
  for (let sample = 0; sample < 4; sample += 1) {
    await page.getByTestId('outliner-room').click()
    await expect(page.getByTestId('outliner-room')).toHaveAttribute(
      'aria-current',
      'true',
    )
    const elapsed = await page.evaluate(
      async ({ nextValue, targetId }) => {
        const row = [
          ...document.querySelectorAll<HTMLButtonElement>('.outliner-row'),
        ].find((button) => button.textContent?.includes('Performance table 001'))
        if (!row) throw new Error('Performance entity was not rendered in the outliner.')
        const start = performance.now()
        row.click()
        await new Promise(requestAnimationFrame)
        if (
          document.querySelector('.inspector-title .muted-copy')?.textContent !== targetId
        )
          await new Promise(requestAnimationFrame)
        const input = document.querySelector<HTMLInputElement>(
          '[data-testid="position-x"]',
        )
        if (!input) throw new Error('Inspector position input was not rendered.')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          String(nextValue),
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise(requestAnimationFrame)
        if (
          input.value !== String(nextValue) ||
          document.querySelector<HTMLButtonElement>('.toolbar-button:nth-of-type(2)')
            ?.disabled
        )
          await new Promise(requestAnimationFrame)
        return performance.now() - start
      },
      { nextValue: 100 + sample, targetId },
    )
    if (sample > 0) samples.push(elapsed)
    await page.locator('.toolbar-button').nth(1).click()
    if (sample === 0) await page.waitForTimeout(350)
  }
  const measuredMedian = median(samples)
  console.log(
    `Task 11 performance samples: ${JSON.stringify(samples)}, median: ${measuredMedian}`,
  )
  expect(measuredMedian).toBeLessThan(250)
  await testInfo.attach('performance-metrics.json', {
    body: JSON.stringify({
      samples,
      median: measuredMedian,
      userAgent: await page.evaluate(() => navigator.userAgent),
      hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
      viewport: { width: 1440, height: 900 },
      entityCount: 131,
      profile: await page
        .getByTestId('scene-canvas')
        .getAttribute('data-renderer-profile'),
      chunks: {
        entry: entry!.file,
        entryBytes: statSync(join(process.cwd(), 'dist', entry!.file)).size,
        renderer: renderer!.file,
        rendererBytes: statSync(join(process.cwd(), 'dist', renderer!.file)).size,
      },
    }),
    contentType: 'application/json',
  })
})
