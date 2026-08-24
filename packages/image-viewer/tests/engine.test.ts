import { describe, expect, it } from 'vitest'

import { collectionChildUrl } from '../sample-paths'
import { parseOmeScale } from '../src/engine/ome-metadata'
import { planeFitsInMemory, zarrJsonUrl } from '../src/engine/ome-zarr-loader'
import {
  displayToSource,
  sourceToDisplay,
  transposePlane,
  transposedShape,
} from '../src/engine/orientation'
import { OrientedPixelSource } from '../src/engine/oriented-pixel-source'
import { extractYxPlane } from '../src/engine/plane'
import { SYNTHETIC_SHAPE, syntheticPlaneSource } from '../src/engine/synthetic'
import { TILE_SIZE, TiledPlanePixelSource, tileCount } from '../src/engine/tile-source'
import { homeZoom } from '../src/engine/view-fit'
import { ImageViewerEngine } from '../src/engine/viewer-engine'

describe('synthetic layouts', () => {
  it('builds YX, CYX, and ZCYX with y,x last', () => {
    expect(SYNTHETIC_SHAPE.YX).toEqual([384, 512])
    expect(SYNTHETIC_SHAPE.CYX).toEqual([2, 30000, 1024])
    expect(SYNTHETIC_SHAPE.ZCYX).toEqual([6, 2, 256, 320])
    const yx = syntheticPlaneSource('YX')
    const cyx = syntheticPlaneSource('CYX', [2, 16, 24])
    const zcyx = syntheticPlaneSource('ZCYX')
    expect(yx.labels).toEqual(['y', 'x'])
    expect(cyx.labels).toEqual(['c', 'y', 'x'])
    expect(zcyx.labels).toEqual(['z', 'c', 'y', 'x'])
    expect(cyx.shape).toEqual([2, 16, 24])
    expect(zcyx.shape[0]).toBe(6)
    expect(zcyx.shape[1]).toBe(2)
  })
})

describe('extractYxPlane', () => {
  it('returns the YX size of a ZCYX volume', () => {
    const source = syntheticPlaneSource('ZCYX')
    const plane = extractYxPlane(source, { t: 0, c: 1, z: 2 })
    expect(plane.width).toBe(source.shape[3])
    expect(plane.height).toBe(source.shape[2])
    expect(plane.data.length).toBe(plane.width * plane.height)
  })

  it('returns different pixels for different CYX channels', () => {
    const source = syntheticPlaneSource('CYX', [2, 16, 24])
    const c0 = extractYxPlane(source, { t: 0, c: 0, z: 0 })
    const c1 = extractYxPlane(source, { t: 0, c: 1, z: 0 })
    expect([...c0.data]).not.toEqual([...c1.data])
    expect(c0.data[1]).not.toBe(c0.data[0])
    expect(c1.data[24]).not.toBe(c1.data[0])
  })

  it('returns different ZCYX planes for different z', () => {
    const source = syntheticPlaneSource('ZCYX')
    const z0 = extractYxPlane(source, { t: 0, c: 0, z: 0 })
    const z1 = extractYxPlane(source, { t: 0, c: 0, z: 1 })
    expect([...z0.data]).not.toEqual([...z1.data])
  })
})

describe('TiledPlanePixelSource', () => {
  it('keeps full-volume labels so Viv can pass c/z selections', () => {
    const source = syntheticPlaneSource('CYX', [2, 16, 24])
    const tiles = new TiledPlanePixelSource(source)
    expect(tiles.labels).toEqual(['c', 'y', 'x'])
    expect(tiles.shape).toEqual(source.shape)
  })

  it('tiles a plane without dropping edge pixels', async () => {
    const source = syntheticPlaneSource('YX')
    const tiles = new TiledPlanePixelSource(source)
    const raster = await tiles.getRaster()
    const lastX = tileCount(raster.width) - 1
    const lastY = tileCount(raster.height) - 1
    const tile = await tiles.getTile({ x: lastX, y: lastY })
    expect(tile.width).toBe(raster.width - lastX * TILE_SIZE)
    expect(tile.height).toBe(raster.height - lastY * TILE_SIZE)
    expect(tile.data.length).toBe(tile.width * tile.height)
  })
})

describe('planeFitsInMemory', () => {
  it('accepts a kymo-scale plane and rejects a large mosaic', () => {
    expect(planeFitsInMemory(30000, 14)).toBe(true)
    expect(planeFitsInMemory(512, 512)).toBe(true)
    expect(planeFitsInMemory(1501, 1000)).toBe(false)
  })
})

describe('orientation', () => {
  it('swaps source YX into display width × height', () => {
    expect(transposedShape(30000, 14)).toEqual({ width: 30000, height: 14 })
    expect(transposedShape(384, 512)).toEqual({ width: 384, height: 512 })
  })

  it('maps source column/row to display and back', () => {
    expect(sourceToDisplay(3, 10)).toEqual({ x: 10, y: 3 })
    expect(displayToSource(10, 3)).toEqual({ x: 3, y: 10 })
  })

  it('transposes a YX plane so display[x,y] is source[y,x]', () => {
    const source = new Uint16Array([1, 2, 3, 4, 5, 6])
    const display = transposePlane(source, 2, 3)
    expect([...display]).toEqual([1, 4, 2, 5, 3, 6])
  })
})

