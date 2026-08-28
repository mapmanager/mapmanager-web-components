import type { AxisName, PlaneSource } from './types'
import { assertPlaneLayout } from './types'

export type LayoutName = 'YX' | 'CYX' | 'ZCYX'

const LAYOUTS: Record<LayoutName, AxisName[]> = {
  YX: ['y', 'x'],
  CYX: ['c', 'y', 'x'],
  ZCYX: ['z', 'c', 'y', 'x'],
}

/** Demo shapes. CYX matches YX spatially so channel-offset blobs stay visible. */
export const SYNTHETIC_SHAPE: Record<LayoutName, readonly number[]> = {
  YX: [384, 512],
  CYX: [2, 384, 512],
  ZCYX: [6, 2, 256, 320],
}

const FLOOR = 4000
const PEAK = 52000
const BAR_PERIOD = 64
const CHANNEL_OFFSET_X = 0.22
const CHANNEL_OFFSET_Y = 0.18
const BLOB_FRACTIONS: ReadonlyArray<readonly [number, number]> = [
  [0.35, 0.38],
  [0.62, 0.32],
  [0.48, 0.68],
]

/** Build a uint16 volume. Pass `shape` in tests to avoid large allocations. */
export function syntheticPlaneSource(
  layout: LayoutName,
  shape: readonly number[] = SYNTHETIC_SHAPE[layout],
): PlaneSource {
  const labels = LAYOUTS[layout]
  assertPlaneLayout(labels, shape)
  const data = new Uint16Array(shape.reduce((product, size) => product * size, 1))
  fillVolume(data, labels, shape)
  return {
    kind: 'plane',
    id: `synthetic-${layout.toLowerCase()}`,
    data,
    dtype: 'uint16',
    shape: [...shape],
    labels,
    xAxis: { label: 'x', unit: 'px', step: 1 },
    yAxis: { label: 'y', unit: 'px', step: 1 },
  }
}

function fillVolume(data: Uint16Array, labels: readonly AxisName[], shape: readonly number[]): void {
  const ySize = sizeOf(labels, shape, 'y')
  const xSize = sizeOf(labels, shape, 'x')
  const cSize = labels.includes('c') ? sizeOf(labels, shape, 'c') : 1
  const zSize = labels.includes('z') ? sizeOf(labels, shape, 'z') : 1
  const layout: LayoutName = labels.includes('z') ? 'ZCYX' : labels.includes('c') ? 'CYX' : 'YX'
  let i = 0
  for (let z = 0; z < zSize; z += 1) {
    for (let c = 0; c < cSize; c += 1) {
      for (let y = 0; y < ySize; y += 1) {
        for (let x = 0; x < xSize; x += 1) {
          data[i] = sample(layout, x, y, c, z, xSize, ySize, zSize)
          i += 1
        }
      }
    }
  }
}

/**
 * YX: soft vertical cosine bars (not binary) so contrast min/max has a ramp.
 * CYX: 2D Gaussian blobs, channel 1 offset so channels only partially overlap.
 * ZCYX: 3D Gaussians with the same channel offset plus XY drift through z.
 */
function sample(
  layout: LayoutName,
  x: number,
  y: number,
  c: number,
  z: number,
  xSize: number,
  ySize: number,
  zSize: number,
): number {
  if (layout === 'YX') return softBar(x)
  if (layout === 'CYX') return blobs2d(x, y, c, xSize, ySize)
  return blobs3d(x, y, z, c, xSize, ySize, zSize)
}

function softBar(x: number): number {
  const grating = 0.5 * (1 + Math.cos((2 * Math.PI * x) / BAR_PERIOD))
  return toUint16(FLOOR + grating * (PEAK - FLOOR))
}

function blobs2d(x: number, y: number, c: number, xSize: number, ySize: number): number {
  return toUint16(FLOOR + (PEAK - FLOOR) * blobField2d(x, y, c, xSize, ySize, 0, 0))
}

function blobs3d(
  x: number,
  y: number,
  z: number,
  c: number,
  xSize: number,
  ySize: number,
  zSize: number,
): number {
  const zMid = (zSize - 1) / 2
  const driftX = (z - zMid) * 0.08 * xSize
  const driftY = (z - zMid) * 0.05 * ySize
  const cz = (c === 0 ? 0.35 : 0.65) * Math.max(zSize - 1, 1)
  const sigmaZ = Math.max(0.85, zSize * 0.4)
  const zWeight = Math.exp(-0.5 * ((z - cz) / sigmaZ) ** 2)
  return toUint16(FLOOR + (PEAK - FLOOR) * blobField2d(x, y, c, xSize, ySize, driftX, driftY) * zWeight)
}

function blobField2d(
  x: number,
  y: number,
  c: number,
  xSize: number,
  ySize: number,
  driftX: number,
  driftY: number,
): number {
  const offsetX = c === 0 ? 0 : CHANNEL_OFFSET_X * xSize
  const offsetY = c === 0 ? 0 : CHANNEL_OFFSET_Y * ySize
  const sigma = Math.max(2, Math.min(xSize, ySize) * 0.1)
  let intensity = 0
  for (const [fx, fy] of BLOB_FRACTIONS) {
    const cx = fx * xSize + offsetX + driftX
    const cy = fy * ySize + offsetY + driftY
    const dx = (x - cx) / sigma
    const dy = (y - cy) / sigma
    intensity += Math.exp(-0.5 * (dx * dx + dy * dy))
  }
  return intensity
}

function toUint16(value: number): number {
  return Math.max(0, Math.min(65535, Math.round(value)))
}

function sizeOf(labels: readonly AxisName[], shape: readonly number[], axis: AxisName): number {
  const index = labels.indexOf(axis)
  const size = index < 0 ? 1 : shape[index]
  if (size === undefined) throw new Error(`missing ${axis} size`)
  return size
}
