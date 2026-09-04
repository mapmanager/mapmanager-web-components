/** Numeric values accepted without forcing callers to copy typed arrays. */
export type SignalValues = readonly number[] | Float32Array | Float64Array

/** Metadata for one line series sharing a track's Y axis. */
export interface SignalSeriesDescriptor {
  id: string
  label: string
  color: string
}

/** Stable metadata for one regularly sampled signal track. */
export interface SignalDescription {
  id: string
  sampleCount: number
  xStart: number
  xStep: number
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
  series: readonly SignalSeriesDescriptor[]
}

/** Half-open sample request made by the framework-independent controller. */
export interface SignalRangeRequest {
  startSample: number
  stopSample: number
  targetPoints: number
  seriesIds: readonly string[]
  signal?: AbortSignal
}

export interface SampleSeriesResult {
  id: string
  kind: 'samples'
  values: SignalValues
}

export interface MinMaxSeriesResult {
  id: string
  kind: 'minmax'
  factor: number
  minimum: SignalValues
  maximum: SignalValues
}

export type SignalSeriesResult = SampleSeriesResult | MinMaxSeriesResult

/** Range result. All series cover the declared half-open sample range. */
export interface SignalRangeResult {
  startSample: number
  stopSample: number
  series: readonly SignalSeriesResult[]
}

/** Application-provided source; storage and transport are intentionally opaque. */
export interface SignalSource {
  describe(signal?: AbortSignal): Promise<SignalDescription>
  getRange(request: SignalRangeRequest): Promise<SignalRangeResult>
}

export interface SignalViewport {
  xMin: number
  xMax: number
}

/** Read-only point drawn above signal data. */
export interface SignalOverlayPoint {
  id: string
  x: number
  y: number
  kind: string
  label?: string
  color?: string
  metadata?: Readonly<Record<string, unknown>>
}

/** Read-only interval drawn behind signal data. */
export interface SignalOverlayRegion {
  id: string
  xStart: number
  xStop: number
  kind: string
  label?: string
  color?: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface SignalOverlays {
  points: readonly SignalOverlayPoint[]
  regions?: readonly SignalOverlayRegion[]
  selectedPointId?: string | null
}

export interface LoadedSignalFrame {
  description: SignalDescription
  requestedViewport: SignalViewport
  result: SignalRangeResult
}
