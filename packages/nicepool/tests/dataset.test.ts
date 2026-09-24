import { describe, expect, it } from 'vitest'

import { DatasetStore, DatasetValidationError } from '../src/core'
import { edgeDataset } from './fixtures'

describe('DatasetStore', () => {
  it('builds stable identity and schema indexes', () => {
    const dataset = new DatasetStore(edgeDataset)
    expect(dataset.rowIndexById.get('c')).toBe(2)
    expect(dataset.numericColumns()).toEqual(['x', 'y'])
    expect(dataset.preFilterColumns()).toEqual(['accept'])
  })

  it('rejects duplicate IDs instead of silently choosing a row', () => {
    expect(() => new DatasetStore({
      rowIdColumn: 'id',
      rows: [{ id: 'same' }, { id: 'same' }],
    })).toThrow(DatasetValidationError)
  })

  it('uses caller-specified prefilter columns in order', () => {
    const dataset = new DatasetStore({ ...edgeDataset, preFilterColumns: ['condition', 'accept'] })
    expect(dataset.preFilterColumns()).toEqual(['condition', 'accept'])
  })

  it('supports numeric columns with categorical presentation capability', () => {
    const dataset = new DatasetStore({
      rowIdColumn: 'id',
      rows: [{ id: 1, epochLevel: 10 }, { id: 2, epochLevel: 2 }],
      schema: [
        { name: 'id', type: 'number', axis_label: 'ID', category: 'identity' },
        { name: 'epochLevel', type: 'number', axis_label: 'Epoch level', category: 'stimulus', categorical: true },
      ],
    })
    expect(dataset.numericColumns()).toEqual(['epochLevel'])
    expect(dataset.categoricalColumns()).toEqual(['epochLevel'])
    expect(dataset.uniqueValues('epochLevel')).toEqual([2, 10])
    expect(dataset.axisLabel('epochLevel')).toBe('Epoch level')
    expect(dataset.columnSchema('epochLevel').category).toBe('stimulus')
  })

  it('honors explicit categorical exclusions for nonnumeric columns', () => {
    const dataset = new DatasetStore({
      rowIdColumn: 'id',
      rows: [{ id: 1, included: 'yes', excluded: 'no', accepted: true }],
      schema: [
        { name: 'id', type: 'number', axis_label: 'ID' },
        { name: 'included', type: 'string', axis_label: 'Included' },
        { name: 'excluded', type: 'string', axis_label: 'Excluded', categorical: false },
        { name: 'accepted', type: 'boolean', axis_label: 'Accepted', categorical: false },
      ],
    })

    expect(dataset.categoricalColumns()).toEqual(['included'])
  })

  it('rejects unknown or duplicate prefilter columns', () => {
    expect(() => new DatasetStore({ ...edgeDataset, preFilterColumns: ['missing'] })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ ...edgeDataset, preFilterColumns: ['accept', 'accept'] })).toThrow(DatasetValidationError)
  })

  it('strictly validates caller-supplied column schemas', () => {
    const input = { rowIdColumn: 'id', rows: [{ id: 'a', value: 1 }] }
    const id = { name: 'id', type: 'string' as const, axis_label: 'ID' }
    const value = { name: 'value', type: 'number' as const, axis_label: 'Value' }
    expect(() => new DatasetStore({ ...input, schema: [id, id, value] })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ ...input, schema: [id, value, { name: 'extra', type: 'string', axis_label: 'Extra' }] })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ ...input, schema: [id, { ...value, categorical: 'yes' }] as never })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ ...input, schema: [id, { ...value, axis_label: '' }] })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ ...input, schema: [id, { ...value, category: '' }] })).toThrow(DatasetValidationError)
  })

  it('retains null but rejects implicit or non-JSON missing values', () => {
    const dataset = new DatasetStore({ rowIdColumn: 'id', rows: [{ id: 'a', value: null }] })
    expect(dataset.rows[0]?.value).toBeNull()
    expect(() => new DatasetStore({ rowIdColumn: 'id', rows: [{ id: 'a', value: 1 }, { id: 'b' } as never] })).toThrow(DatasetValidationError)
    expect(() => new DatasetStore({ rowIdColumn: 'id', rows: [{ id: 'a', value: Number.NaN }] })).toThrow(DatasetValidationError)
  })
})
