<script setup lang="ts">
import { Deck, OrthographicView } from '@deck.gl/core'
import { PathLayer, PolygonLayer } from '@deck.gl/layers'
import { ColorPaletteExtension } from '@vivjs/extensions'
import { MultiscaleImageLayer } from '@vivjs/layers'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import type { LoadedImage } from '../engine/viewer-engine'
import { ImageViewerEngine } from '../engine/viewer-engine'
import {
  dragZoomMode,
  guideRect,
  MIN_REGION_PIXELS,
  selectionRect,
  type DragZoomMode,
  type PlotRect,
} from '../engine/drag-zoom'
import { CHANNEL_LUTS, LUT_ORDER, lutNameFromRgb, type LutName } from '../engine/channel-luts'
import { paneChannels, panePixelSize, paneViews, type ViewerLayout } from '../engine/layout-panes'
import { DISPLAY_ORIENTATION, displayToSource, sourceToDisplay } from '../engine/orientation'
import type { ImageSource, PlaneSelection, Roi, ViewWindow, XyOverlay } from '../engine/types'
import { homeZoom, type HomeZoom } from '../engine/view-fit'
import { vivSelection } from '../engine/viv-selection'
import './widget.css'

export type DoubleClickBehavior = 'home' | 'deck'

const props = withDefaults(
  defineProps<{
    doubleClickBehavior?: DoubleClickBehavior
  }>(),
  { doubleClickBehavior: 'home' },
)

const emit = defineEmits<{
  'view-change': [window: ViewWindow]
  'source-change': [id: string]
}>()

const host = ref<HTMLDivElement | null>(null)
const status = ref('No image')
const errorMessage = ref<string | null>(null)
const selection = ref<PlaneSelection>({ t: 0, c: 0, z: 0 })
const sourceId = ref<string | null>(null)
const channelCount = ref(1)
const zCount = ref(1)
const tCount = ref(1)
const layout = ref<ViewerLayout>('single')
const roiTool = ref<'idle' | 'add-rect' | 'add-line'>('idle')
const selectedRoiId = ref<string | null>(null)

const engine = new ImageViewerEngine()
type OrthographicViewState = {
  target: [number, number, number]
  zoom: HomeZoom
  minZoom: number
  maxZoom: number
}
const deck = shallowRef<Deck<OrthographicView[]> | null>(null)
let loadController: AbortController | null = null
let viewState: OrthographicViewState = { target: [0, 0, 0], zoom: 0, minZoom: -10, maxZoom: 8 }
let resizeObserver: ResizeObserver | null = null
let drag: {
  start: { x: number; y: number }
  last: { x: number; y: number }
  pan: boolean
  mode: DragZoomMode | null
} | null = null
const guide = ref<PlotRect | null>(null)
let viewIsHome = true
let applyingView = false
let applyViewToken = 0
let lastPointerUpAt = 0
let lastPointerUpAtPoint = { x: 0, y: 0 }

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

function channelColor(channel: number): [number, number, number] {
  return engine.channelColors[channel] ?? CHANNEL_LUTS.green
}

function channelContrast(channel: number): [number, number] {
  return engine.channelContrast[channel] ?? engine.loaded?.contrast ?? [0, 1]
}

function orthoViews(): OrthographicView[] {
  const count = engine.loaded?.channelCount ?? 1
  return paneViews(layout.value, count).map(
    (pane) =>
      new OrthographicView({
        id: pane.id,
        x: pane.x,
        y: pane.y,
        width: pane.width,
        height: pane.height,
        flipY: DISPLAY_ORIENTATION.flipY,
        controller: false,
      }),
  )
}

function viewStateMap(): Record<string, OrthographicViewState & { transitionDuration: number }> {
  const count = engine.loaded?.channelCount ?? 1
  const next: Record<string, OrthographicViewState & { transitionDuration: number }> = {}
  for (const pane of paneViews(layout.value, count)) {
    next[pane.id] = { ...viewState, transitionDuration: 0 }
  }
  return next
}

