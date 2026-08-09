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

test('keyboard paths and visible editor states have no serious or critical axe violations', async ({
  page,
}) => {
  await page.goto('/')
  await expectNoSeriousOrCritical(page)

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'プロパティ' }).click()
  const sheet = page.getByTestId('mobile-sheet')
  await expect(sheet).toHaveAttribute('aria-modal', 'true')
  await expectNoSeriousOrCritical(page)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  await page.getByTestId('tool-cable').click()
  await expectNoSeriousOrCritical(page)
  await page.getByRole('button', { name: 'プレビュー' }).click()
  await expectNoSeriousOrCritical(page)

  await page.getByRole('button', { name: '編集' }).click()
  await page.keyboard.press('Tab')
  const focus = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    const style = element ? getComputedStyle(element) : undefined
    return {
      tag: element?.tagName,
      outlineStyle: style?.outlineStyle,
      outlineWidth: style?.outlineWidth,
    }
  })
  expect(focus.tag).toBeTruthy()
  expect(focus.outlineStyle).not.toBe('none')
})
