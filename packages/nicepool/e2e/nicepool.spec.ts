import { expect, test, type Page } from '@playwright/test'

async function plotSnapshot(page: Page) {
  return page.locator('.nicepool-plot').first().evaluate((element) => {
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

  await page.getByLabel('X column: velocity').check({ force: true })
  await expect.poll(async () => (await plotSnapshot(page)).xTitle).toBe('velocity')
  await page.getByLabel('Y column: duration').check({ force: true })
  await expect.poll(async () => (await plotSnapshot(page)).yTitle).toBe('duration')

  const after = await plotSnapshot(page)
  expect(after.x).not.toEqual(before.x)
  expect(after.y).not.toEqual(before.y)
})

test('keeps preset selection visible while preset editing is toggled', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')
  await expect(pool.getByLabel('Preset')).toBeVisible()
  const presetBox = await pool.getByLabel('Preset').boundingBox()
  const layoutBox = await pool.getByLabel('Layout').boundingBox()
  expect(presetBox).not.toBeNull()
  expect(layoutBox).not.toBeNull()
  expect(presetBox!.y).toBeLessThan(layoutBox!.y)
  await expect(pool.getByRole('group', { name: 'Saved workspace' })).toBeVisible()

  await pool.evaluate((element) => {
    (element as HTMLElement & { setShowPresetEditing(visible: boolean): void }).setShowPresetEditing(false)
  })

  await expect(pool.getByLabel('Preset')).toBeVisible()
  await expect(pool.getByRole('group', { name: 'Saved workspace' })).toHaveCount(0)
})

test('collapses and restores controls through the public element API', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')
  const controls = pool.locator('.nicepool-controls')

  await expect.poll(() => controls.evaluate((element) => element.getBoundingClientRect().width)).toBe(520)
  await pool.evaluate((element) => {
    (element as HTMLElement & { setControlsCollapsed(collapsed: boolean): void }).setControlsCollapsed(true)
  })
  await expect.poll(() => controls.evaluate((element) => element.getBoundingClientRect().width)).toBe(0)
  await expect.poll(() => pool.evaluate((element) =>
    (element as HTMLElement & { getControlsCollapsed(): boolean }).getControlsCollapsed(),
  )).toBe(true)

  await pool.evaluate((element) => {
    (element as HTMLElement & { setControlsCollapsed(collapsed: boolean): void }).setControlsCollapsed(false)
  })
  await expect.poll(() => controls.evaluate((element) => element.getBoundingClientRect().width)).toBe(520)
})

