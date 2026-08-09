import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { withDanglingConnection } from '../src/domain/fixtures/invalid-scenes'
import { createFutureWorkstationScene } from '../src/domain/templates/future-workstation'
import { hostileButInertFixture } from '../src/test/import-fixtures'

async function downloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON書き出し' }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected exported JSON stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

async function importText(page: Page, text: string, name = 'scene.json'): Promise<void> {
  await page.getByRole('button', { name: 'JSON読み込み' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
}

async function localBytes(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('home-lab-scene'))
}

test('persists visible edits, preserves last-known-good data, and safely round-trips imports', async ({
  page,
}, testInfo) => {
  const base = new URL(String(testInfo.project.use.baseURL))
  const pageErrors: Error[] = []
  const consoleErrors: string[] = []
  const external: string[] = []
  await page.route('**/*', async (route) => {
    const url = route.request().url()
    if (
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      new URL(url).origin === base.origin
    )
      return route.continue()
    external.push(url)
    await route.abort()
  })
  page.on('pageerror', (error) => pageErrors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto('/')
  const width = page.locator('.inspector-content input[type="number"]').first()
  await width.fill('3500')
  await width.press('Enter')
  await expect(page.locator('.save-state')).toHaveText('保存待機')
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  const saved = await downloadText(page)
  await page.reload()
  await expect(width).toHaveValue('3500')
  expect(await downloadText(page)).toBe(saved)

  const lkgBytes = await localBytes(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function setItemOnce(key: string, value: string) {
      Storage.prototype.setItem = original
      if (key === 'home-lab-scene') throw new Error('intentional storage failure')
      return original.call(this, key, value)
    }
  })
  await width.fill('3400')
  await width.press('Enter')
  await expect(page.locator('.save-state')).toHaveText('保存エラー', { timeout: 1_000 })
  await expect(width).toHaveValue('3400')
  expect(await localBytes(page)).toBe(lkgBytes)
  await width.fill('3450')
  await width.press('Enter')
  await expect(width).toHaveValue('3450')
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  expect(await localBytes(page)).not.toBe(lkgBytes)
  await page.reload()
  await expect(width).toHaveValue('3450')

  const canonicalBeforeImport = await downloadText(page)
  await importText(page, canonicalBeforeImport, 'canonical-roundtrip.json')
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  expect(await downloadText(page)).toBe(canonicalBeforeImport)

  await importText(
    page,
    readFileSync(join(process.cwd(), 'src/domain/fixtures/v0-scene.json'), 'utf8'),
    'legacy-v0.json',
  )
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  const migrated = JSON.parse(await downloadText(page)) as { schemaVersion: number }
  expect(migrated.schemaVersion).toBe(1)
  await page.locator('.tab-list button').nth(1).click()
  await page.getByRole('button', { name: /Legacy desk/ }).click()
  await expect(page.locator('.inspector-title .muted-copy')).toHaveText('legacy-desk-1')
  await expect(page.locator('.warning-box')).toContainText('カタログ')

  const beforeRejectedImport = await downloadText(page)
  const beforeRejectedStorage = await localBytes(page)
  const invalid = [
    '{',
    JSON.stringify({ format: 'home-lab-scene', schemaVersion: 2 }),
    JSON.stringify({ format: 'home-lab-scene', schemaVersion: 1, entities: [] }),
    JSON.stringify(withDanglingConnection(createFutureWorkstationScene())),
    JSON.stringify({
      format: 'home-lab-scene',
      schemaVersion: 1,
      entities: Array(2001).fill({}),
    }),
  ]
  for (const [index, rejected] of invalid.entries()) {
    await importText(page, rejected, `invalid-${index}.json`)
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await downloadText(page)).toBe(beforeRejectedImport)
    expect(await localBytes(page)).toBe(beforeRejectedStorage)
  }

  await importText(page, hostileButInertFixture(), 'hostile.json')
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  const hostile = await downloadText(page)
  expect(hostile).toContain('<script>window.__executed = true</script>')
  expect(await page.locator('script').filter({ hasText: '__executed' }).count()).toBe(0)
  expect(
    await page.evaluate(() => (window as Window & { __executed?: boolean }).__executed),
  ).toBeUndefined()
  expect(external).toEqual([])
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
