import { getChannelStats, loadOmeZarr, loadOmeZarrFromStore } from '@vivjs/loaders'

import { autoRange, histogramForValues, type Histogram } from './contrast-range'
import { defaultChannelColor } from './channel-luts'
import type { ViewerLayout } from './layout-panes'
import { parseOmeContrast, parseOmeScale } from './ome-metadata'
import { smallOmeZarrPlane } from './ome-zarr-fast-path'
import { OrientedPixelSource, type InnerPixelSource } from './oriented-pixel-source'
import { transposedAxes, transposedShape } from './orientation'
import {
  clampCounts,
  clampSelection,
  contrastLimits,
  planeHeight,
  planeWidth,
  samplePlaneValues,
} from './plane'
import { TiledPlanePixelSource } from './tile-source'
import type {
  ImageSource,
  PlaneSelection,
  PlaneSource,
  Roi,
  ViewWindow,
  XyOverlay,
  AxisCalibration,
  OmeZarrReadableStore,
} from './types'
import { vivSelection } from './viv-selection'

export type LoadedKind = 'plane' | 'ome-zarr'

const MAX_CONTRAST_SAMPLES = 2_000_000

export interface LoadedImage {
  generation: number
  sourceId: string
  kind: LoadedKind
  /** Display width after transpose (source height). */
  width: number
  /** Display height after transpose (source width). */
  height: number
  sourceWidth: number
  sourceHeight: number
  channelCount: number
  zCount: number
  tCount: number
  selection: PlaneSelection
  contrast: [number, number]
  labels: string[]
  dtype: string
  /** Viv rendering policy for an already-materialized, exactly tiled plane. */
  inMemoryTiles: boolean
  xLabel: string
  xUnit: string
  xStep: number
  yLabel: string
  yUnit: string
  yStep: number
  loaders: unknown[]
}

/** Session state: one pixel source, chrome, overlays. */
export class ImageViewerEngine {
  generation = 0
  loaded: LoadedImage | null = null
  rois: Roi[] = []
  selectedRoiId: string | null = null
  xyOverlays: XyOverlay[] = []
  error: string | null = null
  layout: ViewerLayout = 'single'
  axesVisible = true
  channelColors: [number, number, number][] = []
  channelContrast: [number, number][] = []
  #planeSource: PlaneSource | null = null
  #roiSerial = 0
  #histograms = new Map<number, Histogram | null>()

  async setSource(source: ImageSource, signal?: AbortSignal): Promise<LoadedImage> {
    const generation = this.generation + 1
    this.generation = generation
    this.error = null
    this.rois = []
    this.selectedRoiId = null
    this.xyOverlays = []
    this.channelColors = []
    this.channelContrast = []
    this.#planeSource = null
    this.#histograms.clear()
    try {
      const loaded =
        source.kind === 'plane'
          ? await this.#loadPlane(source, generation, signal)
          : await this.#loadOmeZarr(source, generation, signal)
      if (generation !== this.generation) throw abortError()
      this.loaded = loaded
      this.channelColors = Array.from({ length: loaded.channelCount }, (_, index) =>
        defaultChannelColor(index),
      )
      this.channelContrast = Array.from({ length: loaded.channelCount }, () => [...loaded.contrast])
      return loaded
    } catch (reason) {
      if (generation === this.generation) {
        this.loaded = null
        this.error = reason instanceof Error ? reason.message : String(reason)
      }
      throw reason
    }
  }

  setSelection(selection: Partial<PlaneSelection>): PlaneSelection {
    if (!this.loaded) throw new Error('no image is loaded')
    const next = clampCounts(
      {
        t: selection.t ?? this.loaded.selection.t,
        c: selection.c ?? this.loaded.selection.c,
        z: selection.z ?? this.loaded.selection.z,
      },
      { t: this.loaded.tCount, c: this.loaded.channelCount, z: this.loaded.zCount },
    )
    this.loaded = { ...this.loaded, selection: next }
    this.#histograms.clear()
    return next
  }

  setRois(rois: readonly Roi[]): void {
    this.rois = [...rois]
    if (this.selectedRoiId && !this.rois.some((roi) => roi.id === this.selectedRoiId)) {
      this.selectedRoiId = null
    }
  }

