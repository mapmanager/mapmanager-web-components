import { describe, expect, it } from 'vitest'

import { InMemorySignalSource } from '../src/core'

const trace = (id: string, values: readonly number[] = [1, 2, 3, 4]) => ({
  id, values, xStart: 0, xStep: 0.1,
})

describe('InMemorySignalSource', () => {
  it('supports wholesale replacement, addition, and updates', async () => {
    const source = new InMemorySignalSource([trace('vm')])
    source.addTrace({ ...trace('command'), yAxis: 'right' })
    source.updateTrace('vm', { label: 'Membrane potential', style: { lineWidth: 3 } })
    expect((await source.describe()).series).toMatchObject([
      { id: 'vm', label: 'Membrane potential', yAxis: 'left' },
      { id: 'command', yAxis: 'right' },
    ])
    source.setTraces([trace('replacement')])
    expect((await source.describe()).series.map(({ id }) => id)).toEqual(['replacement'])
  })

  it('requires identical regular X calibration and sample count', () => {
    expect(() => new InMemorySignalSource([
      trace('vm'),
      { ...trace('command'), xStep: 0.2 },
    ])).toThrow('identical xStart, xStep, and sample count')
  })

  it('returns min/max data when a request is wider than the target', async () => {
    const source = new InMemorySignalSource([trace('vm', [3, 1, 7, 2])])
    const result = await source.getRange({
      startSample: 0, stopSample: 4, targetPoints: 1, seriesIds: ['vm'],
    })
    const series = result.series[0]
    expect(series?.kind).toBe('minmax')
    if (series?.kind === 'minmax') {
      expect(Array.from(series.minimum)).toEqual([1])
      expect(Array.from(series.maximum)).toEqual([7])
    }
  })
})
