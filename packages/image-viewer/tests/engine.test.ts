import { describe, expect, it } from 'vitest'

import { collectionChildUrl } from '../sample-paths'
import { parseOmeScale } from '../src/engine/ome-metadata'
import { AXIS_LOCK_PIXELS, dragZoomMode, guideRect, selectionRect } from '../src/engine/drag-zoom'
import {
  displayToSource,
  sourceToDisplay,
  transposePlane,
  transposedAxes,
  transposedShape,
} from '../src/engine/orientation'
import { OrientedPixelSource } from '../src/engine/oriented-pixel-source'
import { extractYxPlane } from '../src/engine/plane'
import { autoRange, histogramBarFraction } from '../src/engine/contrast-range'
import {
  niceStep,
  niceTickValues,
  physicalToPlotX,
  physicalToPlotY,
  flipYPlotEdges,
  visibleImageAxis,
} from '../src/engine/axis-ticks'
import { SYNTHETIC_SHAPE, syntheticPlaneSource } from '../src/engine/synthetic'
import { TILE_SIZE, TiledPlanePixelSource, tileCount } from '../src/engine/tile-source'
import { homeZoom, visibleDisplayRect, defaultRectDisplay, defaultLineDisplay } from '../src/engine/view-fit'
import { ImageViewerEngine } from '../src/engine/viewer-engine'
import { defaultChannelColor, LUT_ORDER, lutNameFromRgb, vivColormapForPane } from '../src/engine/channel-luts'
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

