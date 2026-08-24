import { describe, expect, it } from 'vitest'

import { collectionChildUrl } from '../sample-paths'
import { parseOmeScale } from '../src/engine/ome-metadata'
import { planeFitsInMemory, shouldLoadOmeZarrAsPlane, zarrJsonUrl } from '../src/engine/ome-zarr-loader'
import { AXIS_LOCK_PIXELS, dragZoomMode, guideRect, selectionRect } from '../src/engine/drag-zoom'
import {
  displayToSource,
  sourceToDisplay,
  transposePlane,
  transposedShape,
} from '../src/engine/orientation'
import { OrientedPixelSource } from '../src/engine/oriented-pixel-source'
import { extractYxPlane, downsamplePlaneHalf, planePyramidSources } from '../src/engine/plane'
import { SYNTHETIC_SHAPE, syntheticPlaneSource } from '../src/engine/synthetic'
import { TILE_SIZE, TiledPlanePixelSource, tileCount } from '../src/engine/tile-source'
import { homeZoom, visibleDisplayRect, defaultRectDisplay, defaultLineDisplay } from '../src/engine/view-fit'
import { ImageViewerEngine } from '../src/engine/viewer-engine'
import { defaultChannelColor, LUT_ORDER, lutNameFromRgb } from '../src/engine/channel-luts'
import { paneChannels, paneSlots } from '../src/engine/layout-panes'

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

