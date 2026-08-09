import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { hostileButInertFixture } from '../src/test/import-fixtures'

async function downloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON書き出し/ }).click()
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected exported JSON stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

async function importText(page: Page, text: string, name = 'scene.json'): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  })
}

test('persists visible edits, recovers from a storage write failure, and imports v0 safely', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
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

  const lkgBytes = await page.evaluate(() => localStorage.getItem('home-lab-scene'))
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
  expect(await page.evaluate(() => localStorage.getItem('home-lab-scene'))).toBe(lkgBytes)
  await page.reload()
  await expect(width).toHaveValue('3500')

  await importText(
    page,
    readFileSync(join(process.cwd(), 'src/domain/fixtures/v0-scene.json'), 'utf8'),
    'legacy-v0.json',
  )
  await page.locator('.tab-list button').nth(1).click()
  await page.getByRole('button', { name: /Legacy desk/ }).click()
  await expect(page.locator('.inspector-title .muted-copy')).toHaveText('legacy-desk-1')
  await expect(page.locator('.warning-box')).toContainText('カタログ')

  const beforeRejectedImport = await downloadText(page)
  for (const invalid of [
    '{',
    JSON.stringify({ format: 'home-lab-scene', schemaVersion: 2 }),
    JSON.stringify({ format: 'home-lab-scene', schemaVersion: 1, entities: [] }),
    JSON.stringify({
      format: 'home-lab-scene',
      schemaVersion: 1,
      entities: Array(2001).fill({}),
    }),
  ]) {
    await importText(page, invalid, 'invalid.json')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(await downloadText(page)).toBe(beforeRejectedImport)
  }

  await importText(page, hostileButInertFixture(), 'hostile.json')
  const hostile = await downloadText(page)
  expect(hostile).toContain('<script>window.__executed = true</script>')
  expect(
    await page.evaluate(() => (window as Window & { __executed?: boolean }).__executed),
  ).toBeUndefined()
  expect(pageErrors).toEqual([])
})
