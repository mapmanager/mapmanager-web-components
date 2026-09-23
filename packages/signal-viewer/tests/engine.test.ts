import { describe, expect, it } from 'vitest'

import { SignalViewerEngine, type SignalRangeRequest, type SignalSource } from '../src/core'

class Source implements SignalSource {
  requests: SignalRangeRequest[] = []

  async describe() {
    return {
      id: 'source', sampleCount: 100, xStart: 0, xStep: 0.1,
      xLabel: 'Time', xUnit: 's', yAxes: { left: { label: 'Value', unit: 'mV' } },
      series: [{ id: 'raw', label: 'Raw', style: { color: '#fff' } }],
    }
  }

  async getRange(request: SignalRangeRequest) {
    this.requests.push(request)
    return {
      startSample: request.startSample,
      stopSample: request.stopSample,
      series: [{
        id: 'raw' as const,
        kind: 'samples' as const,
        values: new Float64Array(request.stopSample - request.startSample),
      }],
    }
  }
}

describe('SignalViewerEngine', () => {
  it('loads an overview and then a visible range', async () => {
    const source = new Source()
    const engine = new SignalViewerEngine()
    const initial = await engine.setSource(source, 500)
    expect(initial.requestedViewport).toEqual({ xMin: 0, xMax: 9.9 })

    const zoomed = await engine.setViewport({ xMin: 2, xMax: 3 }, 400)
    expect(zoomed.requestedViewport).toEqual({ xMin: 2, xMax: 3 })
    expect(source.requests).toHaveLength(2)
    expect(source.requests[1]?.startSample).toBeLessThan(20)
    expect(source.requests[1]?.stopSample).toBeGreaterThan(31)
  })

  it('loads an initial viewport without first loading the full range', async () => {
    const source = new Source()
    const engine = new SignalViewerEngine()
    const initial = await engine.setSource(source, 500, undefined, { xMin: 2, xMax: 3 })

    expect(initial.requestedViewport).toEqual({ xMin: 2, xMax: 3 })
    expect(source.requests).toHaveLength(1)
    expect(source.requests[0]?.startSample).toBeLessThan(20)
    expect(source.requests[0]?.stopSample).toBeGreaterThan(31)
  })

  it('loads only visible series and supports hiding all traces', async () => {
    const source = new Source()
    const engine = new SignalViewerEngine()
    await engine.setSource(source, 500)
    const hidden = await engine.setSeriesVisibility('raw', false, 500)
    expect(engine.getVisibleSeries()).toEqual([])
    expect(hidden.result.series).toEqual([])
    expect(source.requests).toHaveLength(1)
  })
})
