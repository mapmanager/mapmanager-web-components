import type { AxisName, DtypeName, PlaneSelection, PlaneSource } from './types'
import { assertPlaneLayout, sizeOf } from './types'

export function planeWidth(source: PlaneSource): number {
  return sizeOf(source, 'x')
}

export function planeHeight(source: PlaneSource): number {
  return sizeOf(source, 'y')
}

export function clampSelection(source: PlaneSource, selection: PlaneSelection): PlaneSelection {
  return {
    t: clampIndex(selection.t, sizeOf(source, 't')),
    c: clampIndex(selection.c, sizeOf(source, 'c')),
    z: clampIndex(selection.z, sizeOf(source, 'z')),
  }
}

export function clampCounts(
  selection: PlaneSelection,
  counts: { t: number; c: number; z: number },
): PlaneSelection {
  return {
    t: clampIndex(selection.t, counts.t),
    c: clampIndex(selection.c, counts.c),
    z: clampIndex(selection.z, counts.z),
  }
}

function clampIndex(value: number, size: number): number {
  if (!Number.isInteger(value)) throw new Error('selection indices must be integers')
  return Math.min(Math.max(0, value), Math.max(0, size - 1))
}

function sampleOffset(shape: readonly number[], indices: readonly number[]): number {
  let offset = 0
  let stride = 1
  for (let axis = shape.length - 1; axis >= 0; axis -= 1) {
    const size = shape[axis]
    const index = indices[axis]
    if (size === undefined || index === undefined) throw new Error('shape/index mismatch')
    offset += index * stride
    stride *= size
  }
  return offset
}

/** Copy one YX plane from a YX / CYX / ZCYX (or T…) array into a dense buffer. */
export function extractYxPlane(source: PlaneSource, selection: PlaneSelection): {
  data: Uint8Array | Uint16Array | Float32Array
  width: number
  height: number
} {
  assertPlaneLayout(source.labels, source.shape)
  const chosen = clampSelection(source, selection)
  const width = planeWidth(source)
  const height = planeHeight(source)
  const yIndex = source.labels.indexOf('y')
  const xIndex = source.labels.indexOf('x')
  const coords = source.labels.map((axis: AxisName) => {
    if (axis === 't') return chosen.t
    if (axis === 'c') return chosen.c
    if (axis === 'z') return chosen.z
    return 0
  })
  const plane = allocatePlane(source.dtype, width * height)
  for (let y = 0; y < height; y += 1) {
    coords[yIndex] = y
    for (let x = 0; x < width; x += 1) {
      coords[xIndex] = x
      plane[y * width + x] = Number(source.data[sampleOffset(source.shape, coords)])
    }
  }
  return { data: plane, width, height }
}

/**
 * Stride-sample one YX plane without copying every pixel.
 *
 * Args:
 *   source: Dense plane volume.
 *   selection: t/c/z to read.
 *   maxSamples: Maximum finite values to return.
 *
 * Returns:
 *   Intensity samples in scan order.
 */
export function samplePlaneValues(
  source: PlaneSource,
  selection: PlaneSelection,
  maxSamples = 120_000,
): number[] {
  assertPlaneLayout(source.labels, source.shape)
  const chosen = clampSelection(source, selection)
  const width = planeWidth(source)
  const height = planeHeight(source)
  const total = width * height
  const step = Math.max(1, Math.floor(total / Math.max(1, maxSamples)))
  const yIndex = source.labels.indexOf('y')
  const xIndex = source.labels.indexOf('x')
  const coords = source.labels.map((axis: AxisName) => {
    if (axis === 't') return chosen.t
    if (axis === 'c') return chosen.c
    if (axis === 'z') return chosen.z
    return 0
  })
  const samples: number[] = []
  for (let index = 0; index < total && samples.length < maxSamples; index += step) {
    const y = Math.floor(index / width)
    const x = index % width
    coords[yIndex] = y
    coords[xIndex] = x
    const value = Number(source.data[sampleOffset(source.shape, coords)])
    if (Number.isFinite(value)) samples.push(value)
  }
  return samples
}