  nextRoiId(): string {
    this.#roiSerial += 1
    return `roi-${this.#roiSerial}`
  }

  addRoi(roi: Roi): Roi {
    if (this.rois.some((item) => item.id === roi.id)) {
      throw new Error(`duplicate ROI: ${roi.id}`)
    }
    this.rois = [...this.rois, roi]
    this.selectedRoiId = roi.id
    return roi
  }

  removeRoi(id: string): void {
    this.rois = this.rois.filter((roi) => roi.id !== id)
    if (this.selectedRoiId === id) this.selectedRoiId = null
  }

  selectRoi(id: string | null): void {
    if (id !== null && !this.rois.some((roi) => roi.id === id)) {
      throw new Error(`unknown ROI: ${id}`)
    }
    this.selectedRoiId = id
  }

  setChannelColor(channel: number, rgb: [number, number, number]): void {
    this.#requireChannel(channel)
    this.channelColors[channel] = [...rgb]
  }

  setChannelContrast(channel: number, contrast: [number, number]): void {
    this.#requireChannel(channel)
    const low = Math.min(contrast[0], contrast[1])
    const high = Math.max(contrast[0], contrast[1])
    this.channelContrast[channel] = [low, high]
  }

  /**
   * Apply source-row/column calibration. Display axes swap (transpose).
   *
   * Args:
   *   xAxis: Source column axis (`dx` along source x).
   *   yAxis: Source row axis (`dy` along source y).
   *
   * Raises:
   *   Error: If no image is loaded or a step is not positive.
   */
  setSourceAxes(xAxis: AxisCalibration, yAxis: AxisCalibration): void {
    if (!this.loaded) throw new Error('no image is loaded')
    if (!(xAxis.step > 0) || !(yAxis.step > 0)) throw new Error('axis step must be positive')
    const display = transposedAxes(xAxis, yAxis)
    this.loaded = {
      ...this.loaded,
      xLabel: display.x.label,
      xUnit: display.x.unit,
      xStep: display.x.step,
      yLabel: display.y.label,
      yUnit: display.y.unit,
      yStep: display.y.step,
    }
  }

  async planeSamples(channel: number): Promise<number[]> {
    this.#requireChannel(channel)
    const loaded = this.loaded
    if (!loaded) throw new Error('no image is loaded')
    if (this.#planeSource) {
      return samplePlaneValues(this.#planeSource, { ...loaded.selection, c: channel })
    }
    const source = loaded.loaders[0] as InnerPixelSource | undefined
    if (!source || typeof source.getRaster !== 'function') return []
    const raster = await source.getRaster({
      selection: vivSelection(loaded.labels, { ...loaded.selection, c: channel }),
    })
    return sampledList(raster.data)
  }

  async autoChannelContrast(channel: number): Promise<[number, number]> {
    const samples = await this.planeSamples(channel)
    const range = autoRange(samples)
    this.setChannelContrast(channel, range)
    return range
  }

  async channelHistogram(channel: number): Promise<Histogram | null> {
    this.#requireChannel(channel)
    const cached = this.#histograms.get(channel)
    if (cached !== undefined) return cached
    const samples = await this.planeSamples(channel)
    const histogram = histogramForValues(samples)
    this.#histograms.set(channel, histogram)
    return histogram
  }

  #requireChannel(channel: number): void {
    if (!this.loaded) throw new Error('no image is loaded')
    if (!Number.isInteger(channel) || channel < 0 || channel >= this.loaded.channelCount) {
      throw new Error(`invalid channel: ${channel}`)
    }
  }

  setXyOverlays(overlays: readonly XyOverlay[]): void {
    this.xyOverlays = overlays.map((overlay) => ({
      ...overlay,
      x: [...overlay.x],
      y: [...overlay.y],
    }))
  }

  viewWindow(): ViewWindow | null {
    const loaded = this.loaded
    if (!loaded) return null
    return {
      xMin: 0,
      xMax: (loaded.width - 1) * loaded.xStep,
      yMin: 0,
      yMax: (loaded.height - 1) * loaded.yStep,
      xLabel: loaded.xLabel,
      xUnit: loaded.xUnit,
      yLabel: loaded.yLabel,
      yUnit: loaded.yUnit,
    }
  }

