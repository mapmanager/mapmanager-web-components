import type { ColumnSchema, NicePoolRow } from './types'

function cell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replaceAll('\t', ' ').replaceAll('\r', ' ').replaceAll('\n', ' ')
}

/** Format a complete rectangular NicePool table as spreadsheet-friendly TSV. */
export function formatTableToTsv(
  rows: readonly NicePoolRow[],
  columns: readonly ColumnSchema[],
): string {
  const lines = [columns.map(({ axis_label }) => cell(axis_label)).join('\t')]
  for (const source of rows) {
    lines.push(columns.map(({ name }) => cell(source[name])).join('\t'))
  }
  return lines.join('\n')
}
