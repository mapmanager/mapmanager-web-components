import type { AxisName, PlaneSource } from './types'
import { assertPlaneLayout } from './types'

export type LayoutName = 'YX' | 'CYX' | 'ZCYX'

const LAYOUTS: Record<LayoutName, AxisName[]> = {
  YX: ['y', 'x'],
  CYX: ['c', 'y', 'x'],
  ZCYX: ['z', 'c', 'y', 'x'],
}

/** Demo shapes. CYX is a 2-channel kymo-scale plane, not a 203-channel volume. */
export const SYNTHETIC_SHAPE: Record<LayoutName, readonly number[]> = {
  YX: [384, 512],
  CYX: [2, 30000, 1024],
  ZCYX: [6, 2, 256, 320],
}

/** Build a uint16 volume. Pass `shape` in tests to avoid the large CYX allocation. */
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
  let i = 0
  for (let z = 0; z < zSize; z += 1) {
    for (let c = 0; c < cSize; c += 1) {
      for (let y = 0; y < ySize; y += 1) {
        for (let x = 0; x < xSize; x += 1) {
          data[i] = sample(x, y, c, z, xSize, ySize)
          i += 1
        }
      }
    }
  }
}

/**
 * C0 = vertical bars, C1 = horizontal bars, Z shifts the bar phase.
 * Smoke-test C and Z by looking at bar direction and phase, not a global ramp.
 */
function sample(x: number, y: number, c: number, z: number, xSize: number, ySize: number): number {
  const zShift = z * 12
  if (c === 0) {
    const band = (x + zShift) % 64 < 32
    return (band ? 48000 : 6000) + Math.floor((x / Math.max(xSize, 1)) * 4000)
  }
  const band = (y + zShift) % 64 < 32
  return (band ? 48000 : 6000) + Math.floor((y / Math.max(ySize, 1)) * 4000)
}

function sizeOf(labels: readonly AxisName[], shape: readonly number[], axis: AxisName): number {
  const index = labels.indexOf(axis)
  const size = index < 0 ? 1 : shape[index]
  if (size === undefined) throw new Error(`missing ${axis} size`)
  return size
}
