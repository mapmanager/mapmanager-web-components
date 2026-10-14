import { describe, expect, it } from 'vitest'

import { formatTableToTsv } from '../src/core/table-format'

describe('table export', () => {
  it('copies every supplied row and column with schema labels', () => {
    const columns = [
      { name: 'id', type: 'string' as const, axis_label: 'Row ID' },
      { name: 'value', type: 'number' as const, axis_label: 'Value' },
      { name: 'note', type: 'string' as const, axis_label: 'Note' },
    ]
    const rows = [
      { id: 'a', value: 1, note: 'first\trow' },
      { id: 'b', value: null, note: 'second\nrow' },
    ]

    expect(formatTableToTsv(rows, columns)).toBe([
      'Row ID\tValue\tNote',
      'a\t1\tfirst row',
      'b\t\tsecond row',
    ].join('\n'))
  })

  it('still copies headers for an empty selection', () => {
    expect(formatTableToTsv([], [
      { name: 'id', type: 'string', axis_label: 'Row ID' },
    ])).toBe('Row ID')
  })
})
