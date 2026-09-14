import { describe, expect, it } from 'vitest'

import { groupColumnSchemas } from '../src/vue/columnSelection'

describe('column selector grouping', () => {
  it('preserves category and schema order while numbering the rendered rows', () => {
    const groups = groupColumnSchemas([
      { name: 'epoch', type: 'number', axis_label: 'Epoch', category: 'stimulus' },
      { name: 'thresholdSec', type: 'number', axis_label: 'Threshold time', category: 'timing' },
      { name: 'epochLevel', type: 'number', axis_label: 'Epoch level', category: 'stimulus' },
      { name: 'custom', type: 'string', axis_label: 'Custom' },
    ])

    expect(groups.map(({ category }) => category)).toEqual(['stimulus', 'timing', 'Uncategorized'])
    expect(groups[0]?.columns.map(({ index, column }) => [index, column.name])).toEqual([[1, 'epoch'], [2, 'epochLevel']])
    expect(groups[1]?.columns.map(({ index, column }) => [index, column.name])).toEqual([[3, 'thresholdSec']])
    expect(groups[2]?.columns.map(({ index, column }) => [index, column.name])).toEqual([[4, 'custom']])
    expect(groups[0]?.columns.map(({ column }) => column.axis_label)).toEqual(['Epoch', 'Epoch level'])
  })
})
