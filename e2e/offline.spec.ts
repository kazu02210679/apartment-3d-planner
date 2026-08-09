import { expect, test } from '@playwright/test'

test('uses only local, data, and blob resources through edit, preview, persistence, export, and import', async ({
  page,
}, testInfo) => {
  const base = new URL(String(testInfo.project.use.baseURL))
  const external: string[] = []
  const sockets: string[] = []
  const errors: Error[] = []
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
  await page.goto('/')
  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').click()
  await page.getByTestId('position-x').fill('40')
  await page.getByTestId('position-x').press('Enter')
  await page.getByRole('button', { name: 'プレビュー' }).click()
  await page.getByRole('button', { name: '編集' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /JSON書き出し/ }).click()
  await download
  await page.reload()
  expect(external).toEqual([])
  expect(sockets).toEqual([])
  expect(errors).toEqual([])
})
