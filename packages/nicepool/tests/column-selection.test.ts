import { describe, expect, it } from 'vitest'

import { groupColumnSchemas } from '../src/vue/columnSelection'

describe('column selector grouping', () => {
  it('preserves first-seen category and schema order with global indices', () => {
    const groups = groupColumnSchemas([
      { name: 'epoch', type: 'number', axis_label: 'Epoch', category: 'stimulus' },
      { name: 'thresholdSec', type: 'number', axis_label: 'Threshold time', category: 'timing' },
      { name: 'epochLevel', type: 'number', axis_label: 'Epoch level', category: 'stimulus' },
      { name: 'custom', type: 'string', axis_label: 'Custom' },
    ])

    expect(groups.map(({ category }) => category)).toEqual(['stimulus', 'timing', 'Uncategorized'])
    expect(groups[0]?.columns.map(({ index, column }) => [index, column.name])).toEqual([[1, 'epoch'], [3, 'epochLevel']])
    expect(groups[1]?.columns.map(({ index, column }) => [index, column.name])).toEqual([[2, 'thresholdSec']])
  })
})