function pixelLayers(): unknown[] {
  const loaded = engine.loaded
  if (!loaded) return []
  const views = paneViews(layout.value, loaded.channelCount)
  if (layout.value === 'composite') {
    const channels = paneChannels(layout.value, loaded.channelCount, loaded.selection.c)
    const pane = views[0]
    if (!pane) return []
    return [
      new MultiscaleImageLayer({
        id: `pixels-${loaded.generation}-composite-${channels.join('.')}-${loaded.selection.z}`,
        viewIds: [pane.id],
        loader: loaded.loaders as never,
        selections: channels.map((channel) =>
          vivSelection(loaded.labels, { ...loaded.selection, c: channel }),
        ),
        contrastLimits: channels.map((channel) => channelContrast(channel)),
        channelsVisible: channels.map(() => true),
        colors: channels.map((channel) => channelColor(channel)),
        dtype: loaded.dtype as 'Uint16',
        extensions: [new ColorPaletteExtension()],
      } as never),
    ]
  }
  const channels = paneChannels(layout.value, loaded.channelCount, loaded.selection.c)
  return views.map((pane, index) => {
    const channel = channels[index] ?? loaded.selection.c
    return new MultiscaleImageLayer({
      id: `pixels-${loaded.generation}-${pane.id}-c${channel}-z${loaded.selection.z}`,
      viewIds: [pane.id],
      loader: loaded.loaders as never,
      selections: [vivSelection(loaded.labels, { ...loaded.selection, c: channel })],
      contrastLimits: [channelContrast(channel)],
      channelsVisible: [true],
      colors: [channelColor(channel)],
      dtype: loaded.dtype as 'Uint16',
      extensions: [new ColorPaletteExtension()],
    } as never)
  })
}

function overlayLayers(): unknown[] {
  const loaded = engine.loaded
  const views = paneViews(layout.value, loaded?.channelCount ?? 1)
  const polygons = engine.rois
    .filter((roi) => roi.kind === 'rect')
    .map((roi) => {
      const a = sourceToDisplay(roi.x0, roi.y0)
      const b = sourceToDisplay(roi.x1, roi.y0)
      const c = sourceToDisplay(roi.x1, roi.y1)
      const d = sourceToDisplay(roi.x0, roi.y1)
      const selected = roi.id === engine.selectedRoiId
      return {
        id: roi.id,
        polygon: [
          [a.x, a.y],
          [b.x, b.y],
          [c.x, c.y],
          [d.x, d.y],
        ],
        lineColor: selected ? [250, 204, 21] : [251, 146, 60],
      }
    })
  const lines = [
    ...engine.rois
      .filter((roi) => roi.kind === 'line')
      .map((roi) => {
        const a = sourceToDisplay(roi.x0, roi.y0)
        const b = sourceToDisplay(roi.x1, roi.y1)
        const selected = roi.id === engine.selectedRoiId
        return {
          id: roi.id,
          path: [
            [a.x, a.y],
            [b.x, b.y],
          ],
          color: selected ? [250, 204, 21] : [34, 211, 238],
        }
      }),
    ...engine.xyOverlays.map((overlay) => ({
      id: overlay.id,
      path: overlay.x.map((x, index) => {
        const point = sourceToDisplay(x, overlay.y[index] ?? 0)
        return [point.x, point.y]
      }),
      color: [250, 204, 21],
    })),
  ]
  return views.flatMap((pane) => [
    new PolygonLayer({
      id: `rois-rect-${pane.id}`,
      viewIds: [pane.id],
      data: polygons,
      getPolygon: (d: { polygon: number[][] }) => d.polygon as [number, number][],
      getLineColor: (d: { lineColor: number[] }) => d.lineColor as [number, number, number],
      getFillColor: [251, 146, 60, 40] as [number, number, number, number],
      lineWidthMinPixels: 2,
      pickable: true,
    }),
    new PathLayer({
      id: `rois-xy-${pane.id}`,
      viewIds: [pane.id],
      data: lines,
      getPath: (d: { path: number[][] }) => d.path as [number, number][],
      getColor: (d: { color: number[] }) => d.color as [number, number, number],
      widthMinPixels: 2,
      pickable: true,
    }),
  ])
}

