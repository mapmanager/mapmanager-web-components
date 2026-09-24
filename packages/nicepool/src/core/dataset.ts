import {
  DatasetValidationError,
  type ColumnSchema,
  type DatasetInput,
  type NicePoolRow,
  type NicePoolValue,
  type RowId,
} from './types'

const AUTO_FILTER_COLUMNS = ['accept', 'channel', 'roi_id'] as const
const COLUMN_TYPES = new Set(['number', 'string', 'boolean', 'categorical'])

function normalizedId(value: NicePoolValue | undefined, rowIndex: number, column: string): RowId {
  if (value === null || value === undefined || String(value).length === 0) {
    throw new DatasetValidationError(`Row ${rowIndex} has an empty row ID in ${JSON.stringify(column)}`)
  }
  return String(value)
}

function inferColumn(name: string, rows: readonly NicePoolRow[]): ColumnSchema {
  const values = rows.map((row) => row[name]).filter((value) => value !== null && value !== undefined)
  const type = values.length > 0 && values.every((value) => typeof value === 'number')
    ? 'number'
    : values.length > 0 && values.every((value) => typeof value === 'boolean')
      ? 'boolean'
      : 'string'
  return { name, type, axis_label: name }
}

function validateValue(value: unknown, rowIndex: number, column: string): asserts value is NicePoolValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  throw new DatasetValidationError(
    `Row ${rowIndex} column ${JSON.stringify(column)} must be string, finite number, boolean, or null`,
  )
}

/** Immutable dataset snapshot plus indexes derived during full initialization. */
export class DatasetStore {
  readonly rows: readonly NicePoolRow[]
  readonly rowIdColumn: string
  readonly schema: readonly ColumnSchema[]
  readonly #preFilterColumns: readonly string[]
  readonly rowIndexById: ReadonlyMap<RowId, number>

  constructor(input: DatasetInput) {
    if (!input.rowIdColumn) throw new DatasetValidationError('rowIdColumn must not be empty')
    const columnNames = new Set<string>()
    for (const row of input.rows) Object.keys(row).forEach((name) => columnNames.add(name))
    if (!columnNames.has(input.rowIdColumn)) {
      throw new DatasetValidationError(`Dataset is missing row-ID column ${JSON.stringify(input.rowIdColumn)}`)
    }
    const rowIndexById = new Map<RowId, number>()
    const rows = input.rows.map((source, index) => {
      for (const column of columnNames) {
        if (!(column in source)) {
          throw new DatasetValidationError(`Row ${index} is missing column ${JSON.stringify(column)}; use null for missing values`)
        }
        validateValue(source[column], index, column)
      }
      const row = { ...source }
      const rowId = normalizedId(row[input.rowIdColumn], index, input.rowIdColumn)
      if (rowIndexById.has(rowId)) throw new DatasetValidationError(`Duplicate row ID ${JSON.stringify(rowId)}`)
      row[input.rowIdColumn] = rowId
      rowIndexById.set(rowId, index)
      return Object.freeze(row)
    })
    const declared = input.schema ? [...input.schema] : [...columnNames].map((name) => inferColumn(name, rows))
    const declaredNames = new Set(declared.map(({ name }) => name))
    if (declaredNames.size !== declared.length) throw new DatasetValidationError('Schema column names must be unique')
    for (const column of declared) {
      if (!columnNames.has(column.name)) throw new DatasetValidationError(`Schema declares unknown column ${JSON.stringify(column.name)}`)
      if (!COLUMN_TYPES.has(column.type)) throw new DatasetValidationError(`Schema column ${JSON.stringify(column.name)} has an invalid type`)
      if (typeof column.axis_label !== 'string' || !column.axis_label.trim()) {
        throw new DatasetValidationError(`Schema column ${JSON.stringify(column.name)} axis_label must be a nonempty string`)
      }
      if (column.category !== undefined && (typeof column.category !== 'string' || !column.category.trim())) {
        throw new DatasetValidationError(`Schema column ${JSON.stringify(column.name)} category must be a nonempty string`)
      }
      if (column.categorical !== undefined && typeof column.categorical !== 'boolean') {
        throw new DatasetValidationError(`Schema column ${JSON.stringify(column.name)} categorical flag must be boolean`)
      }
    }
    for (const name of columnNames) {
      if (!declaredNames.has(name)) throw new DatasetValidationError(`Schema does not declare column ${JSON.stringify(name)}`)
    }
    const preFilterColumns = input.preFilterColumns ?? AUTO_FILTER_COLUMNS.filter((name) => declaredNames.has(name))
    for (const name of preFilterColumns) {
      if (!declaredNames.has(name)) throw new DatasetValidationError(`Prefilter references unknown column ${JSON.stringify(name)}`)
    }
    if (new Set(preFilterColumns).size !== preFilterColumns.length) {
      throw new DatasetValidationError('Prefilter columns must be unique')
    }
    this.rows = Object.freeze(rows)
    this.rowIdColumn = input.rowIdColumn
    this.schema = Object.freeze(declared)
    this.#preFilterColumns = Object.freeze([...preFilterColumns])
    this.rowIndexById = rowIndexById
  }

  /** Return columns explicitly or conventionally suitable for prefilters. */
  preFilterColumns(): readonly string[] {
    return this.#preFilterColumns
  }

  /** Return the resolved schema entry for one known column. */
  columnSchema(name: string): ColumnSchema {
    const column = this.schema.find((entry) => entry.name === name)
    if (!column) throw new DatasetValidationError(`Unknown column ${JSON.stringify(name)}`)
    return column
  }

  /** Return the caller-owned axis label for one known column. */
  axisLabel(name: string): string {
    return this.columnSchema(name).axis_label
  }

  /** Return finite numeric columns from the resolved schema. */
  numericColumns(): readonly string[] {
    return this.schema.filter(({ name, type }) => name !== this.rowIdColumn && type === 'number').map(({ name }) => name)
  }

  /** Return columns suitable for group and color controls. */
  categoricalColumns(): readonly string[] {
    return this.schema
      .filter(({ name, type, categorical }) =>
        name !== this.rowIdColumn
        && (categorical === true || (categorical === undefined && type !== 'number')))
      .map(({ name }) => name)
  }

  /** Return sorted, canonical values for one filter control. */
  uniqueValues(column: string): readonly NicePoolValue[] {
    const values = new Map<string, NicePoolValue>()
    for (const row of this.rows) {
      const value = row[column]
      if (value !== null && value !== undefined) values.set(categoryKey(value), value)
    }
    return [...values.entries()].sort(([a], [b]) => this.compareCategories(column, a, b)).map(([, value]) => value)
  }

  /** Compare canonical category keys using the column's declared storage type. */
  compareCategories(column: string, left: string, right: string): number {
    const schema = this.schema.find(({ name }) => name === column)
    if (schema?.type === 'number') return Number(left) - Number(right)
    return left.localeCompare(right)
  }
}

/** Canonical comparison key for categorical values. */
export function categoryKey(value: NicePoolValue): string {
  return String(value)
}

/** Apply AND-connected categorical filters without copying row objects. */
export function filteredRowIndices(
  dataset: DatasetStore,
  filters: Readonly<Record<string, NicePoolValue>>,
): readonly number[] {
  return dataset.rows.flatMap((row, index) => {
    for (const [column, expected] of Object.entries(filters)) {
      if (expected === null) continue
      const actual = row[column]
      if (actual === undefined || categoryKey(actual) !== categoryKey(expected)) return []
    }
    return [index]
  })
}

/** Coerce supported scalar input to a finite number or return null. */
export function finiteNumber(value: NicePoolValue | undefined): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}
