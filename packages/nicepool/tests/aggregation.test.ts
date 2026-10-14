import { describe, expect, it } from 'vitest'

import { aggregateForPlot, DatasetStore, DatasetValidationError, defaultPlotState, NicePoolEngine } from '../src/core'

const input = {
  rowIdColumn: 'id',
  rows: [
    { id: 'a', unit: 1, include: 'yes', condition: 'control', value: 1 },
    { id: 'b', unit: 1, include: 'yes', condition: 'control', value: 3 },
    { id: 'c', unit: 2, include: 'yes', condition: 'treated', value: null },
    { id: 'd', unit: 2, include: 'yes', condition: 'treated', value: 8 },
    { id: 'e', unit: 3, include: 'no', condition: 'control', value: 100 },
  ],
  preFilterColumns: ['include'],
  aggregation: { groupByColumn: 'unit', preserveColumns: ['include', 'condition'] },
} as const

function aggregateState(dataset: DatasetStore) {
  return {
    ...defaultPlotState(dataset),
    plotType: 'swarm' as const,
    dataLevel: 'aggregate' as const,
    preFilters: { include: 'yes' },
    xColumn: 'condition',
    yColumn: 'value',
    groupColumn: 'condition',
  }
}

describe('plot-specific aggregation', () => {
  it('filters first, ignores missing Y values, and records source membership', () => {
    const dataset = new DatasetStore(input)
    const table = aggregateForPlot(dataset, aggregateState(dataset))

    expect(table.dataset.rows).toHaveLength(2)
    expect(table.dataset.rows[0]).toMatchObject({ unit: 1, condition: 'control', value_count: 2, value_mean: 2, value_std: Math.SQRT2, value_sem: 1 })
    expect(table.dataset.rows[1]).toMatchObject({ unit: 2, condition: 'treated', value_count: 1, value_mean: 8, value_std: null, value_sem: null })
    const firstId = String(table.dataset.rows[0]![table.dataset.rowIdColumn])
    expect(table.sourceRowIdsByAggregateId.get(firstId)).toEqual(['a', 'b'])
  })

  it('fails when a caller-declared preserved column varies within a group', () => {
    const dataset = new DatasetStore({
      ...input,
      rows: input.rows.map((row, index) => index === 1 ? { ...row, condition: 'changed' } : row),
    })
    expect(() => aggregateForPlot(dataset, aggregateState(dataset))).toThrow(DatasetValidationError)
  })

  it('prepares aggregate means as selectable plot points with a mean axis label', () => {
    const engine = new NicePoolEngine()
    engine.setData(input)
    engine.setPlotState(aggregateState(engine.dataset))

    const prepared = engine.preparePlot()
    expect(prepared.aggregate?.dataset.rows).toHaveLength(2)
    expect(prepared.data.axisLabels.y).toBe('value (mean)')
    const rowId = prepared.data.points[0]!.rowId
    engine.setPrimarySelection(rowId)
    expect(engine.selection.primaryRowId).toBe(rowId)

    engine.setPlotState({ ...engine.plotState, dataLevel: 'source' })
    expect(engine.selection).toEqual({ primaryRowId: null, selectedRowIds: [] })
  })
})
