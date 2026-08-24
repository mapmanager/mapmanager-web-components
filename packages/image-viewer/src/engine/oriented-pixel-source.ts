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
 * Methods are own-properties so Viv can extract `onTileError` / `getRaster`
 * (it does not always call them as methods on this instance).
 */
export class OrientedPixelSource {
  readonly shape: number[]
  readonly labels: string[]
  readonly dtype: string
  readonly tileSize: number
  readonly getTile: (request: TileQuery) => Promise<PixelTile>
  readonly getRaster: (request?: RasterQuery) => Promise<PixelTile>
  readonly onTileError: (error: Error) => void

  constructor(inner: InnerPixelSource) {
    this.shape = swapLastTwo(inner.shape)
    this.labels = [...inner.labels]
    this.dtype = inner.dtype
    this.tileSize = inner.tileSize
    this.getTile = async (request: TileQuery) =>
      orientTile(await inner.getTile({ ...request, x: request.y, y: request.x }))
    this.getRaster = async (request: RasterQuery = {}) => {
      if (typeof inner.getRaster !== 'function') {
        throw new Error('pixel source cannot provide a full plane')
      }
      return orientTile(await inner.getRaster(request))
    }
    this.onTileError = (error: Error) => {
      inner.onTileError?.(error)
    }
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