function emitView(): void {
  const window = engine.viewWindow()
  if (window) emit('view-change', window)
}

function draw(): void {
  deck.value?.setProps({
    layers: [...pixelLayers(), ...overlayLayers()] as never[],
  })
}

function goHome(): void {
  const loaded = engine.loaded
  const el = host.value
  if (!loaded || !el) return
  const pane = panePixelSize(layout.value, loaded.channelCount, el.clientWidth, el.clientHeight)
  const imageW = Math.max(loaded.width, 1)
  const imageH = Math.max(loaded.height, 1)
  viewState = {
    target: [imageW / 2, imageH / 2, 0],
    zoom: homeZoom(pane.width, pane.height, imageW, imageH),
    minZoom: -10,
    maxZoom: 8,
  }
  commitView(true)
}

function orthoController(): { dragPan: boolean; doubleClickZoom: boolean; scrollZoom: boolean } {
  return {
    dragPan: false,
    doubleClickZoom: props.doubleClickBehavior === 'deck',
    scrollZoom: true,
  }
}

function plotPoint(event: PointerEvent): { x: number; y: number } {
  const el = requireValue(host.value, 'image host is not mounted')
  const box = el.getBoundingClientRect()
  return {
    x: Math.min(Math.max(event.clientX - box.left, 0), el.clientWidth),
    y: Math.min(Math.max(event.clientY - box.top, 0), el.clientHeight),
  }
}

function screenToWorld(x: number, y: number): [number, number] | null {
  const viewports = deck.value?.getViewports() ?? []
  const viewport =
    viewports.find(
      (item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height,
    ) ?? viewports[0]
  if (!viewport) return null
  const point = viewport.unproject([x, y])
  const worldX = point[0]
  const worldY = point[1]
  if (worldX === undefined || worldY === undefined) return null
  return [worldX, worldY]
}

function beginApplyView(): void {
  applyViewToken += 1
  applyingView = true
}

function endApplyViewAfterPaint(): void {
  const token = applyViewToken
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token === applyViewToken) applyingView = false
    })
  })
}

function unwrapViewState(next: unknown): OrthographicViewState | null {
  if (!next || typeof next !== 'object') return null
  const record = next as Record<string, unknown>
  if ('target' in record && 'zoom' in record) return record as unknown as OrthographicViewState
  for (const value of Object.values(record)) {
    if (!value || typeof value !== 'object') continue
    if ('target' in value && 'zoom' in value) return value as OrthographicViewState
  }
  return null
}

function adoptUserViewState(next: unknown): void {
  const incoming = unwrapViewState(next)
  if (!incoming) return
  let zoom = incoming.zoom
  if (Array.isArray(viewState.zoom) && typeof zoom === 'number') {
    const delta = zoom - viewState.zoom[0]
    zoom = [viewState.zoom[0] + delta, viewState.zoom[1] + delta]
  }
  viewState = {
    target: incoming.target,
    zoom,
    minZoom: incoming.minZoom ?? viewState.minZoom,
    maxZoom: incoming.maxZoom ?? viewState.maxZoom,
  }
  viewIsHome = false
  beginApplyView()
  deck.value?.setProps({ viewState: viewStateMap() })
  endApplyViewAfterPaint()
  emitView()
}

function commitView(home = false): void {
  viewIsHome = home
  beginApplyView()
  deck.value?.setProps({ viewState: viewStateMap() })
  endApplyViewAfterPaint()
  emitView()
}

