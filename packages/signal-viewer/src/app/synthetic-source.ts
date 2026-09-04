import type { SignalRangeRequest, SignalRangeResult, SignalSource } from '../core'

const SAMPLE_COUNT = 3_000_000
const SAMPLE_RATE = 10_000

/** Three-million-sample source generated lazily for range-loading demos. */
export class SyntheticSignalSource implements SignalSource {
  async describe() {
    return {
      id: 'synthetic-three-million',
      sampleCount: SAMPLE_COUNT,
      xStart: 0,
      xStep: 1 / SAMPLE_RATE,
      xLabel: 'Time',
      xUnit: 's',
      yLabel: 'Membrane potential',
      yUnit: 'mV',
      series: [{ id: 'raw', label: 'Vm', color: '#38bdf8' }],
    }
  }

  async getRange(request: SignalRangeRequest): Promise<SignalRangeResult> {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const count = request.stopSample - request.startSample
    if (count <= request.targetPoints * 2) {
      const values = Float64Array.from({ length: count }, (_, index) =>
        valueAt(request.startSample + index),
      )
      return {
        startSample: request.startSample,
        stopSample: request.stopSample,
        series: [{ id: 'raw', kind: 'samples', values }],
      }
    }
    const factor = Math.max(2, Math.ceil(count / request.targetPoints))
    const bins = Math.ceil(count / factor)
    const minimum = new Float64Array(bins)
    const maximum = new Float64Array(bins)
    for (let bin = 0; bin < bins; bin += 1) {
      let low = Infinity
      let high = -Infinity
      const start = request.startSample + bin * factor
      const stop = Math.min(start + factor, request.stopSample)
      for (let sample = start; sample < stop; sample += 1) {
        const value = valueAt(sample)
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
      minimum[bin] = low
      maximum[bin] = high
    }
    return {
      startSample: request.startSample,
      stopSample: request.stopSample,
      series: [{ id: 'raw', kind: 'minmax', factor, minimum, maximum }],
    }
  }
}

function valueAt(sample: number): number {
  const seconds = sample / SAMPLE_RATE
  const baseline = -65 + 2 * Math.sin(seconds * Math.PI * 0.7)
  const phase = sample % 20_000
  const spike = phase >= 9_980 && phase <= 10_030
    ? 85 * Math.exp(-Math.abs(phase - 10_000) / 8)
    : 0
  return baseline + spike
}