describe('in-memory dyadic pyramid', () => {
  it('downsamples Y and X in C-order without mixing Z/C planes', () => {
    const data = new Uint16Array(2 * 2 * 4 * 6)
    for (let index = 0; index < data.length; index += 1) data[index] = index
    const source = {
      kind: 'plane' as const,
      id: 'index-zcyx',
      data,
      dtype: 'uint16' as const,
      shape: [2, 2, 4, 6],
      labels: ['z', 'c', 'y', 'x'] as ['z', 'c', 'y', 'x'],
    }
    const half = downsamplePlaneHalf({ ...source, labels: [...source.labels] })
    expect(half.shape).toEqual([2, 2, 2, 3])
    const dest = extractYxPlane(half, { t: 0, c: 1, z: 1 })
    const full = extractYxPlane({ ...source, labels: [...source.labels] }, { t: 0, c: 1, z: 1 })
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const sourceY = Math.min(3, Math.floor((y * 4) / 2))
        const sourceX = Math.min(5, Math.floor((x * 6) / 3))
        expect(dest.data[y * 3 + x]).toBe(full.data[sourceY * 6 + sourceX])
      }
    }
    expect([...extractYxPlane(half, { t: 0, c: 0, z: 0 }).data]).not.toEqual([...dest.data])
  })

  it('stops when both Y and X are <= maxEdge, finest-first', () => {
    const source = syntheticPlaneSource('CYX', [1, 40, 20])
    const levels = planePyramidSources(source, 8)
    expect(levels.map((level) => level.shape)).toEqual([
      [1, 40, 20],
      [1, 20, 10],
      [1, 10, 5],
      [1, 5, 2],
    ])
    expect(levels[0]).toBe(source)
  })

  it('gives Viv more than one loader when a plane edge exceeds TILE_SIZE', async () => {
    const engine = new ImageViewerEngine()
    await engine.setSource(syntheticPlaneSource('CYX', [1, 48, 2048]))
    expect(engine.loaded?.loaders).toHaveLength(2)
    await engine.setSource(syntheticPlaneSource('YX', [16, 24]))
    expect(engine.loaded?.loaders).toHaveLength(1)
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

describe('shouldLoadOmeZarrAsPlane', () => {
  it('decodes single-level small YX and leaves pyramids to Viv', () => {
    expect(shouldLoadOmeZarrAsPlane(1, 30000, 14)).toBe(true)
    expect(shouldLoadOmeZarrAsPlane(6, 512, 512)).toBe(false)
    expect(shouldLoadOmeZarrAsPlane(1, 1501, 1000)).toBe(false)
  })
})

describe('dragZoomMode', () => {
  it('uses region zoom for square images and axis lock otherwise', () => {
    expect(dragZoomMode(512, 512, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe('pending')
    expect(dragZoomMode(512, 512, { x: 0, y: 0 }, { x: AXIS_LOCK_PIXELS, y: 1 })).toBe('region')
    expect(dragZoomMode(30000, 14, { x: 0, y: 0 }, { x: 20, y: 2 })).toBe('x')
    expect(dragZoomMode(30000, 14, { x: 0, y: 0 }, { x: 2, y: 20 })).toBe('y')
  })

  it('forces a square rubber-band when display width equals height', () => {
    const box = selectionRect(512, 512, { width: 200, height: 200 }, { x: 10, y: 10 }, { x: 50, y: 20 })
    expect(box.width).toBe(box.height)
    expect(box.width).toBe(40)
    const xBand = guideRect('x', { left: 10, top: 20, width: 30, height: 5 }, { width: 200, height: 100 })
    expect(xBand).toEqual({ left: 10, top: 0, width: 30, height: 100 })
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

describe('channel LUTs', () => {
  it('defaults two channels to green then magenta, never gray', () => {
    expect(defaultChannelColor(0)).toEqual([0, 220, 80])
    expect(defaultChannelColor(1)).toEqual([255, 0, 220])
    expect(LUT_ORDER).not.toContain('gray')
    expect(lutNameFromRgb([255, 0, 220])).toBe('magenta')
  })
})

describe('layout panes', () => {
  it('gives one independent pane per channel for side and stack', () => {
    expect(paneSlots('single', 2, 1)).toEqual([{ id: 'pane-0', channels: [1] }])
    expect(paneSlots('composite', 2, 0)).toEqual([{ id: 'pane-0', channels: [0, 1] }])
    expect(paneSlots('side', 2, 0).map((pane) => pane.channels)).toEqual([[0], [1]])
    expect(paneSlots('stack', 2, 0)).toHaveLength(2)
    expect(paneChannels('single', 2, 1)).toEqual([1])
    expect(paneChannels('side', 2, 0)).toEqual([0, 1])
    expect(paneChannels('composite', 2, 0)).toEqual([0, 1])
  })
})

describe('visible window and default ROIs', () => {
  it('uses deck.gl orthographic scale 2**zoom and a 40% default rect', () => {
    const view = visibleDisplayRect(200, 100, [50, 40, 0], 0)
    expect(view.x0).toBe(50 - 100)
    expect(view.x1).toBe(50 + 100)
    expect(view.y0).toBe(40 - 50)
    expect(view.y1).toBe(40 + 50)
    const rect = defaultRectDisplay({ x0: 0, y0: 0, x1: 100, y1: 100 }, 100, 100)
    expect(rect.x1 - rect.x0).toBeCloseTo(40)
    expect(rect.y1 - rect.y0).toBeCloseTo(40)
    const line = defaultLineDisplay({ x0: 0, y0: 0, x1: 100, y1: 100 }, 100, 100)
    expect(line.x1 - line.x0).toBeCloseTo(60)
    expect(line.y0).toBe(line.y1)
  })
})

describe('ROI add/delete', () => {
  it('adds, selects, and deletes without edit handles', async () => {
    const engine = new ImageViewerEngine()
    await engine.setSource(syntheticPlaneSource('CYX', [2, 16, 24]))
    const rect = engine.addRoi({ id: engine.nextRoiId(), kind: 'rect', x0: 1, y0: 1, x1: 4, y1: 5 })
    expect(engine.selectedRoiId).toBe(rect.id)
    engine.addRoi({ id: engine.nextRoiId(), kind: 'line', x0: 0, y0: 0, x1: 3, y1: 3 })
    expect(engine.rois).toHaveLength(2)
    engine.selectRoi(rect.id)
    engine.removeRoi(rect.id)
    expect(engine.rois).toHaveLength(1)
    expect(engine.selectedRoiId).toBeNull()
  })
})