function onDoubleClick(event: MouseEvent): void {
  if (props.doubleClickBehavior !== 'home') return
  event.preventDefault()
  event.stopPropagation()
  drag = null
  guide.value = null
  goHome()
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !engine.loaded) return
  const el = host.value
  if (!el) return
  el.setPointerCapture(event.pointerId)
  const point = plotPoint(event)
  drag = {
    start: point,
    last: point,
    pan: event.shiftKey,
    mode: event.shiftKey ? null : 'pending',
  }
  guide.value = null
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || !engine.loaded) return
  const point = plotPoint(event)
  if (drag.pan) {
    const from = screenToWorld(drag.last.x, drag.last.y)
    const to = screenToWorld(point.x, point.y)
    if (from && to) {
      viewState = {
        ...viewState,
        target: [viewState.target[0] + (from[0] - to[0]), viewState.target[1] + (from[1] - to[1]), 0],
      }
      commitView()
    }
    drag.last = point
    return
  }
  if (drag.mode === 'pending') {
    drag.mode = dragZoomMode(engine.loaded.width, engine.loaded.height, drag.start, point)
  }
  drag.last = point
  if (roiTool.value === 'add-rect' || roiTool.value === 'add-line') {
    guide.value = {
      left: Math.min(drag.start.x, point.x),
      top: Math.min(drag.start.y, point.y),
      width: Math.abs(point.x - drag.start.x),
      height: Math.abs(point.y - drag.start.y),
    }
    return
  }
  if (drag.mode && drag.mode !== 'pending') {
    const plot = { width: elWidth(), height: elHeight() }
    const selection = selectionRect(
      engine.loaded.width,
      engine.loaded.height,
      plot,
      drag.start,
      point,
    )
    guide.value = guideRect(drag.mode, selection, plot)
  }
}

function elWidth(): number {
  return Math.max(host.value?.clientWidth ?? 1, 1)
}

function elHeight(): number {
  return Math.max(host.value?.clientHeight ?? 1, 1)
}

function onPointerUp(event: PointerEvent): void {
  const el = host.value
  if (el?.hasPointerCapture(event.pointerId)) {
    el.releasePointerCapture(event.pointerId)
  }
  const active = drag
  drag = null
  guide.value = null
  if (!active || !engine.loaded) return
  const now = performance.now()
  const travel = Math.hypot(active.last.x - active.start.x, active.last.y - active.start.y)
  const isClick = !active.pan && (!active.mode || active.mode === 'pending' || travel < MIN_REGION_PIXELS)
  const isDoubleClick =
    isClick &&
    now - lastPointerUpAt < 400 &&
    Math.hypot(active.last.x - lastPointerUpAtPoint.x, active.last.y - lastPointerUpAtPoint.y) < 8
  lastPointerUpAt = now
  lastPointerUpAtPoint = active.last
  if (isDoubleClick && props.doubleClickBehavior === 'home') return
  if (roiTool.value === 'add-rect') {
    finishRectRoi(active.start, active.last)
    return
  }
  if (roiTool.value === 'add-line') {
    finishLineRoi(active.start, active.last)
    return
  }
  if (active.pan) return
  if (!active.mode || active.mode === 'pending') {
    pickRoi(active.last.x, active.last.y)
    return
  }
  const plot = { width: elWidth(), height: elHeight() }
  const selection = selectionRect(
    engine.loaded.width,
    engine.loaded.height,
    plot,
    active.start,
    active.last,
  )
  if (active.mode === 'x' && selection.width < MIN_REGION_PIXELS) return
  if (active.mode === 'y' && selection.height < MIN_REGION_PIXELS) return
  if (
    active.mode === 'region' &&
    (selection.width < MIN_REGION_PIXELS || selection.height < MIN_REGION_PIXELS)
  ) {
    return
  }
  applyDragZoom(active.mode, selection)
}

