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

test('uses only local resources through edit, autosave, export/import, preview, and reload', async ({
  page,
}, testInfo) => {
  const base = new URL(String(testInfo.project.use.baseURL))
  const external: string[] = []
  const sockets: string[] = []
  const errors: Error[] = []
  const consoleErrors: string[] = []
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
  page.on('websocket', (socket) => sockets.push(socket.url()))
  page.on('pageerror', (error) => errors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  await page.goto('/')
  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  await page.getByTestId('position-x').fill('40')
  await page.getByTestId('position-x').press('Enter')
  await expect(page.locator('.save-state')).toHaveText('保存済み', { timeout: 1_000 })
  const exported = await downloadText(page)
  await page.getByRole('button', { name: 'JSON読み込み' }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'offline-roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exported),
  })
  expect(await downloadText(page)).toBe(exported)
  await page.getByRole('button', { name: '高品質プレビュー', exact: true }).click()
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  await page.getByRole('button', { name: '編集に戻る', exact: true }).click()
  await page.reload()
  await expect(page.getByTestId('scene-canvas')).toBeVisible()

  expect(external).toEqual([])
  expect(sockets).toEqual([])
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
