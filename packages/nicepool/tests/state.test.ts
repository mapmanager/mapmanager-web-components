import { describe, expect, it } from 'vitest'

import nicePoolStateSchema from '../schemas/nicepool-state.schema.json'
import nicePoolPresetSchema from '../schemas/nicepool-preset.schema.json'
import plotStateSchema from '../schemas/plot-state.schema.json'

import {
  DatasetStore,
  NicePoolEngine,
  StateValidationError,
  createNicePoolPresets,
  createNicePoolState,
  defaultNicePoolState,
  validateNicePoolPreset,
  validateNicePoolPresets,
  validateNicePoolState,
  visiblePlotCount,
} from '../src/core'
import { sampleDataset } from '../src/app/sampleData'
import { edgeDataset } from './fixtures'

describe('versioned state contracts', () => {
  it('creates four independent plot defaults from the dataset schema', () => {
    const dataset = new DatasetStore(edgeDataset)
    const state = defaultNicePoolState(dataset)
    expect(state).toMatchObject({ schemaVersion: 1, layout: '1x1', activePlotIndex: 0 })
    expect(state.plots[0].groupColumn).toBeNull()
    expect(state.plots[0]).toMatchObject({
      showLegend: true,
      legendPosition: 'bottom',
      showPlotlyToolbar: true,
      showHover: false,
      showAxes: true,
      showHorizontalGrid: true,
      showVerticalGrid: true,
      histogramBins: 50,
    })
    expect(state.plots).toHaveLength(4)
    state.plots[0].pointSize = 12
    expect(state.plots[1].pointSize).toBe(7)
  })

  it('builds presets when a numeric prefilter is not a group column', () => {
    const input = {
      rowIdColumn: 'id',
      rows: [{ id: 1, epoch: 0, x: 1, y: 2 }],
      preFilterColumns: ['epoch'],
    }
    const state = createNicePoolState(input, { layout: '2x1', plots: [{ xColumn: 'x', yColumn: 'y' }, { xColumn: 'x', yColumn: 'y' }] })
    expect(state.layout).toBe('2x1')
    expect(state.plots[0].preFilters).toEqual({})
    expect(state.plots[0].groupColumn).toBeNull()
  })

  it('rejects plot states that omit current required fields', () => {
    const dataset = new DatasetStore(edgeDataset)
    const state = defaultNicePoolState(dataset)
    const legacyPlot = { ...state.plots[0] } as Partial<typeof state.plots[0]>
    delete legacyPlot.histogramBins
    expect(() => validateNicePoolState(dataset, { ...state, plots: [legacyPlot, ...state.plots.slice(1)] } as never)).toThrow(StateValidationError)
  })

  it('rejects unsupported display options', () => {
    const dataset = new DatasetStore(edgeDataset)
    const state = defaultNicePoolState(dataset)
    const invalidPlot = { ...state.plots[0], legendPosition: 'center' }
    const invalidState = { ...state, plots: [invalidPlot, ...state.plots.slice(1)] }
    expect(() => validateNicePoolState(dataset, invalidState as never)).toThrow(StateValidationError)
  })

  it('validates layout visibility and rejects unknown fields transactionally', () => {
    const dataset = new DatasetStore(edgeDataset)
    const valid = defaultNicePoolState(dataset)
    expect(visiblePlotCount('2x2')).toBe(4)
    expect(() => validateNicePoolState(dataset, { ...valid, layout: '1x1', activePlotIndex: 1 })).toThrow(StateValidationError)
    expect(() => validateNicePoolState(dataset, { ...valid, extra: true } as never)).toThrow(StateValidationError)
  })

  it('leaves the current workspace unchanged when replacement state is invalid', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    const before = structuredClone(engine.state)
    expect(() => engine.setState({ ...before, activePlotIndex: 3 })).toThrow(StateValidationError)
    expect(engine.state).toEqual(before)
  })

  it('builds and applies a complete workspace preset', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    const state = createNicePoolState(edgeDataset, {
      layout: '1x2',
      plots: [{ pointSize: 14 }, { pointSize: 11 }],
    })
    const preset = validateNicePoolPreset(engine.dataset, {
      schemaVersion: 1,
      name: 'large workspaces',
      state,
    })
    engine.applyNicePoolPreset(preset)
    expect(engine.state.layout).toBe('1x2')
    expect(engine.state.plots[0].pointSize).toBe(14)
    expect(engine.state.plots[1].pointSize).toBe(11)
  })

  it('builds dataset-aware presets atomically from partial definitions', () => {
    const presets = createNicePoolPresets(edgeDataset, [
      { name: 'scatter', state: { plots: [{ xColumn: 'x', yColumn: 'y', pointSize: 13 }] } },
      { name: 'histogram', state: { plots: [{ plotType: 'histogram', xColumn: 'x', yColumn: 'y' }] } },
    ])
    expect(presets.map(({ name }) => name)).toEqual(['scatter', 'histogram'])
    expect(presets[0]?.state.plots[0]).toMatchObject({ xColumn: 'x', yColumn: 'y', pointSize: 13 })
    expect(() => createNicePoolPresets(edgeDataset, [
      { name: 'invalid', state: { plots: [{ xColumn: 'missing' }] } },
    ])).toThrow(StateValidationError)
  })

  it('ships readable version-one JSON schemas', () => {
    for (const schema of [plotStateSchema, nicePoolPresetSchema, nicePoolStateSchema]) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
      expect(schema.additionalProperties).toBe(false)
    }
  })

  it('rejects duplicate preset names atomically', () => {
    const dataset = new DatasetStore(edgeDataset)
    const state = defaultNicePoolState(dataset)
    const preset = { schemaVersion: 1 as const, name: 'duplicate', state }
    expect(() => validateNicePoolPresets(dataset, [preset, preset])).toThrow(StateValidationError)
  })

  it('generates negative values, outliers, and explicit missing values', () => {
    const velocities = sampleDataset(600).rows.map((row) => row.velocity)
    const numeric = velocities.filter((value): value is number => typeof value === 'number')
    expect(numeric.some((value) => value < 0)).toBe(true)
    expect(numeric.some((value) => Math.abs(value) > 20)).toBe(true)
    expect(velocities).toContain(null)
  })
})