function finishRectRoi(start: { x: number; y: number }, end: { x: number; y: number }): void {
  if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_REGION_PIXELS) return
  const a = screenToWorld(start.x, start.y)
  const b = screenToWorld(end.x, end.y)
  if (!a || !b) return
  const sourceA = displayToSource(a[0], a[1])
  const sourceB = displayToSource(b[0], b[1])
  engine.addRoi({
    id: engine.nextRoiId(),
    kind: 'rect',
    x0: Math.min(sourceA.x, sourceB.x),
    y0: Math.min(sourceA.y, sourceB.y),
    x1: Math.max(sourceA.x, sourceB.x),
    y1: Math.max(sourceA.y, sourceB.y),
  })
  selectedRoiId.value = engine.selectedRoiId
  roiTool.value = 'idle'
  draw()
}

function finishLineRoi(start: { x: number; y: number }, end: { x: number; y: number }): void {
  if (Math.hypot(end.x - start.x, end.y - start.y) < MIN_REGION_PIXELS) return
  const a = screenToWorld(start.x, start.y)
  const b = screenToWorld(end.x, end.y)
  if (!a || !b) return
  const sourceA = displayToSource(a[0], a[1])
  const sourceB = displayToSource(b[0], b[1])
  engine.addRoi({
    id: engine.nextRoiId(),
    kind: 'line',
    x0: sourceA.x,
    y0: sourceA.y,
    x1: sourceB.x,
    y1: sourceB.y,
  })
  selectedRoiId.value = engine.selectedRoiId
  roiTool.value = 'idle'
  draw()
}

function pickRoi(x: number, y: number): void {
  const info = deck.value?.pickObject({ x, y, radius: 6 })
  const id = (info?.object as { id?: string } | null)?.id
  if (typeof id === 'string' && engine.rois.some((roi) => roi.id === id)) {
    engine.selectRoi(id)
  } else {
    engine.selectRoi(null)
  }
  selectedRoiId.value = engine.selectedRoiId
  draw()
}

function applyDragZoom(mode: DragZoomMode, selection: PlotRect): void {
  const a = screenToWorld(selection.left, selection.top)
  const b = screenToWorld(selection.left + selection.width, selection.top + selection.height)
  if (!a || !b) return
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const worldW = Math.max(x1 - x0, 1e-6)
  const worldH = Math.max(y1 - y0, 1e-6)
  const pane = panePixelSize(layout.value, engine.loaded?.channelCount ?? 1, elWidth(), elHeight())
  const viewW = pane.width
  const viewH = pane.height
  if (mode === 'region') {
    const scale = Math.min(viewW / worldW, viewH / worldH)
    viewState = {
      ...viewState,
      target: [(x0 + x1) / 2, (y0 + y1) / 2, 0],
      zoom: Math.log2(scale),
    }
    commitView()
    return
  }
  const zoomX = Array.isArray(viewState.zoom) ? viewState.zoom[0] : viewState.zoom
  const zoomY = Array.isArray(viewState.zoom) ? viewState.zoom[1] : viewState.zoom
  if (mode === 'x') {
    viewState = {
      ...viewState,
      target: [(x0 + x1) / 2, viewState.target[1], 0],
      zoom: [Math.log2(viewW / worldW), zoomY],
    }
    commitView()
    return
  }
  if (mode === 'y') {
    viewState = {
      ...viewState,
      target: [viewState.target[0], (y0 + y1) / 2, 0],
      zoom: [zoomX, Math.log2(viewH / worldH)],
    }
    commitView()
  }
}

function formatStatus(loaded: LoadedImage): string {
  return [
    loaded.kind,
    `display ${loaded.width}×${loaded.height}`,
    `source ${loaded.sourceHeight}×${loaded.sourceWidth}`,
    `C${loaded.channelCount}`,
    `Z${loaded.zCount}`,
  ].join(' ')
}

function selectCopyText(event: Event): void {
  const el = event.target
  if (el instanceof HTMLInputElement) el.select()
}

export interface SourceInfo {
  id: string
  kind: LoadedImage['kind']
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  channelCount: number
  zCount: number
  tCount: number
}

