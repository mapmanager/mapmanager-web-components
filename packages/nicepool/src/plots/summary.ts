import { descriptiveStatistics, quartileStatistics } from '../core/statistics'
import type { PlotSummary, PreparedPlotData, SummaryRow } from './types'

/** Summarize the exact immutable prepared rows consumed by Plotly rendering. */
export function summarizePlot(data: PreparedPlotData): PlotSummary {
  const categoryPositions = new Map(
    ('categories' in data ? data.categories : []).map((category, index) => [category, index]),
  )
  const groupPosition = (groupValue: string | null): number =>
    groupValue === null ? -1 : (categoryPositions.get(groupValue) ?? categoryPositions.size)
  const grouped = new Map<string, { groupValue: string | null; colorValue: string | null; values: number[] }>()
  for (const point of data.points) {
    const key = JSON.stringify([point.groupValue, point.colorValue])
    const entry = grouped.get(key) ?? {
      groupValue: point.groupValue,
      colorValue: point.colorValue,
      values: [],
    }
    entry.values.push(point.y)
    grouped.set(key, entry)
  }
  const aggregateRows: SummaryRow[] = [...grouped.values()]
    .sort((a, b) => categoryPositions.size
      ? groupPosition(a.groupValue) - groupPosition(b.groupValue)
        || (a.colorValue ?? '').localeCompare(b.colorValue ?? '')
      : `${a.groupValue ?? ''}\u0000${a.colorValue ?? ''}`.localeCompare(`${b.groupValue ?? ''}\u0000${b.colorValue ?? ''}`))
    .map(({ groupValue, colorValue, values }) => ({
      groupValue,
      colorValue,
      statistics: {
        ...descriptiveStatistics(values, data.state.cvEpsilon),
        ...(data.type === 'box' || data.type === 'violin' ? quartileStatistics(values) : {}),
      },
    }))
  const pointsInPlotOrder = categoryPositions.size
    ? [...data.points].sort((a, b) => groupPosition(a.groupValue) - groupPosition(b.groupValue))
    : data.points
  const representedRows = pointsInPlotOrder.map((point) => ({
    rowId: point.rowId,
    x: data.type === 'swarm' ? point.groupValue : point.x,
    y: point.y,
    groupValue: point.groupValue,
    colorValue: point.colorValue,
  }))
  return Object.freeze({
    plotType: data.type,
    parameters: data.state,
    aggregateRows: Object.freeze(aggregateRows),
    representedRows: Object.freeze(representedRows),
    ...('bins' in data ? { bins: Object.freeze(data.bins) } : {}),
  })
}
