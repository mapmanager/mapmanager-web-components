/** Numeric values accepted without forcing callers to copy typed arrays. */
export type SignalValues = readonly number[] | Float32Array | Float64Array

/** Supported viewer color themes. */
export type SignalViewerTheme = 'dark' | 'light'

/** The two supported independent Y axes. */
export type SignalYAxisId = 'left' | 'right'

/** Independently visible axis chrome controlled by callers. */
export type SignalAxisId = 'x' | 'y'

/** Explicit numeric range for one Y axis. */
export interface SignalAxisRange { min: number; max: number }

/** Automatic or caller-controlled range policy for one Y axis. */
export type SignalAxisRangeSetting = 'auto' | SignalAxisRange

/** Labels, units, and initial range policy for one Y axis. */
export interface SignalYAxisConfig {
  label: string
  unit: string
  range?: SignalAxisRangeSetting
}

/** Centralized visual options for one signal trace. */
export interface SignalTraceStyle {
  color?: string
  lineWidth?: number
  markers?: boolean
  markerSize?: number
}

/** Fully resolved visual options used by renderers. */
export interface ResolvedSignalTraceStyle {
  color: string
  lineWidth: number
  markers: boolean
  markerSize: number
}

/** Metadata for one trace in a loaded signal source. */
export interface SignalSeriesDescriptor {
  /** Stable programmatic identity. Labels may change; IDs may not. */
  id: string
  label: string
  yAxis?: SignalYAxisId
  style?: SignalTraceStyle
}

/** Stable metadata for aligned, regularly sampled traces. */
export interface SignalDescription {
  id: string
  sampleCount: number
  xStart: number
  xStep: number
  xLabel: string
  xUnit: string
  yAxes: { left: SignalYAxisConfig; right?: SignalYAxisConfig }
  series: readonly SignalSeriesDescriptor[]
}

/** A complete in-memory regularly sampled trace. */
export interface SignalTrace {
  id: string
  label?: string
  values: SignalValues
  xStart: number
  xStep: number
  yAxis?: SignalYAxisId
  visible?: boolean
  style?: SignalTraceStyle
}

/** Mutable fields accepted when updating an in-memory trace. */
export type SignalTraceUpdate = Partial<Omit<SignalTrace, 'id'>>

/** Half-open sample request made by the framework-independent controller. */
export interface SignalRangeRequest {
  startSample: number
  stopSample: number
  targetPoints: number
  seriesIds: readonly string[]
  signal?: AbortSignal
}

/** Full-resolution values for one requested trace. */
export interface SampleSeriesResult { id: string; kind: 'samples'; values: SignalValues }

/** Minimum and maximum values for fixed-width source sample bins. */
export interface MinMaxSeriesResult {
  id: string
  kind: 'minmax'
  factor: number
  minimum: SignalValues
  maximum: SignalValues
}

/** One full-resolution or reduced trace result. */
export type SignalSeriesResult = SampleSeriesResult | MinMaxSeriesResult

/** Range result covering the declared half-open sample interval. */
export interface SignalRangeResult {
  startSample: number
  stopSample: number
  series: readonly SignalSeriesResult[]
}

/**
 * Application-provided signal source.
 *
 * Storage and transport are opaque. All traces must share one regular X
 * calibration and sample count.
 */
export interface SignalSource {
  /** Describe the source without loading complete signal arrays. */
  describe(signal?: AbortSignal): Promise<SignalDescription>
  /** Load only the requested half-open sample range and series IDs. */
  getRange(request: SignalRangeRequest): Promise<SignalRangeResult>
}

/** Calibrated visible X interval. */
export interface SignalViewport { xMin: number; xMax: number }

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

/** A named scatter overlay whose individual points remain independently selectable. */
export interface SignalScatterSeries {
  /** Stable programmatic identity. */
  id: string
  label?: string
  points: readonly SignalOverlayPoint[]
  visible?: boolean
  color?: string
}

/** Mutable fields accepted when updating a named scatter overlay. */
export type SignalScatterSeriesUpdate = Partial<Omit<SignalScatterSeries, 'id'>>

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

/** Complete read-only overlay replacement. */
export interface SignalOverlays {
  scatterSeries: readonly SignalScatterSeries[]
  regions?: readonly SignalOverlayRegion[]
  selectedPointId?: string | null
}

/** Built-in persistent measurement cursor identity. */
export type SignalCursorId = 'a' | 'b' | 'c' | 'd'

/** State for one persistent measurement cursor. */
export interface SignalCursor {
  id: SignalCursorId
  value: number | null
  visible: boolean
  color?: string
}

/** Complete cursor state returned to callers and cursor events. */
export type SignalCursorState = Record<SignalCursorId, SignalCursor>

/** Release-time cursor event with convenient A/B and C/D differences. */
export interface SignalCursorChange {
  changedId: SignalCursorId
  cursors: SignalCursorState
  /** B minus A in calibrated X units, or null unless both are visible. */
  deltaX: number | null
  /** D minus C in left-axis units, or null unless both are visible. */
  deltaY: number | null
}

/** Validated range data and the viewport that requested it. */
export interface LoadedSignalFrame {
  description: SignalDescription
  requestedViewport: SignalViewport
  result: SignalRangeResult
}
