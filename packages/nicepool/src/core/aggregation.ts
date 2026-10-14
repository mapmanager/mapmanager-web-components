import { DatasetStore, filteredRowIndices, finiteNumber } from './dataset'
import { descriptiveStatistics } from './statistics'
import { DatasetValidationError, type ColumnSchema, type NicePoolRow, type NicePoolValue, type PlotState, type RowId } from './types'

const STATISTICS = ['count', 'min', 'max', 'mean', 'median', 'std', 'sem', 'cv'] as const

/** Immutable derived dataset and source membership for one plot's current Y measurement. */
export interface AggregateTable {
  dataset: DatasetStore
  sourceYColumn: string
  meanColumn: string
  sourceRowIdsByAggregateId: ReadonlyMap<RowId, readonly RowId[]>
}

function sameValue(left: NicePoolValue | undefined, right: NicePoolValue | undefined): boolean {
  return Object.is(left, right)
}

function aggregateId(groupColumn: string, value: NicePoolValue): RowId {
  return `aggregate:${groupColumn}:${JSON.stringify(value)}`
}

/**
 * Derive one immutable row per configured group after applying the plot's source filters.
 * Missing Y values are ignored. Preserved columns must be constant within each filtered group.
 */
export function aggregateForPlot(source: DatasetStore, state: PlotState): AggregateTable {
  const config = source.aggregation
  if (!config) throw new DatasetValidationError('Dataset does not define aggregation')
  const ySchema = source.columnSchema(state.yColumn)
  if (ySchema.type !== 'number') throw new DatasetValidationError('Aggregation Y column must be numeric')

  const grouped = new Map<string, { value: NicePoolValue; indices: number[] }>()
  for (const sourceIndex of filteredRowIndices(source, state.preFilters)) {
    const value = source.rows[sourceIndex]![config.groupByColumn]
    if (value === null || value === undefined || value === '') {
      throw new DatasetValidationError(`Aggregation group column ${JSON.stringify(config.groupByColumn)} contains a missing value`)
    }
    const key = JSON.stringify([typeof value, value])
    const group = grouped.get(key) ?? { value, indices: [] }
    group.indices.push(sourceIndex)
    grouped.set(key, group)
  }

  const rowIdColumn = '__nicepool_aggregate_id'
  const meanColumn = `${state.yColumn}_mean`
  const rows: NicePoolRow[] = []
  const membership = new Map<RowId, readonly RowId[]>()
  for (const { value, indices } of grouped.values()) {
    const first = source.rows[indices[0]!]!
    const id = aggregateId(config.groupByColumn, value)
    const row: Record<string, NicePoolValue> = { [rowIdColumn]: id, [config.groupByColumn]: value }
    for (const column of config.preserveColumns) {
      const expected = first[column]
      if (indices.some((index) => !sameValue(source.rows[index]![column], expected))) {
        throw new DatasetValidationError(
          `Aggregation preserve column ${JSON.stringify(column)} is not constant for ${config.groupByColumn}=${JSON.stringify(value)}`,
        )
      }
      row[column] = expected ?? null
    }
    const values = indices.flatMap((index) => {
      const value = finiteNumber(source.rows[index]![state.yColumn])
      return value === null ? [] : [value]
    })
    const statistics = descriptiveStatistics(values, state.cvEpsilon)
    for (const statistic of STATISTICS) row[`${state.yColumn}_${statistic}`] = statistics[statistic]
    rows.push(Object.freeze(row))
    membership.set(id, Object.freeze(indices.map((index) => String(source.rows[index]![source.rowIdColumn]))))
  }

  const schema: ColumnSchema[] = [
    { name: rowIdColumn, type: 'string', axis_label: 'Aggregate row ID' },
    source.columnSchema(config.groupByColumn),
    ...config.preserveColumns.map((name) => source.columnSchema(name)),
    ...STATISTICS.map((statistic): ColumnSchema => ({
      name: `${state.yColumn}_${statistic}`,
      type: 'number',
      axis_label: statistic === 'mean' ? `${ySchema.axis_label} (mean)` : `${ySchema.axis_label} (${statistic})`,
    })),
  ]
  const dataset = new DatasetStore({ rows, rowIdColumn, schema })
  return Object.freeze({ dataset, sourceYColumn: state.yColumn, meanColumn, sourceRowIdsByAggregateId: membership })
}
