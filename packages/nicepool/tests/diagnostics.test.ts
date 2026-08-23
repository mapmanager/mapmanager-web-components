import { describe, expect, it } from 'vitest'

import { DatasetStore } from '../src/core/dataset'
import { defaultPlotState } from '../src/core/state'
import { describeEmptyPlot } from '../src/plots/diagnostics'
import { prepareScatter } from '../src/plots/prepare'

describe('empty plot diagnostics', () => {
  it('identifies a required column containing only missing values', () => {
    const dataset = new DatasetStore({
      rowIdColumn: 'id',
      rows: [
        { id: 'a', condition: null, value: 1 },
        { id: 'b', condition: null, value: 2 },
      ],
    })
    const state = { ...defaultPlotState(dataset), xColumn: 'condition', yColumn: 'value' }
    const prepared = prepareScatter(dataset, state)

    expect(describeEmptyPlot(dataset, state, prepared)).toBe(
      'No rows can be plotted: “condition” contains only missing values.',
    )
  })

  it('returns no diagnostic when the plot represents rows', () => {
    const dataset = new DatasetStore({ rowIdColumn: 'id', rows: [{ id: 'a', condition: 'control', value: 1 }] })
    const state = { ...defaultPlotState(dataset), xColumn: 'condition', yColumn: 'value' }
    const prepared = prepareScatter(dataset, state)

    expect(describeEmptyPlot(dataset, state, prepared)).toBeNull()
  })
})