  async refreshPlaneContrast(): Promise<[number, number] | null> {
    if (!this.loaded || !this.#planeSource) return null
    if (this.loaded.sourceWidth * this.loaded.sourceHeight > MAX_CONTRAST_SAMPLES) {
      return this.loaded.contrast
    }
    const source = this.loaded.loaders[0]
    if (!(source instanceof OrientedPixelSource)) return null
    const raster = await source.getRaster({
      selection: vivSelection(source.labels, this.loaded.selection),
    })
    const contrast = contrastLimits(raster.data)
    this.loaded = { ...this.loaded, contrast }
    this.channelContrast[this.loaded.selection.c] = [...contrast]
    return contrast
  }

  async #loadPlane(
    source: ImageSource & { kind: 'plane' },
    generation: number,
    signal?: AbortSignal,
  ): Promise<LoadedImage> {
    throwIfAborted(signal)
    this.#planeSource = source
    const selection = clampSelection(source, { t: 0, c: 0, z: 0 })
    const sourceWidth = planeWidth(source)
    const sourceHeight = planeHeight(source)
    const loaders = [new OrientedPixelSource(new TiledPlanePixelSource(source))]
    const finest = loaders[0]
    if (!finest) throw new Error('plane pyramid is empty')
    const contrast =
      sourceWidth * sourceHeight > MAX_CONTRAST_SAMPLES
        ? defaultContrast('Uint16')
        : contrastLimits(
            (
              await finest.getRaster({
                selection: vivSelection(finest.labels, selection),
              })
            ).data,
          )
    throwIfAborted(signal)
    if (generation !== this.generation) throw abortError()
    const display = transposedShape(sourceHeight, sourceWidth)
    const displayAxes = transposedAxes(
      source.xAxis ?? { label: 'x', unit: 'px', step: 1 },
      source.yAxis ?? { label: 'y', unit: 'px', step: 1 },
    )
    return {
      generation,
      sourceId: source.id,
      kind: 'plane',
      width: display.width,
      height: display.height,
      sourceWidth,
      sourceHeight,
      channelCount: axisCount(source, 'c'),
      zCount: axisCount(source, 'z'),
      tCount: axisCount(source, 't'),
      selection,
      contrast,
      labels: [...source.labels],
      dtype: finest.dtype,
      inMemoryTiles: true,
      xLabel: displayAxes.x.label,
      xUnit: displayAxes.x.unit,
      xStep: displayAxes.x.step,
      yLabel: displayAxes.y.label,
      yUnit: displayAxes.y.unit,
      yStep: displayAxes.y.step,
      loaders,
    }
  }

  async #loadOmeZarr(
    source: ImageSource & { kind: 'ome-zarr' },
    generation: number,
    signal?: AbortSignal,
  ): Promise<LoadedImage> {
    throwIfAborted(signal)
    const result =
      'url' in source
        ? await loadOmeZarr(resolveSourceUrl(source.url), {
            type: 'multiscales',
            ...(signal ? { fetchOptions: { signal } } : {}),
          })
        : await loadOmeZarrFromStore(withAbortSignal(source.store, signal))
    throwIfAborted(signal)
    if (generation !== this.generation) throw abortError()
    const innerLoaders = Array.isArray(result.data) ? result.data : [result.data]
    const innerFinest = innerLoaders[0]
    if (!innerFinest) throw new Error('OME-Zarr contained no resolutions')
    const labels = [...((innerFinest.labels ?? []) as string[])]
    const sourceShape = [...((innerFinest.shape ?? []) as number[])]
    const scale = parseOmeScale(result.metadata)
    const omero = parseOmeContrast(result.metadata)
    const plane = await smallOmeZarrPlane(
      source.id,
      innerLoaders as InnerPixelSource[],
      signal,
    )
    if (plane) {
      plane.xAxis = { label: 'x', unit: scale.xUnit, step: scale.x }
      plane.yAxis = { label: 'y', unit: scale.yUnit, step: scale.y }
      const loaded = await this.#loadPlane(plane, generation, signal)
      return { ...loaded, kind: 'ome-zarr', contrast: omero ?? loaded.contrast }
    }
    const loaders = innerLoaders.map((loader) => new OrientedPixelSource(loader as InnerPixelSource))
    const finest = loaders[0]
    if (!finest) throw new Error('OME-Zarr contained no resolutions')
    const contrast = omero ?? (await contrastFromLoader(loaders.at(-1) ?? finest, labels, signal))
    throwIfAborted(signal)
    if (generation !== this.generation) throw abortError()
    const sourceWidth = axisSize(labels, sourceShape, 'x')
    const sourceHeight = axisSize(labels, sourceShape, 'y')
    const display = transposedShape(sourceHeight, sourceWidth)
    const displayAxes = transposedAxes(
      { label: 'x', unit: scale.xUnit, step: scale.x },
      { label: 'y', unit: scale.yUnit, step: scale.y },
    )
    return {
      generation,
      sourceId: source.id,
      kind: 'ome-zarr',
      width: display.width,
      height: display.height,
      sourceWidth,
      sourceHeight,
      channelCount: axisSize(labels, sourceShape, 'c'),
      zCount: axisSize(labels, sourceShape, 'z'),
      tCount: axisSize(labels, sourceShape, 't'),
      selection: { t: 0, c: 0, z: 0 },
      contrast,
      labels,
      dtype: String(finest.dtype ?? 'Uint16'),
      inMemoryTiles: false,
      xLabel: displayAxes.x.label,
      xUnit: displayAxes.x.unit,
      xStep: displayAxes.x.step,
      yLabel: displayAxes.y.label,
      yUnit: displayAxes.y.unit,
      yStep: displayAxes.y.step,
      loaders,
    }
  }
}