async function setSource(source: ImageSource): Promise<SourceInfo | null> {
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  status.value = 'Loading…'
  errorMessage.value = null
  try {
    const loaded = await engine.setSource(source, controller.signal)
    if (controller.signal.aborted) return null
    selection.value = { ...loaded.selection }
    sourceId.value = loaded.sourceId
    channelCount.value = loaded.channelCount
    zCount.value = loaded.zCount
    tCount.value = loaded.tCount
    selectedRoiId.value = engine.selectedRoiId
    roiTool.value = 'idle'
    engine.layout = layout.value
    await nextTick()
    deck.value?.setProps({ views: orthoViews() })
    goHome()
    draw()
    status.value = formatStatus(loaded)
    emit('source-change', loaded.sourceId)
    emitView()
    return {
      id: loaded.sourceId,
      kind: loaded.kind,
      width: loaded.width,
      height: loaded.height,
      sourceWidth: loaded.sourceWidth,
      sourceHeight: loaded.sourceHeight,
      channelCount: loaded.channelCount,
      zCount: loaded.zCount,
      tCount: loaded.tCount,
    }
  } catch (reason) {
    if (controller.signal.aborted) return null
    errorMessage.value = reason instanceof Error ? reason.message : String(reason)
    status.value = 'Failed'
    return null
  }
}

function setRois(rois: readonly Roi[]): void {
  engine.setRois(rois)
  selectedRoiId.value = engine.selectedRoiId
  draw()
}

function setXyOverlays(overlays: readonly XyOverlay[]): void {
  engine.setXyOverlays(overlays)
  draw()
}

async function onSelection(): Promise<void> {
  if (!engine.loaded) return
  engine.setSelection(selection.value)
  selection.value = { ...engine.loaded.selection }
  await engine.refreshPlaneContrast()
  draw()
}

function onLayout(): void {
  engine.layout = layout.value
  deck.value?.setProps({ views: orthoViews() })
  if (viewIsHome) goHome()
  else commitView()
  draw()
}

function onLutEvent(channel: number, event: Event): void {
  const name = (event.target as HTMLSelectElement).value as LutName
  onLut(channel, name)
}

function onLut(channel: number, name: LutName): void {
  engine.setChannelColor(channel, CHANNEL_LUTS[name])
  draw()
}

function onContrastEvent(channel: number, which: 0 | 1, event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) return
  onContrast(channel, which, value)
}

function onContrast(channel: number, which: 0 | 1, value: number): void {
  const current = channelContrast(channel)
  const next: [number, number] = which === 0 ? [value, current[1]] : [current[0], value]
  engine.setChannelContrast(channel, next)
  draw()
}

function startAddRoi(kind: 'add-rect' | 'add-line'): void {
  roiTool.value = roiTool.value === kind ? 'idle' : kind
}

function deleteSelectedRoi(): void {
  if (!engine.selectedRoiId) return
  engine.removeRoi(engine.selectedRoiId)
  selectedRoiId.value = engine.selectedRoiId
  draw()
}

onMounted(() => {
  const canvasHost = requireValue(host.value, 'image host is not mounted')
  const instance = new Deck<OrthographicView[]>({
    parent: canvasHost,
    views: orthoViews(),
    controller: orthoController(),
    initialViewState: viewStateMap(),
    useDevicePixels: true,
    layers: [],
    onViewStateChange: ({ viewState: next }) => {
      if (applyingView) return
      adoptUserViewState(next)
    },
  })
  deck.value = instance
  canvasHost.addEventListener('pointerdown', onPointerDown)
  canvasHost.addEventListener('pointermove', onPointerMove)
  canvasHost.addEventListener('pointerup', onPointerUp)
  canvasHost.addEventListener('pointercancel', onPointerUp)
  canvasHost.addEventListener('dblclick', onDoubleClick, true)
  let lastHostWidth = canvasHost.clientWidth
  let lastHostHeight = canvasHost.clientHeight
  resizeObserver = new ResizeObserver(() => {
    const width = canvasHost.clientWidth
    const height = canvasHost.clientHeight
    if (width === lastHostWidth && height === lastHostHeight) return
    lastHostWidth = width
    lastHostHeight = height
    const wasHome = viewIsHome
    beginApplyView()
    instance.setProps({ width, height })
    if (engine.loaded && wasHome) goHome()
    else endApplyViewAfterPaint()
  })
  resizeObserver.observe(canvasHost)
})