test('replaceData keeps plot state and emits only the replacement lifecycle event', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')
  await expect(pool.locator('.nicepool-plot .plot-container')).toBeVisible()

  const result = await pool.evaluate(async (element) => {
    const nicePool = element as HTMLElement & {
      getState(): { layout: string; plots: Array<Record<string, unknown>> }
      setState(state: unknown): void
      replaceData(input: unknown): void
      getSelection(): { primaryRowId: string | null; selectedRowIds: string[] }
      setSelection(selection: unknown): void
      setNicePoolPresets(presets: unknown[]): void
      getNicePoolPresets(): unknown[]
      applyNicePoolPreset(name: string): void
    }
    const events: string[] = []
    for (const name of ['nicepool-data-replaced', 'nicepool-data-reset', 'nicepool-selection-change']) {
      element.addEventListener(name, () => events.push(name))
    }
    const state = nicePool.getState()
    state.layout = '1x2'
    state.plots[0] = { ...state.plots[0], xColumn: 'velocity', yColumn: 'duration', pointSize: 13 }
    nicePool.setState(state)
    nicePool.setNicePoolPresets([{ schemaVersion: 1, name: 'Current', state }])
    nicePool.applyNicePoolPreset('Current')
    nicePool.setSelection({ primaryRowId: 'row-0001', selectedRowIds: ['row-0001', 'row-0002'] })
    nicePool.replaceData({
      rowIdColumn: 'pool_row_id',
      rows: [
        { pool_row_id: 'row-0002', accept: 'yes', channel: 'green', roi_id: 'roi-1', condition: 'control', time: 1, amplitude: 2, velocity: 3, duration: 4 },
        { pool_row_id: 'new-row', accept: 'yes', channel: 'red', roi_id: 'roi-2', condition: 'treated', time: 5, amplitude: 6, velocity: 7, duration: 8 },
      ],
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { state: nicePool.getState(), selection: nicePool.getSelection(), presets: nicePool.getNicePoolPresets(), events }
  })

  expect(result.state.layout).toBe('1x2')
  expect(result.state.plots[0]).toMatchObject({ xColumn: 'velocity', yColumn: 'duration', pointSize: 13 })
  expect(result.selection).toEqual({ primaryRowId: null, selectedRowIds: ['row-0002'] })
  expect(result.presets).toHaveLength(1)
  expect(result.events).toEqual(['nicepool-data-replaced'])
  await expect(pool.getByLabel('Preset')).toHaveValue('Current')
  await expect.poll(async () => (await plotSnapshot(page)).x).toEqual([3, 7])
})

test('emits one selection for point clicks, drag selections, and clears', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')
  await expect(pool.locator('.nicepool-plot .plot-container')).toBeVisible()

  const selections = await pool.evaluate(async (element) => {
    const received: unknown[] = []
    element.addEventListener('nicepool-selection-change', (event) => {
      received.push((event as CustomEvent).detail)
    })
    const plot = element.shadowRoot!.querySelector('.nicepool-plot') as HTMLElement & {
      emit(name: string, event: unknown): void
    }
    plot.emit('plotly_selected', { points: [] })
    plot.emit('plotly_click', { points: [{ customdata: ['row-0001'] }] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    plot.emit('plotly_selected', {
      points: [{ customdata: ['row-0002'] }, { customdata: ['row-0003'] }],
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    plot.emit('plotly_selected', { points: [] })
    await new Promise((resolve) => setTimeout(resolve, 20))
    return received
  })

  expect(selections).toEqual([
    { primaryRowId: 'row-0001', selectedRowIds: ['row-0001'] },
    { primaryRowId: 'row-0002', selectedRowIds: ['row-0002', 'row-0003'] },
    { primaryRowId: null, selectedRowIds: [] },
  ])
})

test('organizes controls and labels summary dimensions from plot state', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')

  const filtersBeforePlotType = await pool.evaluate((element) => {
    const root = element.shadowRoot!
    const filters = [...root.querySelectorAll('fieldset')]
      .find((fieldset) => fieldset.querySelector('legend')?.textContent === 'Filters')!
    const plotType = [...root.querySelectorAll('.nicepool-controls > label')]
      .find((label) => label.firstChild?.textContent?.trim() === 'Plot type')!
    return Boolean(filters.compareDocumentPosition(plotType) & Node.DOCUMENT_POSITION_FOLLOWING)
  })
  expect(filtersBeforePlotType).toBe(true)
  const displayControls = await pool.evaluate((element) => {
    const details = element.shadowRoot!.querySelector('.nicepool-display-options') as HTMLDetailsElement
    details.open = true
    return [...details.querySelectorAll('label')].map((label) => label.textContent?.trim())
  })
  expect(displayControls).toContain('Point size')
  expect(displayControls).toContain('Histogram bins')

  const categoryAlignment = await pool.evaluate((element) => {
    const root = element.shadowRoot!
    const columnHeader = root.querySelector('.nicepool-column-selector thead th:nth-child(2)')!.getBoundingClientRect()
    const category = root.querySelector('.nicepool-category-row th:nth-child(2)')!.getBoundingClientRect()
    return { columnX: columnHeader.x, categoryX: category.x }
  })
  expect(categoryAlignment.categoryX).toBe(categoryAlignment.columnX)

  await pool.evaluate((element) => {
    const nicePool = element as HTMLElement & {
      getState(): { layout: string; plots: Array<Record<string, unknown>> }
      setState(state: unknown): void
    }
    const state = nicePool.getState()
    state.plots[0] = {
      ...state.plots[0],
      plotType: 'swarm',
      groupColumn: 'condition',
      colorColumn: null,
      yColumn: 'amplitude',
    }
    nicePool.setState(state)
    const details = element.shadowRoot!.querySelector('.nicepool-summary-panel') as HTMLDetailsElement
    details.open = true
    const summaryTab = [...element.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
      .find((button) => button.textContent?.includes('summary'))!
    summaryTab.click()
  })

  const summaryPanel = pool.locator('.nicepool-summary-panel')
  const summaryTable = summaryPanel.getByRole('table', { name: 'Summary', exact: true })
  const rawDataTable = summaryPanel.getByRole('table', { name: 'Raw Data', exact: true })
  await expect(summaryTable.getByRole('columnheader', { name: 'condition', exact: true })).toHaveCount(1)
  await expect(summaryPanel.getByRole('columnheader', { name: 'Color', exact: true })).toHaveCount(0)
  await summaryPanel.getByRole('checkbox', { name: 'Raw Data', exact: true }).check()
  await expect(rawDataTable.getByRole('columnheader', { name: 'condition', exact: true })).toHaveCount(2)
})

test('publishes complete preset collections for user saves, overwrites, and deletes', async ({ page }) => {
  await page.goto('/element-demo.html')
  const pool = page.locator('nice-pool')
  await expect(pool.getByRole('group', { name: 'Saved workspace' })).toBeVisible()

  await pool.evaluate((element) => {
    const received: unknown[] = []
    element.addEventListener('nicepool-presets-change', (event) => {
      received.push((event as CustomEvent).detail)
    })
    ;(element as HTMLElement & { __presetEvents?: unknown[] }).__presetEvents = received
  })

  const savedWorkspace = pool.getByRole('group', { name: 'Saved workspace' })
  await savedWorkspace.getByLabel('Name').fill('Host preset')
  await savedWorkspace.getByRole('button', { name: 'Save' }).click()
  await expect(pool.getByLabel('Preset')).toHaveValue('Host preset')

  await pool.getByLabel('Layout').selectOption('1x2')
  await savedWorkspace.getByRole('button', { name: 'Save' }).click()
  await savedWorkspace.getByRole('button', { name: 'Delete' }).click()

  const events = await pool.evaluate((element) =>
    (element as HTMLElement & { __presetEvents?: Array<Array<{ name: string; state: { layout: string } }>> }).__presetEvents,
  )
  expect(events).toHaveLength(3)
  expect(events?.[0]).toHaveLength(1)
  expect(events?.[0]?.[0]?.name).toBe('Host preset')
  expect(events?.[0]?.[0]?.state.layout).toBe('1x1')
  expect(events?.[1]).toHaveLength(1)
  expect(events?.[1]?.[0]?.state.layout).toBe('1x2')
  expect(events?.[2]).toEqual([])
})