function axisCount(source: PlaneSource, axis: 't' | 'c' | 'z'): number {
  const index = source.labels.indexOf(axis)
  if (index < 0) return 1
  return Math.max(1, source.shape[index] ?? 1)
}

function axisSize(labels: readonly string[], shape: readonly number[], axis: string): number {
  const index = labels.indexOf(axis)
  if (index < 0) return 1
  const size = shape[index]
  return typeof size === 'number' && size > 0 ? size : 1
}

async function contrastFromLoader(
  loader: {
    getRaster?: (args: {
      selection: Record<string, number>
      signal?: AbortSignal
    }) => Promise<{ data: ArrayLike<number> }>
    labels?: string[]
    dtype?: string
  },
  labels: readonly string[],
  signal?: AbortSignal,
): Promise<[number, number]> {
  if (typeof loader.getRaster !== 'function') {
    return defaultContrast(loader.dtype)
  }
  try {
    const raster = await loader.getRaster({
      selection: vivSelection(loader.labels ?? labels, { t: 0, c: 0, z: 0 }),
      ...(signal ? { signal } : {}),
    })
    const stats = getChannelStats(raster.data as Parameters<typeof getChannelStats>[0])
    const limits = stats.contrastLimits
    const low = limits[0]
    const high = limits[1]
    if (low !== undefined && high !== undefined && low !== high) {
      return [low, high]
    }
    return contrastLimits(raster.data)
  } catch {
    return defaultContrast(loader.dtype)
  }
}

function defaultContrast(dtype: string | undefined): [number, number] {
  if (dtype === 'Uint8' || dtype === 'Int8') return [0, 255]
  if (dtype === 'Float32' || dtype === 'Float64') return [0, 1]
  return [0, 65535]
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function sampledList(data: ArrayLike<number>, maxSamples = 120_000): number[] {
  const samples: number[] = []
  const step = Math.max(1, Math.floor(data.length / Math.max(1, maxSamples)))
  for (let index = 0; index < data.length; index += step) {
    const value = Number(data[index])
    if (Number.isFinite(value)) samples.push(value)
  }
  return samples
}

function resolveSourceUrl(url: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url
  const base = globalThis.location?.href
  return typeof base === 'string' ? new URL(url, base).href : url
}

function withAbortSignal(
  store: OmeZarrReadableStore,
  signal?: AbortSignal,
): OmeZarrReadableStore {
  if (!signal) return store
  return {
    get: (key, options) => store.get(key, mergeSignal(options, signal)),
    ...(store.getRange
      ? {
          getRange: (key, range, options) =>
            store.getRange!(key, range, mergeSignal(options, signal)),
        }
      : {}),
  }
}

function mergeSignal(options: unknown, signal: AbortSignal): { signal: AbortSignal } {
  if (options && typeof options === 'object') return { ...options, signal }
  return { signal }
}