function allocatePlane(dtype: DtypeName, length: number): Uint8Array | Uint16Array | Float32Array {
  if (dtype === 'uint8') return new Uint8Array(length)
  if (dtype === 'uint16') return new Uint16Array(length)
  return new Float32Array(length)
}

/**
 * Half-size Y and X (floor, at least 1). Other axes unchanged.
 *
 * Args:
 *   source: Dense plane volume, labels ending in y, x.
 *
 * Returns:
 *   A new plane whose Y and X sizes are `max(1, floor(size / 2))`.
 */
export function downsamplePlaneHalf(source: PlaneSource): PlaneSource {
  assertPlaneLayout(source.labels, source.shape)
  const ySize = planeHeight(source)
  const xSize = planeWidth(source)
  const newY = Math.max(1, Math.floor(ySize / 2))
  const newX = Math.max(1, Math.floor(xSize / 2))
  const yIndex = source.labels.indexOf('y')
  const xIndex = source.labels.indexOf('x')
  const shape = source.shape.map((size, index) => {
    if (index === yIndex) return newY
    if (index === xIndex) return newX
    return size
  })
  const data = allocatePlane(source.dtype, shape.reduce((product, size) => product * size, 1))
  const destCoords = source.labels.map(() => 0)
  const sourceCoords = source.labels.map(() => 0)
  const write = (axis: number) => {
    if (axis === source.labels.length) {
      for (let index = 0; index < destCoords.length; index += 1) {
        sourceCoords[index] = destCoords[index] ?? 0
      }
      const destY = destCoords[yIndex] ?? 0
      const destX = destCoords[xIndex] ?? 0
      sourceCoords[yIndex] = Math.min(ySize - 1, Math.floor((destY * ySize) / newY))
      sourceCoords[xIndex] = Math.min(xSize - 1, Math.floor((destX * xSize) / newX))
      data[sampleOffset(shape, destCoords)] = Number(source.data[sampleOffset(source.shape, sourceCoords)])
      return
    }
    const size = shape[axis]
    if (size === undefined) throw new Error('shape/index mismatch')
    for (let index = 0; index < size; index += 1) {
      destCoords[axis] = index
      write(axis + 1)
    }
  }
  write(0)
  return {
    ...source,
    id: `${source.id}-half`,
    data,
    shape,
  }
}

/**
 * Finest-first dyadic pyramid until both Y and X are `<= maxEdge`.
 *
 * Viv `MultiscaleImageLayer` treats `loader[i]` as 2^i smaller than finest and
 * draws `loader.at(-1)` as the background `ImageLayer`.
 *
 * Args:
 *   source: Dense plane volume, labels ending in y, x.
 *   maxEdge: Stop when both Y and X are at most this (typically `TILE_SIZE`).
 *
 * Returns:
 *   `[source, half, …]` with the original object first.
 *
 * Raises:
 *   Error: if `maxEdge` is not >= 1.
 */
export function planePyramidSources(source: PlaneSource, maxEdge: number): PlaneSource[] {
  if (!(maxEdge >= 1)) throw new Error('maxEdge must be >= 1')
  const levels = [source]
  let current = source
  while (planeHeight(current) > maxEdge || planeWidth(current) > maxEdge) {
    const next = downsamplePlaneHalf(current)
    if (planeHeight(next) === planeHeight(current) && planeWidth(next) === planeWidth(current)) {
      break
    }
    levels.push(next)
    current = next
  }
  return levels
}

export function contrastLimits(data: ArrayLike<number>): [number, number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (let i = 0; i < data.length; i += 1) {
    const value = Number(data[i])
    if (!Number.isFinite(value)) continue
    if (value < min) min = value
    if (value > max) max = value
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [0, 1]
  return [min, max]
}
