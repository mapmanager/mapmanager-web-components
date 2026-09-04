import type {
  SignalDescription,
  SignalRangeRequest,
  SignalRangeResult,
  SignalTrace,
  SignalTraceUpdate,
  SignalYAxisConfig,
  SignalYAxisId,
  SignalValues,
} from './types'

/** Metadata used to construct an in-memory signal source. */
export interface InMemorySignalSourceOptions {
  id?: string
  xLabel?: string
  xUnit?: string
  yAxes?: { left?: SignalYAxisConfig; right?: SignalYAxisConfig }
}

/**
 * Mutable convenience source for callers that already hold complete arrays.
 *
 * Values are borrowed rather than copied. Callers should use `updateTrace()`
 * after replacing an array instead of mutating an array while it is displayed.
 */
export class InMemorySignalSource {
  #traces: SignalTrace[] = []
  readonly options: InMemorySignalSourceOptions

  constructor(traces: readonly SignalTrace[], options: InMemorySignalSourceOptions = {}) {
    this.options = options.yAxes ? { ...options, yAxes: { ...options.yAxes } } : { ...options }
    this.setTraces(traces)
  }

  /** Return shallow trace copies without copying potentially large arrays. */
  get traces(): readonly SignalTrace[] {
    return this.#traces.map(cloneTrace)
  }

  /** Replace all traces after validating shared X calibration and length. */
  setTraces(traces: readonly SignalTrace[]): void {
    validateTraces(traces)
    this.#traces = traces.map(cloneTrace)
  }

  /** Add one aligned trace with a unique stable ID. */
  addTrace(trace: SignalTrace): void {
    if (this.#traces.some(({ id }) => id === trace.id)) throw new Error(`duplicate trace id: ${trace.id}`)
    this.setTraces([...this.#traces, trace])
  }

  /** Update one trace without changing its stable ID. */
  updateTrace(id: string, update: SignalTraceUpdate): void {
    const index = this.#traces.findIndex((trace) => trace.id === id)
    if (index < 0) throw new Error(`unknown trace id: ${id}`)
    const existing = this.#traces[index]
    if (!existing) throw new Error(`unknown trace id: ${id}`)
    const next: SignalTrace = {
      ...existing,
      ...update,
      id,
      ...(update.style ? { style: { ...update.style } } : existing.style ? { style: existing.style } : {}),
    }
    this.setTraces(this.#traces.map((trace, traceIndex) => traceIndex === index ? next : trace))
  }

  /** Describe all in-memory traces without copying their values. */
  async describe(): Promise<SignalDescription> {
    const first = this.#traces[0]
    if (!first) throw new Error('at least one trace is required')
    return {
      id: this.options.id ?? 'in-memory-signals',
      sampleCount: first.values.length,
      xStart: first.xStart,
      xStep: first.xStep,
      xLabel: this.options.xLabel ?? 'X',
      xUnit: this.options.xUnit ?? '',
      yAxes: {
        left: this.options.yAxes?.left ?? { label: 'Value', unit: '' },
        ...(hasAxis(this.#traces, 'right')
          ? { right: this.options.yAxes?.right ?? { label: 'Value', unit: '' } }
          : {}),
      },
      series: this.#traces.map((trace) => ({
        id: trace.id,
        label: trace.label ?? trace.id,
        yAxis: trace.yAxis ?? 'left',
        ...(trace.style ? { style: { ...trace.style } } : {}),
      })),
    }
  }

  /** Load full samples or an on-demand min/max reduction for the requested IDs. */
  async getRange(request: SignalRangeRequest): Promise<SignalRangeResult> {
    if (request.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
    const count = request.stopSample - request.startSample
    const factor = count > request.targetPoints * 2
      ? Math.max(2, Math.ceil(count / request.targetPoints))
      : 1
    return {
      startSample: request.startSample,
      stopSample: request.stopSample,
      series: request.seriesIds.map((id) => {
        const trace = this.#traces.find((candidate) => candidate.id === id)
        if (!trace) throw new Error(`unknown trace id: ${id}`)
        if (factor === 1) {
          return {
            id,
            kind: 'samples' as const,
            values: sliceValues(trace.values, request.startSample, request.stopSample),
          }
        }
        const { minimum, maximum } = reduceMinMax(
          trace.values,
          request.startSample,
          request.stopSample,
          factor,
        )
        return { id, kind: 'minmax' as const, factor, minimum, maximum }
      }),
    }
  }
}

function validateTraces(traces: readonly SignalTrace[]): void {
  if (traces.length === 0) throw new Error('at least one trace is required')
  const first = traces[0]
  if (!first) throw new Error('at least one trace is required')
  if (!first.id || first.values.length < 2 || !Number.isFinite(first.xStart) || !(first.xStep > 0)) {
    throw new Error('trace id, values, xStart, and xStep are invalid')
  }
  const ids = new Set<string>()
  for (const trace of traces) {
    if (!trace.id || ids.has(trace.id)) throw new Error(`duplicate or empty trace id: ${trace.id}`)
    ids.add(trace.id)
    if (
      trace.values.length !== first.values.length ||
      trace.xStart !== first.xStart ||
      trace.xStep !== first.xStep
    ) {
      throw new Error('all traces must have identical xStart, xStep, and sample count')
    }
  }
}

function cloneTrace(trace: SignalTrace): SignalTrace {
  return trace.style ? { ...trace, style: { ...trace.style } } : { ...trace }
}

function hasAxis(traces: readonly SignalTrace[], axis: SignalYAxisId): boolean {
  return traces.some((trace) => (trace.yAxis ?? 'left') === axis)
}

function sliceValues(values: SignalValues, start: number, stop: number): SignalValues {
  return values.slice(start, stop) as SignalValues
}

function reduceMinMax(
  values: SignalValues,
  start: number,
  stop: number,
  factor: number,
): { minimum: Float64Array; maximum: Float64Array } {
  const bins = Math.ceil((stop - start) / factor)
  const minimum = new Float64Array(bins)
  const maximum = new Float64Array(bins)
  for (let bin = 0; bin < bins; bin += 1) {
    let low = Infinity
    let high = -Infinity
    const binStart = start + bin * factor
    const binStop = Math.min(binStart + factor, stop)
    for (let index = binStart; index < binStop; index += 1) {
      const value = values[index]
      if (value !== undefined && Number.isFinite(value)) {
        low = Math.min(low, value)
        high = Math.max(high, value)
      }
    }
    minimum[bin] = low === Infinity ? Number.NaN : low
    maximum[bin] = high === -Infinity ? Number.NaN : high
  }
  return { minimum, maximum }
}
