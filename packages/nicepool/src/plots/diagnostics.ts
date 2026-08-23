import type { DatasetStore } from '../core/dataset'
import type { PlotState } from '../core/types'
import type { PreparedPlotData } from './types'

function requiredColumns(state: PlotState): readonly string[] {
  if (state.plotType === 'scatter') return [state.xColumn, state.yColumn]
  if (state.plotType === 'histogram' || state.plotType === 'cumulativeHistogram') return [state.xColumn]
  return state.groupColumn === null ? [state.yColumn] : [state.groupColumn, state.yColumn]
}

/** Explain why a prepared plot contains no represented rows. */
export function describeEmptyPlot(
  dataset: DatasetStore,
  state: PlotState,
  prepared: PreparedPlotData,
): string | null {
  if (prepared.points.length > 0) return null
  const missingColumn = requiredColumns(state).find((column) =>
    dataset.rows.every((row) => row[column] === null || row[column] === undefined || row[column] === ''),
  )
  if (missingColumn) return `No rows can be plotted: “${missingColumn}” contains only missing values.`
  return 'No rows can be plotted with the current plot settings.'
}
