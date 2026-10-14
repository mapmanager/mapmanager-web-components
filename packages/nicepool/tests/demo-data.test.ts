import { describe, expect, it } from 'vitest'

import type { ColumnSchema } from '../src/core/types'
import { parseDemoCsv } from '../src/app/demoData'

describe('browser demo CSV boundary', () => {
  it('uses schema-directed numbers and normalizes blank cells', () => {
    const schema: ColumnSchema[] = [
      { name: 'id', type: 'string', axis_label: 'ID' },
      { name: 'group', type: 'string', axis_label: 'Group', categorical: true },
      { name: 'value', type: 'number', axis_label: 'Value' },
    ]
    expect(parseDemoCsv('id,group,value\na,control,1.5\nb,,\n', schema)).toEqual([
      { id: 'a', group: 'control', value: 1.5 },
      { id: 'b', group: null, value: null },
    ])
  })

  it('rejects CSV columns that differ from the schema', () => {
    expect(() => parseDemoCsv('id,other\na,1\n', [
      { name: 'id', type: 'string', axis_label: 'ID' },
    ])).toThrow('CSV columns do not match')
  })
})
