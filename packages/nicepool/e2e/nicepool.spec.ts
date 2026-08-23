import { expect, test, type Page } from '@playwright/test'

async function plotSnapshot(page: Page) {
  return page.locator('.nicepool-plot').evaluate((element) => {
    const plot = element as HTMLElement & {
      _fullData: Array<{ x: unknown[]; y: unknown[] }>
      _fullLayout: { xaxis: { title: { text: string } }; yaxis: { title: { text: string } } }
    }
    return {
      x: [...plot._fullData[0]!.x],
      y: [...plot._fullData[0]!.y],
      xTitle: plot._fullLayout.xaxis.title.text,
      yTitle: plot._fullLayout.yaxis.title.text,
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('600 rows · primary none', { exact: true })).toBeVisible()
  await expect(page.locator('.nicepool-plot .plot-container')).toBeVisible()
})

test('changing X and Y updates the rendered Plotly specification', async ({ page }) => {
  const before = await plotSnapshot(page)

  await page.getByLabel('X column').selectOption('velocity')
  await expect.poll(async () => (await plotSnapshot(page)).xTitle).toBe('velocity')
  await page.getByLabel('Y column').selectOption('duration')
  await expect.poll(async () => (await plotSnapshot(page)).yTitle).toBe('duration')

  const after = await plotSnapshot(page)
  expect(after.x).not.toEqual(before.x)
  expect(after.y).not.toEqual(before.y)
})
