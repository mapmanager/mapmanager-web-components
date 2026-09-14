import type { PlotSummary } from './types'

const AGGREGATE_COLUMNS = ['count', 'min', 'max', 'mean', 'median', 'std', 'sem', 'cv'] as const

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return text.replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ')
}

function row(values: readonly unknown[]): string {
  return values.map(cell).join('\t')
}

/** Format the full Python-compatible plot report for clipboard export. */
export function formatPlotSummaryToTsv(
  summary: PlotSummary,
  options: { includeParameters?: boolean; includeRepresentedRows?: boolean } = {},
): string {
  const includeParameters = options.includeParameters ?? true
  const includeRepresentedRows = options.includeRepresentedRows ?? true
  const groupColumn = summary.parameters.groupColumn
  const colorColumn = summary.parameters.colorColumn
  const dimensionHeaders = [
    ...(groupColumn ? [groupColumn] : []),
    ...(colorColumn ? [colorColumn] : []),
  ]
  const dimensions = (groupValue: string | null, colorValue: string | null): unknown[] => [
    ...(groupColumn ? [groupValue] : []),
    ...(colorColumn ? [colorValue] : []),
  ]
  const lines: string[] = []
  if (includeParameters) {
    lines.push('=== Plot state ===')
    for (const [key, value] of Object.entries(summary.parameters)) {
      lines.push(row([key, value]))
    }
  }

  const aggregateColumns = summary.plotType === 'box' || summary.plotType === 'violin'
    ? ['count', 'min', 'q1', 'median', 'q3', 'max', 'iqr', 'mean', 'std', 'sem', 'cv'] as const
    : AGGREGATE_COLUMNS
  if (lines.length) lines.push('')
  lines.push('=== Summary table ===', row([...dimensionHeaders, ...aggregateColumns]))
  for (const aggregate of summary.aggregateRows) {
    lines.push(row([
      ...dimensions(aggregate.groupValue, aggregate.colorValue),
      ...aggregateColumns.map((column) => aggregate.statistics[column]),
    ]))
  }

  if (summary.bins) {
    lines.push('', '=== Bins ===', row([...dimensionHeaders, 'lower', 'upper', 'center', 'count', 'cumulative_count', 'cumulative_proportion']))
    for (const bin of summary.bins) lines.push(row([
      ...dimensions(bin.groupValue, bin.colorValue), bin.lower, bin.upper, bin.center,
      bin.count, bin.cumulativeCount, bin.cumulativeProportion,
    ]))
  }

  if (includeRepresentedRows) {
    lines.push('', '=== Raw data ===', row(['row_id', 'x', 'y', ...dimensionHeaders]))
    for (const represented of summary.representedRows) {
      lines.push(row([
        represented.rowId, represented.x, represented.y,
        ...dimensions(represented.groupValue, represented.colorValue),
      ]))
    }
  }
  return lines.join('\n')
}
