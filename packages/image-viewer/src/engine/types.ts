/** Axis names used by plane descriptors and Viv pixel sources. */
export type AxisName = 't' | 'c' | 'z' | 'y' | 'x'

export type DtypeName = 'uint8' | 'uint16' | 'float32'

export interface AxisCalibration {
  label: string
  unit: string
  step: number
}

export interface PlaneSource {
  kind: 'plane'
  id: string
  data: ArrayLike<number>
  dtype: DtypeName
  /** Length of `labels`. Last two axes must be `y` then `x`. */
  shape: number[]
  labels: AxisName[]
  xAxis?: AxisCalibration
  yAxis?: AxisCalibration
}

export type StoreRange =
  | { offset: number; length: number }
  | { suffixLength: number }

/** Minimal read-only store contract consumed by Viv's Zarrita loader. */
export interface OmeZarrReadableStore {
  get(key: `/${string}`, options?: unknown): Promise<Uint8Array | undefined>
  getRange?(
    key: `/${string}`,
    range: StoreRange,
    options?: unknown,
  ): Promise<Uint8Array | undefined>
}

export interface UrlOmeZarrSource {
  kind: 'ome-zarr'
  id: string
  url: string
  store?: never
}

export interface StoreOmeZarrSource {
  kind: 'ome-zarr'
  id: string
  store: OmeZarrReadableStore
  url?: never
}

export type OmeZarrSource = UrlOmeZarrSource | StoreOmeZarrSource

export type ImageSource = PlaneSource | OmeZarrSource

export interface PlaneSelection {
  t: number
  c: number
  z: number
}

export interface RectRoi {
  id: string
  kind: 'rect'
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface LineRoi {
  id: string
  kind: 'line'
  x0: number
  y0: number
  x1: number
  y1: number
}

export type Roi = RectRoi | LineRoi

export interface XyOverlay {
  id: string
  x: number[]
  y: number[]
  color?: string
}

export interface ViewWindow {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
  xLabel: string
  xUnit: string
  yLabel: string
  yUnit: string
}

export function sizeOf(source: Pick<PlaneSource, 'shape' | 'labels'>, axis: AxisName): number {
  const index = source.labels.indexOf(axis)
  if (index < 0) return 1
  const value = source.shape[index]
  if (value === undefined || value < 1) throw new Error(`invalid ${axis} size`)
  return value
}

export function assertPlaneLayout(labels: readonly AxisName[], shape: readonly number[]): void {
  if (labels.length !== shape.length) throw new Error('shape and labels must have equal length')
  if (labels.length < 2) throw new Error('image must include y and x')
  if (labels.at(-2) !== 'y' || labels.at(-1) !== 'x') {
    throw new Error('labels must end with y, x')
  }
  if (new Set(labels).size !== labels.length) throw new Error('duplicate axis labels')
  for (const size of shape) {
    if (!Number.isInteger(size) || size < 1) throw new Error('axis sizes must be positive integers')
  }
}
