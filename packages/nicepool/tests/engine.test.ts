import { describe, expect, it } from 'vitest'

import { NicePoolEngine, StateValidationError } from '../src/core'
import { edgeDataset } from './fixtures'

describe('NicePoolEngine', () => {
  it('treats setData as a full dataset-dependent reset', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setPrimarySelection('b')
    engine.setPlotState({ ...engine.plotState, preFilters: { accept: 'yes' }, plotType: 'swarm', groupColumn: 'condition' })

    engine.setData({ rowIdColumn: 'id', rows: [{ id: 'new', first: 1, second: 2 }] })

    expect(engine.selection).toEqual({ primaryRowId: null, selectedRowIds: [] })
    expect(engine.plotState.plotType).toBe('scatter')
    expect(engine.plotState.preFilters).toEqual({})
    expect(engine.dataset.rowIndexById.has('b')).toBe(false)
  })

  it('rejects selection IDs outside the authoritative dataset', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    expect(() => engine.setPrimarySelection('missing')).toThrow(RangeError)
  })

  it('replaces rows while preserving workspace state and pruning selection', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setLayout('1x2')
    engine.setActivePlot(1)
    engine.setPlotState({
      ...engine.plotState,
      plotType: 'swarm',
      preFilters: { accept: 'yes' },
      xColumn: 'condition',
      yColumn: 'y',
      groupColumn: 'condition',
      colorColumn: 'cohort',
    })
    engine.setSelection({ primaryRowId: 'b', selectedRowIds: ['a', 'b', 'c'] })
    const previousState = structuredClone(engine.state)

    engine.replaceData({
      rowIdColumn: 'pool_row_id',
      rows: [
        { pool_row_id: 'a', accept: 'yes', condition: 'control', cohort: 'one', x: 10, y: 11 },
        { pool_row_id: 'c', accept: 'no', condition: 'treated', cohort: 'two', x: 12, y: 13 },
        { pool_row_id: 'new', accept: 'yes', condition: 'control', cohort: 'one', x: 14, y: 15 },
      ],
    })

    expect(engine.state).toEqual(previousState)
    expect(engine.state).not.toBe(previousState)
    expect(engine.selection).toEqual({ primaryRowId: null, selectedRowIds: ['a', 'c'] })
    expect(engine.dataset.rowIndexById.has('new')).toBe(true)
  })

  it('keeps state with the same schema and entirely new row IDs', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setPlotState({ ...engine.plotState, xColumn: 'x', yColumn: 'y', pointSize: 12 })
    const previousState = structuredClone(engine.state)

    engine.replaceData({
      rowIdColumn: 'pool_row_id',
      rows: [{ pool_row_id: 'other-file-1', accept: 'yes', condition: 'control', cohort: 'one', x: 20, y: 21 }],
    })

    expect(engine.state).toEqual(previousState)
    expect(engine.selection).toEqual({ primaryRowId: null, selectedRowIds: [] })
  })

  it('rejects replacement before initial data', () => {
    const engine = new NicePoolEngine()
    expect(() => engine.replaceData(edgeDataset)).toThrow('call setData first')
  })

  it('rejects invalid replacement data atomically', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setPrimarySelection('b')
    const previousDataset = engine.dataset
    const previousState = engine.state
    const previousSelection = engine.selection

    expect(() => engine.replaceData({ rowIdColumn: 'id', rows: [{ id: 'duplicate', value: 1 }, { id: 'duplicate', value: 2 }] }))
      .toThrow()
    expect(engine.dataset).toBe(previousDataset)
    expect(engine.state).toBe(previousState)
    expect(engine.selection).toBe(previousSelection)
  })

  it('rejects incompatible workspace state atomically', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setPrimarySelection('b')
    const previousDataset = engine.dataset
    const previousState = engine.state
    const previousSelection = engine.selection

    expect(() => engine.replaceData({ rowIdColumn: 'pool_row_id', rows: [{ pool_row_id: 'new', other: 1 }] }))
      .toThrow(StateValidationError)
    expect(engine.dataset).toBe(previousDataset)
    expect(engine.state).toBe(previousState)
    expect(engine.selection).toBe(previousSelection)
  })

  it('extends selection as a stable union for Shift interactions', () => {
    const engine = new NicePoolEngine()
    engine.setData(edgeDataset)
    engine.setSelection({ primaryRowId: 'a', selectedRowIds: ['a', 'b'] })

    engine.extendSelection(['b', 'c'], 'c')

    expect(engine.selection).toEqual({ primaryRowId: 'c', selectedRowIds: ['a', 'b', 'c'] })
  })
})