watch(
  () => props.doubleClickBehavior,
  () => {
    deck.value?.setProps({
      views: orthoViews(),
      controller: orthoController(),
    })
  },
)

onBeforeUnmount(() => {
  applyViewToken += 1
  applyingView = false
  loadController?.abort()
  const canvasHost = host.value
  canvasHost?.removeEventListener('pointerdown', onPointerDown)
  canvasHost?.removeEventListener('pointermove', onPointerMove)
  canvasHost?.removeEventListener('pointerup', onPointerUp)
  canvasHost?.removeEventListener('pointercancel', onPointerUp)
  canvasHost?.removeEventListener('dblclick', onDoubleClick, true)
  resizeObserver?.disconnect()
  resizeObserver = null
  deck.value?.finalize()
  deck.value = null
})

defineExpose({ setSource, setRois, setXyOverlays, engine })
</script>

<template>
  <section class="mm-image-viewer">
    <div class="mm-image-viewer-toolbar">
      <span>{{ sourceId ?? 'idle' }}</span>
      <label>
        Layout
        <select v-model="layout" @change="onLayout">
          <option value="single">single</option>
          <option value="side">side</option>
          <option value="stack">stack</option>
          <option value="composite">composite</option>
        </select>
      </label>
      <label v-if="channelCount > 1 && layout === 'single'">
        C
        <input v-model.number="selection.c" type="range" min="0" :max="channelCount - 1" @input="onSelection" />
        {{ selection.c }}
      </label>
      <label v-if="zCount > 1">
        Z
        <input v-model.number="selection.z" type="range" min="0" :max="zCount - 1" @input="onSelection" />
        {{ selection.z }}
      </label>
      <label v-if="tCount > 1">
        T
        <input v-model.number="selection.t" type="range" min="0" :max="tCount - 1" @input="onSelection" />
        {{ selection.t }}
      </label>
      <button type="button" :class="{ active: roiTool === 'add-rect' }" @click="startAddRoi('add-rect')">
        Add rect
      </button>
      <button type="button" :class="{ active: roiTool === 'add-line' }" @click="startAddRoi('add-line')">
        Add line
      </button>
      <button type="button" :disabled="!selectedRoiId" @click="deleteSelectedRoi">Delete ROI</button>
      <label v-for="channel in channelCount" :key="channel">
        C{{ channel - 1 }}
        <select :value="lutNameFromRgb(channelColor(channel - 1))" @change="onLutEvent(channel - 1, $event)">
          <option v-for="name in LUT_ORDER" :key="name" :value="name">{{ name }}</option>
        </select>
        <input
          :value="channelContrast(channel - 1)[0]"
          type="number"
          @change="onContrastEvent(channel - 1, 0, $event)"
        />
        <input
          :value="channelContrast(channel - 1)[1]"
          type="number"
          @change="onContrastEvent(channel - 1, 1, $event)"
        />
      </label>
    </div>
    <input
      class="mm-image-viewer-copy"
      type="text"
      readonly
      :value="errorMessage ?? status"
      @focus="selectCopyText"
    />
    <div ref="host" class="mm-image-viewer-stage">
      <div
        v-if="guide"
        class="mm-image-viewer-guide"
        :style="{
          left: `${guide.left}px`,
          top: `${guide.top}px`,
          width: `${guide.width}px`,
          height: `${guide.height}px`,
        }"
      />
      <p v-if="errorMessage" class="mm-image-viewer-status error">{{ errorMessage }}</p>
      <p v-else class="mm-image-viewer-status">{{ status }}</p>
    </div>
  </section>
</template>
