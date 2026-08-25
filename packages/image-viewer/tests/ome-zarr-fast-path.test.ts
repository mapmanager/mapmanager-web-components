import { describe, expect, it } from 'vitest'

import { smallOmeZarrPlane } from '../src/engine/ome-zarr-fast-path'
import type { InnerPixelSource } from '../src/engine/oriented-pixel-source'

function loader(shape: number[], dtype = 'Uint16'): InnerPixelSource {
  const length = (shape.at(-2) ?? 0) * (shape.at(-1) ?? 0)
  return {
    shape,
    labels: shape.length === 2 ? ['y', 'x'] : ['c', 'y', 'x'],
    dtype,
    tileSize: 16,
    getTile: async () => ({ data: new Uint16Array(), width: 0, height: 0 }),
    getRaster: async ({ signal } = {}) => {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError')
      return { data: new Uint16Array(length), width: shape.at(-1) ?? 0, height: shape.at(-2) ?? 0 }
    },
  }
}

describe('small OME-Zarr fast path', () => {
  it('materializes narrow 30000-pixel kymographs', async () => {
    const plane = await smallOmeZarrPlane('kymo', [loader([30000, 18])])
    expect(plane).toMatchObject({
      kind: 'plane',
      id: 'kymo',
      dtype: 'uint16',
      shape: [30000, 18],
      labels: ['y', 'x'],
    })
    expect(plane?.data.length).toBe(540_000)
  })

  it('leaves pyramids, large planes, and multidimensional images with Viv', async () => {
    expect(await smallOmeZarrPlane('pyramid', [loader([512, 512]), loader([256, 256])])).toBeNull()
    expect(await smallOmeZarrPlane('large', [loader([2000, 1000])])).toBeNull()
    expect(await smallOmeZarrPlane('channels', [loader([2, 30000, 18])])).toBeNull()
  })

  it('leaves unsupported data types with Viv', async () => {
    expect(await smallOmeZarrPlane('int32', [loader([30000, 18], 'Int32')])).toBeNull()
  })

  it('passes cancellation to the full-plane read', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      smallOmeZarrPlane('cancelled', [loader([30000, 18])], controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
