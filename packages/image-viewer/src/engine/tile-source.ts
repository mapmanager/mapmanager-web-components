import { extractYxPlane } from './plane'
import type { PlaneSource } from './types'
import { planeSelectionFrom } from './viv-selection'

export const TILE_SIZE = 1024

export type VivDtype = 'Uint8' | 'Uint16' | 'Float32'

export interface RasterTile {
  data: Uint8Array | Uint16Array | Float32Array
  width: number
  height: number
}

interface TileRequest {
  x: number
  y: number
  selection?: Record<string, number>
  signal?: AbortSignal
}

interface RasterRequest {
  selection?: Record<string, number>
  signal?: AbortSignal
}

/** Full-volume Viv PixelSource: tiles a YX/CYX/ZCYX array without a single-texture upload. */
export class TiledPlanePixelSource {
  readonly shape: number[]
  readonly labels: string[]
  readonly dtype: VivDtype
  readonly tileSize = TILE_SIZE
  readonly #source: PlaneSource
  readonly #planes = new Map<string, RasterTile>()

  constructor(source: PlaneSource) {
    this.#source = source
    this.shape = [...source.shape]
    this.labels = [...source.labels]
    this.dtype = vivDtype(source.dtype)
  }

  async getRaster(request: RasterRequest = {}): Promise<RasterTile> {
    throwIfAborted(request.signal)
    return this.#plane(request.selection)
  }

  async getTile(request: TileRequest): Promise<RasterTile> {
    throwIfAborted(request.signal)
    const plane = this.#plane(request.selection)
    const x0 = request.x * TILE_SIZE
    const y0 = request.y * TILE_SIZE
    if (x0 >= plane.width || y0 >= plane.height) {
      throw new Error(`tile ${request.x},${request.y} is outside the plane`)
    }
    const width = Math.min(TILE_SIZE, plane.width - x0)
    const height = Math.min(TILE_SIZE, plane.height - y0)
    const tile = allocate(this.dtype, width * height)
    for (let row = 0; row < height; row += 1) {
      const src = (y0 + row) * plane.width + x0
      tile.set(plane.data.subarray(src, src + width), row * width)
    }
    return { data: tile, width, height }
  }

  onTileError(error: Error): void {
    console.error(error)
  }

  #plane(selection: Record<string, number> | undefined): RasterTile {
    const chosen = planeSelectionFrom(selection)
    const key = `${chosen.t}:${chosen.c}:${chosen.z}`
    const cached = this.#planes.get(key)
    if (cached) return cached
    const extracted = extractYxPlane(this.#source, chosen)
    this.#planes.set(key, extracted)
    return extracted
  }
}

export function tileCount(size: number, tileSize = TILE_SIZE): number {
  return Math.ceil(size / tileSize)
}

function vivDtype(dtype: PlaneSource['dtype']): VivDtype {
  if (dtype === 'uint8') return 'Uint8'
  if (dtype === 'uint16') return 'Uint16'
  return 'Float32'
}

function allocate(dtype: VivDtype, length: number): Uint8Array | Uint16Array | Float32Array {
  if (dtype === 'Uint8') return new Uint8Array(length)
  if (dtype === 'Uint16') return new Uint16Array(length)
  return new Float32Array(length)
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError')
  }
}
