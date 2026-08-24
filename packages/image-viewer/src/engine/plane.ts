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

function allocatePlane(dtype: DtypeName, length: number): Uint8Array | Uint16Array | Float32Array {
  if (dtype === 'uint8') return new Uint8Array(length)
  if (dtype === 'uint16') return new Uint16Array(length)
  return new Float32Array(length)
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
