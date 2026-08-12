import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { expect, test, type Page } from '@playwright/test'

import { createPerformanceScene } from '../src/test/performance-scene'

function median(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]!
}

async function downloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON書き出し' }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

test.use({ viewport: { width: 1440, height: 900 } })

test('100-object production selection and numeric edit median is below 250ms with a lazy renderer chunk', async ({
  page,
}, testInfo) => {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ) as Record<string, { file: string; dynamicImports?: string[] }>
  const entryKey = Object.keys(manifest).find((key) =>
    manifest[key]?.file.startsWith('assets/index-'),
  )
  const rendererKey = 'src/renderer/SceneCanvas.tsx'
  const entry = entryKey ? manifest[entryKey] : undefined
  const renderer = manifest[rendererKey]
  expect(entry).toBeTruthy()
  expect(renderer).toBeTruthy()
  expect(entry?.dynamicImports).toContain(rendererKey)

  const entryAsset = readFileSync(join(process.cwd(), 'dist', entry!.file))
  const rendererAsset = readFileSync(join(process.cwd(), 'dist', renderer!.file))
  expect(entryAsset.length).toBeLessThan(500_000)

  const pageErrors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
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

  const fixture = createPerformanceScene(100)
  await page.locator('input[type="file"]').setInputFiles({
    name: 'performance.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
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
  const undo = page.getByRole('button', { name: '元に戻す' })
  const samples: number[] = []
  const finalValue = 103

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
        const undo = document.querySelector<HTMLButtonElement>('[aria-label="元に戻す"]')
        if (!undo) throw new Error('The accessible Undo button was not rendered.')
        const start = performance.now()
        row.click()
        const deadline = start + 1_000
        let input: HTMLInputElement | undefined
        while (performance.now() < deadline) {
          await new Promise(requestAnimationFrame)
          const id = document.querySelector('.inspector-title .muted-copy')?.textContent
          input =
            document.querySelector<HTMLInputElement>('[data-testid="position-x"]') ??
            undefined
          if (id === targetId && input) break
        }
        if (
          !input ||
          document.querySelector('.inspector-title .muted-copy')?.textContent !== targetId
        )
          throw new Error('Timed out waiting for the matching inspector entity.')
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          String(nextValue),
        )
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        while (performance.now() < deadline) {
          await new Promise(requestAnimationFrame)
          if (input.value === String(nextValue) && !undo.disabled)
            return performance.now() - start
        }
        throw new Error(
          'Timed out waiting for numeric commit and enabled accessible Undo.',
        )
      },
      { nextValue: 100 + sample, targetId },
    )
    if (sample > 0) samples.push(elapsed)
    if (sample < 3) {
      await undo.click()
      await expect(undo).toBeDisabled()
    }
  }

  const measuredMedian = median(samples)
  console.log(
    `Task 11 performance samples: ${JSON.stringify(samples)}, median: ${measuredMedian}`,
  )
  expect(measuredMedian).toBeLessThan(250)

  await page.getByRole('button', { name: '高品質プレビュー', exact: true }).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  const previewExport = await downloadText(page)
  const previewTarget = (
    JSON.parse(previewExport) as {
      entities: { id: string; transform: { position: { x: number } } }[]
    }
  ).entities.find((entity) => entity.id === targetId)
  expect(previewTarget?.transform.position.x).toBe(finalValue)
  await page.getByRole('button', { name: '編集に戻る', exact: true }).click()
  await undo.click()
  const undoneExport = await downloadText(page)
  expect(undoneExport).not.toBe(previewExport)
  await page.getByRole('button', { name: 'やり直す' }).click()
  expect(await downloadText(page)).toBe(previewExport)
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'editor',
  )
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])

  const metrics = {
    samples,
    median: measuredMedian,
    userAgent: await page.evaluate(() => navigator.userAgent),
    hardwareConcurrency: await page.evaluate(() => navigator.hardwareConcurrency),
    viewport: { width: 1440, height: 900 },
    entityCount: fixture.entities.length,
    profile: await page.getByTestId('scene-canvas').getAttribute('data-renderer-profile'),
    chunks: {
      entry: entry!.file,
      entryBytes: entryAsset.length,
      entryGzipBytes: gzipSync(entryAsset).length,
      renderer: renderer!.file,
      rendererBytes: rendererAsset.length,
      rendererGzipBytes: gzipSync(rendererAsset).length,
    },
  }
  console.log(`Task 11 performance metrics: ${JSON.stringify(metrics)}`)
  await testInfo.attach('performance-metrics.json', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  })
  expect(statSync(join(process.cwd(), 'dist', entry!.file)).size).toBe(entryAsset.length)
})
