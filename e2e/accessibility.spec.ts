import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Locator, type Page } from '@playwright/test'

async function expectNoSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
}

async function expectVisibleFocus(target: Locator): Promise<void> {
  await expect(target).toBeFocused()
  const style = await target.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { outlineStyle: computed.outlineStyle, outlineWidth: computed.outlineWidth }
  })
  expect(style.outlineStyle).not.toBe('none')
  expect(style.outlineWidth).not.toBe('0px')
}

async function tabUntilActive(
  page: Page,
  target: Locator,
  direction: 'forward' | 'backward' = 'forward',
): Promise<number> {
  await expect(target).toBeVisible()
  for (let steps = 0; steps <= 180; steps += 1) {
    try {
      await expect(target).toBeFocused({ timeout: 20 })
      await expectVisibleFocus(target)
      return steps
    } catch {
      await page.keyboard.press(direction === 'forward' ? 'Tab' : 'Shift+Tab')
    }
  }
  throw new Error(
    `Keyboard ${direction} traversal did not reach the expected visible control.`,
  )
}

async function downloadText(
  page: Page,
  direction: 'forward' | 'backward' = 'forward',
): Promise<string> {
  const download = page.waitForEvent('download')
  const exportButton = page.getByRole('button', { name: 'JSON書き出し' })
  await tabUntilActive(page, exportButton, direction)
  await page.keyboard.press('Enter')
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

async function selectNativeOptionByKeyboard(
  page: Page,
  select: Locator,
  label: string,
): Promise<void> {
  await page.keyboard.press('Home')
  for (let steps = 0; steps < 8; steps += 1) {
    if ((await select.locator('option:checked').textContent())?.includes(label)) {
      await page.keyboard.press('Enter')
      return
    }
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`Keyboard option traversal did not reach ${label}.`)
}

test('keyboard-only controls follow focus order and Escape cancels a real cable draft', async ({
  page,
}) => {
  test.slow()
  const errors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => errors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto('/')
  await expectNoSeriousOrCritical(page)

  const preview = page.getByRole('button', { name: 'プレビュー' })
  expect(await tabUntilActive(page, preview)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  const edit = page.getByRole('button', { name: '編集' })
  expect(await tabUntilActive(page, edit, 'backward')).toBe(1)
  await page.keyboard.press('Enter')

  const addDesk = page.getByTestId('catalog-add-desk.l-shaped-sit-stand')
  expect(await tabUntilActive(page, addDesk)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  const positionX = page.getByTestId('position-x')
  expect(await tabUntilActive(page, positionX)).toBeGreaterThan(0)
  await page.keyboard.press('Control+A')
  await page.keyboard.type('75')
  await page.keyboard.press('Enter')
  await expect(positionX).toHaveValue('75')

  const undo = page.getByRole('button', { name: '元に戻す' })
  expect(await tabUntilActive(page, undo, 'backward')).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expectVisibleFocus(undo)
  await page.keyboard.press('Enter')
  await expect(undo).toBeDisabled()

  const outlinerTab = page.locator('.tab-list button').nth(1)
  expect(await tabUntilActive(page, outlinerTab)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  const cableRow = page.getByRole('button', { name: /Power cable/ })
  expect(await tabUntilActive(page, cableRow)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('cable-inspector')).toBeVisible()
  const detach = page.getByTestId('cable-end-end-a-detach')
  expect(await tabUntilActive(page, detach)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')

  const cableTool = page.getByTestId('tool-cable')
  expect(await tabUntilActive(page, cableTool, 'backward')).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  const cableEnd = page.getByTestId('cable-tool-end')
  expect(await tabUntilActive(page, cableEnd)).toBeGreaterThan(0)
  await selectNativeOptionByKeyboard(page, cableEnd, 'Power cable / End A')
  await expect(cableEnd.locator('option:checked')).toContainText('Power cable / End A')
  const begin = page.getByTestId('cable-tool-begin')
  expect(await tabUntilActive(page, begin)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('.cable-tool [role="status"]')).toContainText('端子を選択中')

  const beforeDraft = await downloadText(page, 'backward')
  const undoDisabledBeforeDraft = await undo.isDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cable-tool-cancel')).toHaveCount(0)
  expect(await downloadText(page)).toBe(beforeDraft)
  expect(await undo.isDisabled()).toBe(undoDisabledBeforeDraft)

  const importButton = page.getByRole('button', { name: 'JSON読み込み' })
  expect(await tabUntilActive(page, importButton)).toBe(1)
  await page.keyboard.press('Enter')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'keyboard-roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(beforeDraft),
  })
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobileInspector = page.getByRole('button', { name: 'プロパティ' })
  expect(await tabUntilActive(page, mobileInspector)).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  const sheet = page.getByTestId('mobile-sheet')
  await expect(sheet).toHaveAttribute('aria-modal', 'true')
  await expectNoSeriousOrCritical(page)
  await expectVisibleFocus(page.getByRole('button', { name: 'シートを閉じる' }))
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expectVisibleFocus(mobileInspector)

  expect(await tabUntilActive(page, cableTool, 'backward')).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expectNoSeriousOrCritical(page)
  expect(await tabUntilActive(page, preview, 'backward')).toBeGreaterThan(0)
  await page.keyboard.press('Enter')
  await expectNoSeriousOrCritical(page)

  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
