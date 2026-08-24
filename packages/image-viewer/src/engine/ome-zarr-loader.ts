import * as zarr from 'zarrita'

import type { DtypeName, PlaneSelection, PlaneSource } from './types'
import { assertPlaneLayout } from './types'

interface OmeDataset {
  path: string
  coordinateTransformations?: Array<{
    type: string
    scale?: number[]
  }>
}

interface OmeRootMetadata {
  attributes?: {
    ome?: {
      multiscales?: Array<{
        axes?: Array<{ name: string; unit?: string }>
        datasets?: OmeDataset[]
      }>
    }
  }
}

interface OmeArrayMetadata {
  shape?: number[]
  data_type?: string
  dimension_names?: string[]
}

export interface OmeZarrPlane {
  source: PlaneSource
  channelCount: number
  zCount: number
  tCount: number
}

/** Full-plane raster is used when Y×X is at most this many samples. */
export const MAX_RENDERED_PIXELS = 1_500_000

/** Same join as CloudScope Web: `{store}/zarr.json`, never the directory URL. */
export function zarrJsonUrl(zarrUrl: URL): URL {
  return new URL(`${zarrUrl.href.replace(/\/$/, '')}/zarr.json`)
}

async function fetchJson<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, signal ? { signal } : {})
  if (!response.ok) {
    throw new Error(`Could not load ${url.href} (${response.status})`)
  }
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Resource at ${url.href} was not JSON`)
  }
}

export async function fetchRootMetadata(
  zarrUrl: URL,
  signal?: AbortSignal,
): Promise<OmeRootMetadata> {
  return fetchJson<OmeRootMetadata>(zarrJsonUrl(zarrUrl), signal)
}

function axisSize(dims: readonly string[], shape: readonly number[], axis: string): number {
  const index = dims.findIndex((name) => name.toLowerCase() === axis)
  if (index < 0) return 1
  const size = shape[index]
  return typeof size === 'number' && size > 0 ? size : 1
}

function planeSelection(dims: readonly string[], indices: PlaneSelection): Array<null | number> {
  return dims.map((dim) => {
    switch (dim.toLowerCase()) {
      case 'y':
      case 'x':
        return null
      case 'c':
        return indices.c
      case 'z':
        return indices.z
      case 't':
        return indices.t
      default:
        throw new Error(`Unsupported image dimension: ${dim}`)
    }
  })
}

function renderedPixelCount(shape: readonly number[], dims: readonly string[]): number {
  const y = shape[dims.findIndex((dim) => dim.toLowerCase() === 'y')] ?? 0
  const x = shape[dims.findIndex((dim) => dim.toLowerCase() === 'x')] ?? 0
  return y * x
}

/** True when a YX plane is small enough to decode once into memory. */
export function planeFitsInMemory(height: number, width: number): boolean {
  return height > 0 && width > 0 && height * width <= MAX_RENDERED_PIXELS
}

/**
 * Load the finest YX plane when it fits in memory; otherwise `null` (use Viv tiles).
 *
 * Does not down-pick a coarser pyramid level. A large finest plane stays on the
 * tiled HTTP path.
 */
export async function loadOmeZarrPlaneIfSmall(
  href: string,
  id: string,
  indices: PlaneSelection,
  signal?: AbortSignal,
): Promise<OmeZarrPlane | null> {
  const zarrUrl = new URL(href.replace(/\/?$/, '/'))
  const metadata = await fetchRootMetadata(zarrUrl, signal)
  const first = metadata.attributes?.ome?.multiscales?.[0]?.datasets?.[0]
  const axes = metadata.attributes?.ome?.multiscales?.[0]?.axes
  if (!first || !axes?.length) return null
  const arrayMeta = await fetchJson<OmeArrayMetadata>(
    new URL(`${zarrUrl.href.replace(/\/$/, '')}/${first.path}/zarr.json`),
    signal,
  )
  if (!Array.isArray(arrayMeta.shape) || typeof arrayMeta.data_type !== 'string') return null
  const dims = arrayMeta.dimension_names ?? axes.map(({ name }) => name)
  if (dims.length !== arrayMeta.shape.length) return null
  if (!planeFitsInMemory(
    axisSize(dims, arrayMeta.shape, 'y'),
    axisSize(dims, arrayMeta.shape, 'x'),
  )) {
    return null
  }
  return loadOmeZarrPlane(href, id, indices, signal)
}

function asDtype(dataType: string): DtypeName {
  const name = dataType.toLowerCase()
  if (name === 'uint8') return 'uint8'
  if (name === 'uint16') return 'uint16'
  if (name === 'float32') return 'float32'
  throw new Error(`Unsupported OME-Zarr data type: ${dataType}`)
}

function copyPlane(
  data: ArrayLike<number>,
  dtype: DtypeName,
): Uint8Array | Uint16Array | Float32Array {
  if (dtype === 'uint8') {
    return data instanceof Uint8Array ? data : Uint8Array.from(data as ArrayLike<number>)
  }
  if (dtype === 'uint16') {
    return data instanceof Uint16Array ? data : Uint16Array.from(data as ArrayLike<number>)
  }
  return data instanceof Float32Array ? data : Float32Array.from(data as ArrayLike<number>)
}

async function chooseLevel(
  group: zarr.Group<zarr.FetchStore>,
  paths: string[],
  dims: string[],
  signal?: AbortSignal,
): Promise<{ array: zarr.Array<zarr.DataType, zarr.FetchStore>; path: string }> {
  let fallback: { array: zarr.Array<zarr.DataType, zarr.FetchStore>; path: string } | null = null
  for (const path of paths) {
    const array = await zarr.open(
      group.resolve(path),
      signal ? { kind: 'array', signal } : { kind: 'array' },
    )
    fallback = { array, path }
    if (renderedPixelCount(array.shape, dims) <= MAX_RENDERED_PIXELS) return fallback
  }
  if (fallback) return fallback
  throw new Error('OME-Zarr metadata does not list an image pyramid')
}

function scaleForAxis(
  name: 'x' | 'y',
  dims: readonly string[],
  dataset: OmeDataset,
  metadata: OmeRootMetadata,
): { step: number; unit: string } {
  const index = dims.findIndex((dim) => dim.toLowerCase() === name)
  const scale = dataset.coordinateTransformations?.find(({ type }) => type === 'scale')?.scale?.[
    index
  ]
  const axis = metadata.attributes?.ome?.multiscales?.[0]?.axes?.find(
    (item) => item.name.toLowerCase() === name,
  )
  return {
    step: typeof scale === 'number' && scale > 0 ? scale : 1,
    unit: axis?.unit ?? 'px',
  }
}

/**
 * Load one YX plane from an HTTP OME-Zarr image group (not a collection root).
 * Matches CloudScope Web: read `zarr.json`, then zarrita `get`.
 */
export async function loadOmeZarrPlane(
  href: string,
  id: string,
  indices: PlaneSelection,
  signal?: AbortSignal,
): Promise<OmeZarrPlane> {
  const zarrUrl = new URL(href.replace(/\/?$/, '/'))
  const metadata = await fetchRootMetadata(zarrUrl, signal)
  const multiscale = metadata.attributes?.ome?.multiscales?.[0]
  const first = multiscale?.datasets?.[0]
  const axes = multiscale?.axes
  const datasets = multiscale?.datasets
  const paths = datasets?.map(({ path }) => path)
  if (!first || !axes?.length || !paths?.length || !datasets) {
    throw new Error(
      `OME-Zarr at ${zarrUrl.href} has no ome.multiscales (collection root is not an image)`,
    )
  }

  const arrayMeta = await fetchJson<OmeArrayMetadata>(
    new URL(`${zarrUrl.href.replace(/\/$/, '')}/${first.path}/zarr.json`),
    signal,
  )
  if (
    !Array.isArray(arrayMeta.shape) ||
    !arrayMeta.shape.every((value) => Number.isInteger(value) && value > 0) ||
    typeof arrayMeta.data_type !== 'string'
  ) {
    throw new Error('OME-Zarr array metadata has an invalid shape or data type')
  }
  const dims = arrayMeta.dimension_names ?? axes.map(({ name }) => name)
  if (dims.length !== arrayMeta.shape.length || dims.some((name) => typeof name !== 'string')) {
    throw new Error('OME-Zarr array dimensions do not match its shape')
  }

  const store = new zarr.FetchStore(zarrUrl, {
    fetch: (request) => fetch(request, signal ? { signal } : {}),
  })
  const group = await zarr.open(store, signal ? { kind: 'group', signal } : { kind: 'group' })
  const { array, path } = await chooseLevel(group, paths, dims, signal)
  const dataset = datasets.find((candidate) => candidate.path === path)
  if (!dataset) throw new Error(`OME-Zarr metadata does not describe pyramid level ${path}`)
  const result = await zarr.get(array, planeSelection(dims, indices), signal ? { signal } : {})
  if (typeof result !== 'object' || result === null || !('shape' in result)) {
    throw new Error('Selected OME-Zarr data is not an image plane')
  }
  const plane = result as zarr.Chunk<zarr.DataType>
  if (plane.shape.length !== 2 || Array.isArray(plane.data)) {
    throw new Error(`Expected a two-dimensional numeric image, received ${plane.shape.join('×')}`)
  }
  const height = plane.shape[0]
  const width = plane.shape[1]
  if (height === undefined || width === undefined) {
    throw new Error('OME-Zarr plane is missing Y or X size')
  }
  const dtype = asDtype(arrayMeta.data_type)
  const labels: PlaneSource['labels'] = ['y', 'x']
  const shape = [height, width]
  assertPlaneLayout(labels, shape)
  const xAxis = scaleForAxis('x', dims, dataset, metadata)
  const yAxis = scaleForAxis('y', dims, dataset, metadata)
  return {
    source: {
      kind: 'plane',
      id,
      data: copyPlane(plane.data as ArrayLike<number>, dtype),
      dtype,
      shape,
      labels,
      xAxis: { label: 'x', unit: xAxis.unit, step: xAxis.step },
      yAxis: { label: 'y', unit: yAxis.unit, step: yAxis.step },
    },
    channelCount: axisSize(dims, arrayMeta.shape, 'c'),
    zCount: axisSize(dims, arrayMeta.shape, 'z'),
    tCount: axisSize(dims, arrayMeta.shape, 't'),
  }
}
