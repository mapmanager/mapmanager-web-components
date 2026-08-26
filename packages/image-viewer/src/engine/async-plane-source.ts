import type { InnerPixelSource, PixelTile, RasterQuery, TileQuery } from './oriented-pixel-source'
import { TILE_SIZE, type VivDtype } from './tile-source'
import type { AsyncPlane, AsyncPlaneSource, PlaneSelection } from './types'
import { planeSelectionFrom } from './viv-selection'

const DEFAULT_MAX_CACHED_PLANES = 4

/** Adapt a public async-plane source to the pixel-source contract consumed by Viv. */
export class AsyncPlanePixelSource implements InnerPixelSource {
  readonly shape: number[]
  readonly labels: string[]
  readonly dtype: VivDtype
  readonly tileSize = TILE_SIZE
  readonly #source: AsyncPlaneSource
  readonly #maxCachedPlanes: number
  readonly #planes = new Map<string, Promise<AsyncPlane>>()

  constructor(source: AsyncPlaneSource, maxCachedPlanes = DEFAULT_MAX_CACHED_PLANES) {
    if (!Number.isInteger(maxCachedPlanes) || maxCachedPlanes < 1) {
      throw new Error('maxCachedPlanes must be a positive integer')
    }
    this.#source = source
    this.#maxCachedPlanes = maxCachedPlanes
    this.shape = [...source.shape]
    this.labels = [...source.labels]
    this.dtype = vivDtype(source.dtype)
  }

  async getRaster(request: RasterQuery = {}): Promise<PixelTile> {
    throwIfAborted(request.signal)
    return this.#plane(planeSelectionFrom(request.selection), request.signal)
  }

  async getTile(request: TileQuery): Promise<PixelTile> {
    throwIfAborted(request.signal)
    const plane = await this.#plane(planeSelectionFrom(request.selection), request.signal)
    const x0 = request.x * this.tileSize
    const y0 = request.y * this.tileSize
    if (x0 >= plane.width || y0 >= plane.height) {
      throw new Error(`tile ${request.x},${request.y} is outside the plane`)
    }
    const width = Math.min(this.tileSize, plane.width - x0)
    const height = Math.min(this.tileSize, plane.height - y0)
    const data = allocate(this.dtype, width * height)
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = (y0 + row) * plane.width + x0
      data.set(plane.data.subarray(sourceOffset, sourceOffset + width), row * width)
    }
    return { data, width, height }
  }

  onTileError(error: Error): void {
    console.error(error)
  }

  async #plane(selection: PlaneSelection, signal?: AbortSignal): Promise<AsyncPlane> {
    const key = `${selection.t}:${selection.c}:${selection.z}`
    let pending = this.#planes.get(key)
    if (!pending) {
      pending = this.#source.getPlane({ selection, ...(signal ? { signal } : {}) })
      this.#planes.set(key, pending)
      this.#evictOldest()
      void pending.catch(() => this.#planes.delete(key))
    } else {
      this.#planes.delete(key)
      this.#planes.set(key, pending)
    }
    const plane = await pending
    throwIfAborted(signal)
    assertPlane(plane, this.shape, this.labels)
    return plane
  }

  #evictOldest(): void {
    while (this.#planes.size > this.#maxCachedPlanes) {
      const oldest = this.#planes.keys().next().value
      if (oldest === undefined) return
      this.#planes.delete(oldest)
    }
  }
}

function assertPlane(plane: AsyncPlane, shape: readonly number[], labels: readonly string[]): void {
  const xIndex = labels.indexOf('x')
  const yIndex = labels.indexOf('y')
  const expectedWidth = shape[xIndex]
  const expectedHeight = shape[yIndex]
  if (plane.width !== expectedWidth || plane.height !== expectedHeight) {
    throw new Error(
      `async plane is ${plane.width}×${plane.height}; expected ${expectedWidth}×${expectedHeight}`,
    )
  }
  if (plane.data.length !== plane.width * plane.height) {
    throw new Error('async plane data length does not match width × height')
  }
}

function vivDtype(dtype: AsyncPlaneSource['dtype']): VivDtype {
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
  if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
}
