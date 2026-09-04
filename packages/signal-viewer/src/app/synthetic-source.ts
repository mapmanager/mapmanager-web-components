import type { SignalRangeRequest, SignalRangeResult, SignalSource } from '../core'

const SAMPLE_COUNT = 3_000_000
const SAMPLE_RATE = 10_000
export const SYNTHETIC_DURATION = SAMPLE_COUNT / SAMPLE_RATE
export const SYNTHETIC_PERIOD = 30

export type SyntheticDatasetId = 'recording-a' | 'recording-b'

export interface SyntheticDataset {
  id: SyntheticDatasetId
  label: string
  baseline: number
  oscillation: number
  spikeAmplitude: number
  phaseSeconds: number
  commandAmplitude: number
}

export const SYNTHETIC_DATASETS: readonly SyntheticDataset[] = [
  {
    id: 'recording-a', label: 'Recording A', baseline: -65, oscillation: 2,
    spikeAmplitude: 85, phaseSeconds: 15, commandAmplitude: 100,
  },
  {
    id: 'recording-b', label: 'Recording B', baseline: -58, oscillation: 4,
    spikeAmplitude: 72, phaseSeconds: 10, commandAmplitude: 60,
  },
]

/** Three-million-sample source generated lazily for range-loading demos. */
export class SyntheticSignalSource implements SignalSource {
  readonly dataset: SyntheticDataset

  constructor(datasetId: SyntheticDatasetId = 'recording-a') {
    const dataset = SYNTHETIC_DATASETS.find(({ id }) => id === datasetId)
    if (!dataset) throw new Error(`unknown synthetic dataset: ${datasetId}`)
    this.dataset = dataset
  }

  async describe() {
    return {
      id: this.dataset.id,
      sampleCount: SAMPLE_COUNT,
      xStart: 0,
      xStep: 1 / SAMPLE_RATE,
      xLabel: 'Time',
      xUnit: 's',
      yAxes: {
        left: { label: 'Membrane potential', unit: 'mV' },
        right: { label: 'Command', unit: 'pA' },
      },
      series: [
        { id: 'raw', label: 'Vm', style: { color: '#38bdf8' } },
        { id: 'command', label: 'Command', yAxis: 'right' as const, style: { color: '#f97316' } },
      ],
    }
  }

  async getRange(request: SignalRangeRequest): Promise<SignalRangeResult> {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const count = request.stopSample - request.startSample
    if (count <= request.targetPoints * 2) {
      return {
        startSample: request.startSample,
        stopSample: request.stopSample,
        series: request.seriesIds.map((id) => ({
          id,
          kind: 'samples' as const,
          values: Float64Array.from(
            { length: count },
            (_, index) => this.#valueAt(id, request.startSample + index),
          ),
        })),
      }
    }
    const factor = Math.max(2, Math.ceil(count / request.targetPoints))
    const bins = Math.ceil(count / factor)
    return {
      startSample: request.startSample,
      stopSample: request.stopSample,
      series: request.seriesIds.map((id) => {
        const minimum = new Float64Array(bins)
        const maximum = new Float64Array(bins)
        for (let bin = 0; bin < bins; bin += 1) {
          let low = Infinity
          let high = -Infinity
          const start = request.startSample + bin * factor
          const stop = Math.min(start + factor, request.stopSample)
          for (let sample = start; sample < stop; sample += 1) {
            const value = this.#valueAt(id, sample)
            low = Math.min(low, value)
            high = Math.max(high, value)
          }
          minimum[bin] = low
          maximum[bin] = high
        }
        return { id, kind: 'minmax' as const, factor, minimum, maximum }
      }),
    }
  }

  #valueAt(id: string, sample: number): number {
    const seconds = sample / SAMPLE_RATE
    const phase = positiveModulo(seconds - this.dataset.phaseSeconds, SYNTHETIC_PERIOD)
    if (id === 'command') {
      return phase <= 3 || phase >= SYNTHETIC_PERIOD - 3 ? this.dataset.commandAmplitude : 0
    }
    const baseline = this.dataset.baseline + this.dataset.oscillation * Math.sin(seconds * 2 * Math.PI / SYNTHETIC_PERIOD)
    const distance = Math.min(phase, SYNTHETIC_PERIOD - phase)
    const spike = distance <= 0.003 ? this.dataset.spikeAmplitude * Math.exp(-distance / 0.0008) : 0
    return baseline + spike
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