describe('in-memory tiled planes', () => {
  it('uses one exact-resolution loader even when a plane edge exceeds TILE_SIZE', async () => {
    const engine = new ImageViewerEngine()
    await engine.setSource(syntheticPlaneSource('CYX', [1, 48, 2048]))
    expect(engine.loaded?.loaders).toHaveLength(1)
    expect(engine.loaded?.inMemoryTiles).toBe(true)
    await engine.setSource(syntheticPlaneSource('YX', [16, 24]))
    expect(engine.loaded?.loaders).toHaveLength(1)
    expect(engine.loaded?.inMemoryTiles).toBe(true)
  })

  it('ends a 30000×18 kymograph exactly at both display boundaries', async () => {
    const source = syntheticPlaneSource('YX', [30000, 18])
    const oriented = new OrientedPixelSource(new TiledPlanePixelSource(source))
    expect(oriented.shape).toEqual([18, 30000])

    const last = await oriented.getTile({ x: tileCount(30000) - 1, y: 0 })
    expect((tileCount(30000) - 1) * TILE_SIZE + last.width).toBe(30000)
    expect(last.height).toBe(18)
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
  it('lists LUTs red/green/blue then the rest; defaults stay green then magenta', () => {
    expect(defaultChannelColor(0)).toEqual([0, 220, 80])
    expect(defaultChannelColor(1)).toEqual([255, 0, 220])
    expect(LUT_ORDER).toEqual([
      'red',
      'green',
      'blue',
      'cyan',
      'magenta',
      'yellow',
      'gray',
      'fire',
      'viridis',
      'magma',
    ])
    expect(lutNameFromRgb([255, 0, 220])).toBe('magenta')
    expect(vivColormapForPane('gray', 1)).toBe('greys')
    expect(vivColormapForPane('fire', 1)).toBe('hot')
    expect(vivColormapForPane('viridis', 1)).toBe('viridis')
    expect(vivColormapForPane('magma', 1)).toBe('magma')
    expect(vivColormapForPane('gray', 2)).toBeNull()
    expect(vivColormapForPane('green', 1)).toBeNull()
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

describe('display axes and contrast auto', () => {
  it('swaps source x/y calibration onto display axes after transpose', () => {
    const display = transposedAxes(
      { label: 'line', unit: 'µm', step: 0.2 },
      { label: 'time', unit: 's', step: 0.001 },
    )
    expect(display.x).toEqual({ label: 'time', unit: 's', step: 0.001 })
    expect(display.y).toEqual({ label: 'line', unit: 'µm', step: 0.2 })
  })

  it('places nice ticks in physical units, not pixel indexes', () => {
    expect(niceStep(0, 10, 5)).toBe(2)
    expect(niceTickValues(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10])
  })

  it('puts physical 0 at the plot bottom and follows a shifted Y window', () => {
    const plot = { top: 0, height: 100 }
    expect(physicalToPlotY(0, 0, 10, plot)).toBe(100)
    expect(physicalToPlotY(10, 0, 10, plot)).toBe(0)
    expect(physicalToPlotY(5, 5, 15, plot)).toBe(100)
    expect(physicalToPlotY(15, 5, 15, plot)).toBe(0)
    expect(physicalToPlotX(0, 0, 10, { left: 0, width: 100 })).toBe(0)
    expect(physicalToPlotX(10, 0, 10, { left: 0, width: 100 })).toBe(100)
  })

  it('reflects Y edges so pan-up moves ticks up and home keeps 0 at the bottom', () => {
    const plot = { top: 0, height: 100 }
    const home = flipYPlotEdges(0, 10, 10)
    expect(home).toEqual({ yBottom: 0, yTop: 10 })
    expect(physicalToPlotY(0, home.yBottom, home.yTop, plot)).toBe(100)
    const panned = flipYPlotEdges(1, 11, 10)
    expect(panned).toEqual({ yBottom: -1, yTop: 9 })
    expect(physicalToPlotY(5, panned.yBottom, panned.yTop, plot)).toBe(40)
  })

  it('hugs the visible image inside the Deck stage when zoomed out', () => {
    const plot = { left: 64, top: 10, width: 200, height: 200 }
    const axis = visibleImageAxis({
      plot,
      view: { x0: -50, y0: -50, x1: 150, y1: 150 },
      imageWidth: 100,
      imageHeight: 100,
      xStep: 1,
      yStep: 1,
    })
    expect(axis).not.toBeNull()
    expect(axis?.plot).toEqual({ left: 114, top: 60, width: 100, height: 100 })
    expect(axis?.xLeft).toBe(0)
    expect(axis?.xRight).toBe(99)
    expect(axis?.yBottom).toBe(0)
    expect(axis?.yTop).toBe(99)
    const ticks = niceTickValues(axis!.xLeft, axis!.xRight)
    expect(ticks.every((value) => value >= 0 && value <= 99)).toBe(true)
  })

  it('keeps the axis box on the stage when the image fills the view', () => {
    const plot = { left: 64, top: 10, width: 200, height: 200 }
    const axis = visibleImageAxis({
      plot,
      view: { x0: 10, y0: 20, x1: 50, y1: 80 },
      imageWidth: 100,
      imageHeight: 100,
      xStep: 0.5,
      yStep: 2,
    })
    expect(axis).not.toBeNull()
    expect(axis?.plot).toEqual(plot)
    expect(axis?.xLeft).toBe(5)
    expect(axis?.xRight).toBe(25)
    expect(axis?.yBottom).toBe(40)
    expect(axis?.yTop).toBe(160)
  })

  it('drops negative and past-image ticks when the camera overshoots the plane', () => {
    const plot = { left: 0, top: 0, width: 100, height: 100 }
    const axis = visibleImageAxis({
      plot,
      view: { x0: -20, y0: 1, x1: 80, y1: 11 },
      imageWidth: 10,
      imageHeight: 10,
      xStep: 1,
      yStep: 1,
    })
    expect(axis).not.toBeNull()
    expect(axis!.xLeft).toBe(0)
    expect(axis!.xRight).toBe(9)
    expect(axis!.yBottom).toBe(0)
    expect(axis!.yTop).toBe(9)
    expect(axis!.plot.left).toBeGreaterThan(plot.left)
    expect(axis!.plot.left + axis!.plot.width).toBeLessThan(plot.width)
    expect(niceTickValues(axis!.xLeft, axis!.xRight).every((value) => value >= 0 && value <= 9)).toBe(
      true,
    )
    expect(niceTickValues(axis!.yBottom, axis!.yTop).every((value) => value >= 0 && value <= 9)).toBe(
      true,
    )
  })

  it('hides axes when the image is fully panned off the plot', () => {
    const plot = { left: 0, top: 0, width: 200, height: 200 }
    expect(
      visibleImageAxis({
        plot,
        view: { x0: 200, y0: 200, x1: 400, y1: 400 },
        imageWidth: 100,
        imageHeight: 100,
        xStep: 1,
        yStep: 1,
      }),
    ).toBeNull()
  })

  it('maps a constant-source-X scan path to a horizontal display line', () => {
    expect(sourceToDisplay(12, 0)).toEqual({ x: 0, y: 12 })
    expect(sourceToDisplay(12, 40)).toEqual({ x: 40, y: 12 })
  })

  it('autoscales contrast from plane samples and keeps caller axis labels', async () => {
    const source = syntheticPlaneSource('YX', [16, 24])
    source.xAxis = { label: 'line', unit: 'µm', step: 0.5 }
    source.yAxis = { label: 'time', unit: 'ms', step: 2 }
    const engine = new ImageViewerEngine()
    await engine.setSource(source)
    expect(engine.loaded?.xLabel).toBe('time')
    expect(engine.loaded?.xUnit).toBe('ms')
    expect(engine.loaded?.xStep).toBe(2)
    expect(engine.loaded?.yLabel).toBe('line')
    expect(engine.loaded?.yStep).toBe(0.5)
    engine.setSourceAxes(
      { label: 'col', unit: 'px', step: 1 },
      { label: 'row', unit: 'px', step: 1 },
    )
    expect(engine.loaded?.xLabel).toBe('row')
    expect(engine.loaded?.yLabel).toBe('col')
    const auto = await engine.autoChannelContrast(0)
    expect(auto[1]).toBeGreaterThan(auto[0])
    expect(engine.channelContrast[0]).toEqual(auto)
    expect(autoRange([0, 1, 2, 3, 4, 100])).toHaveLength(2)
    expect(histogramBarFraction(0, 10, false)).toBe(0)
    expect(histogramBarFraction(9, 10, true)).toBeGreaterThan(0)
  })
})
