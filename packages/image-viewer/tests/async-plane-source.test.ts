import { describe, expect, it, vi } from 'vitest'

import { AsyncPlanePixelSource } from '../src/engine/async-plane-source'
import type { AsyncPlaneSource } from '../src/engine/types'
import { ImageViewerEngine } from '../src/engine/viewer-engine'

function asyncSource(): AsyncPlaneSource {
  return {
    kind: 'async-plane',
    id: 'async-cyx',
    dtype: 'uint16',
    shape: [2, 3, 5],
    labels: ['c', 'y', 'x'],
    xAxis: { label: 'distance', unit: 'µm', step: 0.25 },
    yAxis: { label: 'time', unit: 's', step: 0.002 },
    getPlane: vi.fn(async ({ selection }) => ({
      width: 5,
      height: 3,
      data: new Uint16Array(15).fill(selection.c + 1),
    })),
  }
}

describe('AsyncPlanePixelSource', () => {
  it('does not request pixels during construction', () => {
    const source = asyncSource()
    new AsyncPlanePixelSource(source)
    expect(source.getPlane).not.toHaveBeenCalled()
  })

  it('requests and reuses a selected plane', async () => {
    const source = asyncSource()
    const pixels = new AsyncPlanePixelSource(source)
    const first = await pixels.getRaster({ selection: { c: 1 } })
    const second = await pixels.getRaster({ selection: { c: 1 } })
    expect(source.getPlane).toHaveBeenCalledTimes(1)
    expect(first).toBe(second)
    expect(first.data[0]).toBe(2)
  })

  it('cuts an exact edge tile from the fetched plane', async () => {
    const source = asyncSource()
    const pixels = new AsyncPlanePixelSource(source)
    const tile = await pixels.getTile({ x: 0, y: 0, selection: { c: 0 } })
    expect(tile).toMatchObject({ width: 5, height: 3 })
    expect(tile.data).toHaveLength(15)
  })

  it('rejects a plane whose dimensions disagree with its descriptor', async () => {
    const source = asyncSource()
    source.getPlane = async () => ({ width: 4, height: 3, data: new Uint16Array(12) })
    await expect(new AsyncPlanePixelSource(source).getRaster()).rejects.toThrow(
      'async plane is 4×3; expected 5×3',
    )
  })
})

describe('ImageViewerEngine async planes', () => {
  it('loads and prepares channel selections through the established engine path', async () => {
    const source = asyncSource()
    const engine = new ImageViewerEngine()
    const loaded = await engine.setSource(source)
    expect(loaded.channelCount).toBe(2)
    expect(loaded.sourceWidth).toBe(5)
    expect(loaded.sourceHeight).toBe(3)
    expect(source.getPlane).toHaveBeenCalledTimes(1)

    const prepared = await engine.prepareSelection({ c: 1 })
    expect(prepared.selection.c).toBe(1)
    expect(source.getPlane).toHaveBeenCalledTimes(2)
    engine.commitSelection(prepared)
    expect(engine.loaded?.selection.c).toBe(1)
  })

  it('fetches a large initial plane instead of using a generic dtype range', async () => {
    const source = asyncSource()
    source.shape = [1, 2_000_001]
    source.labels = ['y', 'x']
    source.getPlane = vi.fn(async () => {
      const data = new Uint16Array(2_000_001)
      data[0] = 100
      data[data.length - 1] = 4_000
      return { width: 2_000_001, height: 1, data }
    })
    const engine = new ImageViewerEngine()
    const loaded = await engine.setSource(source)
    expect(source.getPlane).toHaveBeenCalledTimes(1)
    expect(loaded.contrast[1]).toBeLessThanOrEqual(4_000)
  })
})
