import type { ColumnSchema } from '../core/types'

export interface IndexedColumnSchema {
  index: number
  column: ColumnSchema
}

export interface ColumnSchemaGroup {
  category: string
  columns: readonly IndexedColumnSchema[]
}

/** Group selectable columns without discarding caller-owned schema order. */
export function groupColumnSchemas(columns: readonly ColumnSchema[]): readonly ColumnSchemaGroup[] {
  const groupedColumns = new Map<string, ColumnSchema[]>()
  columns.forEach((column) => {
    const category = column.category ?? 'Uncategorized'
    const entries = groupedColumns.get(category) ?? []
    entries.push(column)
    groupedColumns.set(category, entries)
  })

  let index = 0
  return [...groupedColumns].map(([category, columns]) => ({
    category,
    columns: columns.map((column) => ({ index: ++index, column })),
  }))
}
