import { describe, expect, it } from 'vitest'

import { fullViewport, validateRangeResult, viewportSamples } from '../src/core'

const description = {
  id: 'trace',
  sampleCount: 1000,
  xStart: 0,
  xStep: 0.001,
  xLabel: 'Time',
  xUnit: 's',
  yAxes: { left: { label: 'Value', unit: 'mV' } },
  series: [{ id: 'raw', label: 'Raw', style: { color: '#fff' } }],
}

describe('signal ranges', () => {
  it('maps a viewport to clamped overscanned sample bounds', () => {
    expect(viewportSamples(description, { xMin: 0.2, xMax: 0.3 }, 0.1)).toEqual({
      startSample: 189,
      stopSample: 312,
    })
  })

  it('returns the complete calibrated viewport', () => {
    expect(fullViewport(description)).toEqual({ xMin: 0, xMax: 0.999 })
  })

  it('rejects mismatched sample result lengths', () => {
    expect(() => validateRangeResult(description, {
      startSample: 0,
      stopSample: 10,
      series: [{ id: 'raw', kind: 'samples', values: [1, 2] }],
    }, ['raw'])).toThrow('wrong length')
  })
})
