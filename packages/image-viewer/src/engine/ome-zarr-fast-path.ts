import type { InnerPixelSource } from './oriented-pixel-source'
import type { AxisName, DtypeName, PlaneSource } from './types'
import { vivSelection } from './viv-selection'

const MAX_IN_MEMORY_PIXELS = 1_500_000

/** Materialize a small, single-resolution 2D OME-Zarr for the in-memory pyramid. */
export async function smallOmeZarrPlane(
  id: string,
  loaders: readonly InnerPixelSource[],
  signal?: AbortSignal,
): Promise<PlaneSource | null> {
  if (loaders.length !== 1) return null
  const loader = loaders[0]
  if (!loader || typeof loader.getRaster !== 'function') return null

  const labels = loader.labels
  const shape = loader.shape
  if (labels.length !== shape.length || labels.at(-2) !== 'y' || labels.at(-1) !== 'x') {
    return null
  }
  if (!labels.every(isAxisName)) return null
  if (labels.some((label, index) => label !== 'y' && label !== 'x' && shape[index] !== 1)) {
    return null
  }

  const width = shape.at(-1)
  const height = shape.at(-2)
  const dtype = planeDtype(loader.dtype)
  if (!width || !height || width * height > MAX_IN_MEMORY_PIXELS || !dtype) return null

  const raster = await loader.getRaster({
    selection: vivSelection(labels, { t: 0, c: 0, z: 0 }),
    ...(signal ? { signal } : {}),
  })
  if (raster.data.length !== width * height) {
    throw new Error('OME-Zarr raster size does not match its YX shape')
  }
  return { kind: 'plane', id, data: raster.data, dtype, shape: [...shape], labels: [...labels] }
}

function isAxisName(label: string): label is AxisName {
  return label === 't' || label === 'c' || label === 'z' || label === 'y' || label === 'x'
}

function planeDtype(dtype: string): DtypeName | null {
  if (dtype === 'Uint8') return 'uint8'
  if (dtype === 'Uint16') return 'uint16'
  if (dtype === 'Float32') return 'float32'
  return null
}
