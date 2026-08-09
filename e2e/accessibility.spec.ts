import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoSeriousOrCritical(page: Page) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact ?? ''),
    ),
  ).toEqual([])
}

async function downloadText(page: Page): Promise<string> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSON書き出し' }).press('Enter')
  const stream = await (await download).createReadStream()
  if (!stream) throw new Error('Expected a JSON export stream.')
  let text = ''
  for await (const chunk of stream) text += chunk.toString()
  return text
}

async function selectOptionByLabel(
  select: ReturnType<Page['getByTestId']>,
  label: RegExp,
): Promise<void> {
  const option = select.locator('option').filter({ hasText: label })
  await select.selectOption(await option.getAttribute('value'))
}

test('keyboard-only controls cover edit workflows and Escape cancels a real cable draft', async ({
  page,
}) => {
  const errors: Error[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => errors.push(error))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.goto('/')
  await expectNoSeriousOrCritical(page)

  await page.getByRole('button', { name: 'プレビュー' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('scene-canvas')).toHaveAttribute(
    'data-renderer-profile',
    'preview',
  )
  await page.getByRole('button', { name: '編集' }).focus()
  await page.keyboard.press('Enter')

  await page.getByTestId('catalog-add-desk.l-shaped-sit-stand').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('position-x')).toBeVisible()
  await page.getByTestId('position-x').focus()
  await page.keyboard.type('75')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('position-x')).toHaveValue('75')
  await page.getByRole('button', { name: '元に戻す' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: '元に戻す' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled()

  await page.locator('.tab-list button').nth(1).focus()
  await page.keyboard.press('Enter')
  const cableRow = page.getByRole('button', { name: /Power cable/ })
  await cableRow.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('cable-inspector')).toBeVisible()
  await page.getByTestId('cable-end-end-a-detach').focus()
  await page.keyboard.press('Enter')
  await page.getByTestId('tool-cable').focus()
  await page.keyboard.press('Enter')
  await selectOptionByLabel(page.getByTestId('cable-tool-end'), /Power cable \/ End A/)
  await page.getByTestId('cable-tool-begin').focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.cable-tool [role="status"]')).toContainText('端子を選択中')
  const beforeDraft = await downloadText(page)
  const undoDisabledBeforeDraft = await page
    .getByRole('button', { name: '元に戻す' })
    .isDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('cable-tool-cancel')).toHaveCount(0)
  expect(await downloadText(page)).toBe(beforeDraft)
  expect(await page.getByRole('button', { name: '元に戻す' }).isDisabled()).toBe(
    undoDisabledBeforeDraft,
  )

  await page.getByRole('button', { name: 'JSON読み込み' }).focus()
  await page.keyboard.press('Enter')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'keyboard-roundtrip.json',
    mimeType: 'application/json',
    buffer: Buffer.from(beforeDraft),
  })
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.setViewportSize({ width: 390, height: 844 })
  const opener = page.getByRole('button', { name: 'プロパティ' })
  await opener.focus()
  await page.keyboard.press('Enter')
  const sheet = page.getByTestId('mobile-sheet')
  await expect(sheet).toHaveAttribute('aria-modal', 'true')
  await expectNoSeriousOrCritical(page)
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('シートを閉じる')
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.activeElement ===
          document.querySelector('.mobile-controls button:nth-child(3)'),
      ),
    )
    .toBe(true)

  await page.getByTestId('tool-cable').focus()
  await page.keyboard.press('Enter')
  await expectNoSeriousOrCritical(page)
  await page.getByRole('button', { name: 'プレビュー' }).focus()
  await page.keyboard.press('Enter')
  await expectNoSeriousOrCritical(page)

  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    const style = element ? getComputedStyle(element) : undefined
    return { outlineStyle: style?.outlineStyle, outlineWidth: style?.outlineWidth }
  })
  expect(focus.outlineStyle).not.toBe('none')
  expect(focus.outlineWidth).not.toBe('0px')
  expect(errors).toEqual([])
  expect(consoleErrors).toEqual([])
})
