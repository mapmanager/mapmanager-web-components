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
  const groups = new Map<string, IndexedColumnSchema[]>()
  columns.forEach((column, offset) => {
    const category = column.category ?? 'Uncategorized'
    const entries = groups.get(category) ?? []
    entries.push({ index: offset + 1, column })
    groups.set(category, entries)
  })
  return [...groups].map(([category, entries]) => ({ category, columns: entries }))
}
