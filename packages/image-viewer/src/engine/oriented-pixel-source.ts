import { transposePlane } from './orientation'

export interface PixelTile {
  data: ArrayLike<number>
  width: number
  height: number
}

export interface TileQuery {
  x: number
  y: number
  selection?: Record<string, number>
  signal?: AbortSignal
}

export interface RasterQuery {
  selection?: Record<string, number>
  signal?: AbortSignal
}

export interface InnerPixelSource {
  shape: number[]
  labels: string[]
  dtype: string
  tileSize: number
  getTile: (request: TileQuery) => Promise<PixelTile>
  getRaster?: (request?: RasterQuery) => Promise<PixelTile>
  onTileError?: (error: Error) => void
}

/**
 * Viv PixelSource adapter: report display YX and transpose tiles after fetch.
 *
 * Viv keeps requesting tiles in its own grid. This wrapper swaps the last two
 * shape axes and transposes each returned tile so deck.gl sees display pixels.
 */
export class OrientedPixelSource {
  readonly shape: number[]
  readonly labels: string[]
  readonly dtype: string
  readonly tileSize: number
  readonly #inner: InnerPixelSource

  constructor(inner: InnerPixelSource) {
    this.#inner = inner
    this.shape = swapLastTwo(inner.shape)
    this.labels = [...inner.labels]
    this.dtype = inner.dtype
    this.tileSize = inner.tileSize
  }

  async getRaster(request: RasterQuery = {}): Promise<PixelTile> {
    if (typeof this.#inner.getRaster !== 'function') {
      throw new Error('pixel source cannot provide a full plane')
    }
    return orientTile(await this.#inner.getRaster(request))
  }

  async getTile(request: TileQuery): Promise<PixelTile> {
    return orientTile(await this.#inner.getTile({ ...request, x: request.y, y: request.x }))
  }

  onTileError(error: Error): void {
    this.#inner.onTileError?.(error)
  }
}

function orientTile(tile: PixelTile): PixelTile {
  return {
    data: transposePlane(tile.data, tile.height, tile.width),
    width: tile.height,
    height: tile.width,
  }
}

function swapLastTwo(shape: readonly number[]): number[] {
  if (shape.length < 2) throw new Error('image must include y and x')
  const next = [...shape]
  const yIndex = next.length - 2
  const xIndex = next.length - 1
  const height = next[yIndex]
  const width = next[xIndex]
  if (height === undefined || width === undefined) throw new Error('missing y or x size')
  next[yIndex] = width
  next[xIndex] = height
  return next
}