describe('OrientedPixelSource', () => {
  it('reports display shape and transposes tiles for Viv', async () => {
    const source = syntheticPlaneSource('YX')
    const inner = new TiledPlanePixelSource(source)
    const oriented = new OrientedPixelSource(inner)
    expect(oriented.shape).toEqual([512, 384])
    const raster = await oriented.getRaster()
    expect(raster.width).toBe(384)
    expect(raster.height).toBe(512)
    const extracted = extractYxPlane(source, { t: 0, c: 0, z: 0 })
    expect(raster.data[0]).toBe(extracted.data[0])
    expect(raster.data[1]).toBe(extracted.data[extracted.width])
  })
})

describe('ImageViewerEngine', () => {
  it('reports display size after transpose, keeping source size', async () => {
    const engine = new ImageViewerEngine()
    const loaded = await engine.setSource(syntheticPlaneSource('YX'))
    expect(loaded.sourceWidth).toBe(512)
    expect(loaded.sourceHeight).toBe(384)
    expect(loaded.width).toBe(384)
    expect(loaded.height).toBe(512)
    const window = engine.viewWindow()
    expect(window?.xMax).toBe(383)
    expect(window?.yMax).toBe(511)
    expect(window?.xLabel).toBe('y')
    expect(window?.yLabel).toBe('x')
  })

  it('clears overlays when the source is replaced', async () => {
    const engine = new ImageViewerEngine()
    await engine.setSource(syntheticPlaneSource('YX'))
    engine.setRois([{ id: 'a', kind: 'rect', x0: 1, y0: 1, x1: 4, y1: 4 }])
    engine.setXyOverlays([{ id: 'p', x: [0, 1], y: [0, 1] }])
    await engine.setSource(syntheticPlaneSource('CYX', [2, 16, 24]))
    expect(engine.rois).toEqual([])
    expect(engine.xyOverlays).toEqual([])
    expect(engine.loaded?.channelCount).toBe(2)
  })

  it('aborts the previous in-flight load', async () => {
    const engine = new ImageViewerEngine()
    const first = engine.setSource(syntheticPlaneSource('YX'))
    const second = engine.setSource(syntheticPlaneSource('CYX', [2, 16, 24]))
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await second
    expect(engine.loaded?.channelCount).toBe(2)
    expect(engine.loaded?.sourceId).toBe('synthetic-cyx')
  })
})

describe('parseOmeScale', () => {
  it('reads NGFF 0.5 axes and dataset scale', () => {
    const scale = parseOmeScale({
      ome: {
        version: '0.5',
        multiscales: [
          {
            axes: [
              { name: 'y', type: 'space', unit: 'seconds' },
              { name: 'x', type: 'space', unit: 'um' },
            ],
            datasets: [
              {
                path: '0',
                coordinateTransformations: [{ type: 'scale', scale: [0.001, 0.26] }],
              },
            ],
          },
        ],
      },
    })
    expect(scale.x).toBe(0.26)
    expect(scale.y).toBe(0.001)
    expect(scale.xUnit).toBe('um')
    expect(scale.yUnit).toBe('seconds')
  })
})

describe('zarrJsonUrl', () => {
  it('appends zarr.json and never returns the directory URL', () => {
    expect(zarrJsonUrl(new URL('http://example.test/image/')).href).toBe(
      'http://example.test/image/zarr.json',
    )
    expect(zarrJsonUrl(new URL('http://example.test/image')).href).toBe(
      'http://example.test/image/zarr.json',
    )
  })
})

describe('homeZoom', () => {
  it('square display: one contain zoom with 0.98 inset', () => {
    const scale = Math.min(1000 / 512, 800 / 512) * 0.98
    expect(homeZoom(1000, 800, 512, 512)).toBeCloseTo(Math.log2(scale))
  })

  it('non-square display: independent X and Y zooms that fill the view', () => {
    const zoom = homeZoom(1200, 700, 30000, 14)
    expect(Array.isArray(zoom)).toBe(true)
    if (!Array.isArray(zoom)) return
    expect(zoom[0]).toBeCloseTo(Math.log2(1200 / 30000))
    expect(zoom[1]).toBeCloseTo(Math.log2(700 / 14))
  })
})

describe('collectionChildUrl', () => {
  it('joins a nested image group, not the collection root', () => {
    expect(collectionChildUrl('/__dev_collection__/', 'acq_images/acq_image_340')).toBe(
      '/__dev_collection__/acq_images/acq_image_340/',
    )
    expect(collectionChildUrl('/__dev_collection__/', 'acq_images/acq_image_340/reference')).toBe(
      '/__dev_collection__/acq_images/acq_image_340/reference/',
    )
  })
})
