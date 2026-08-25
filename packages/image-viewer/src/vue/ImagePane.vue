<script setup lang="ts">
import { Deck, OrthographicView } from '@deck.gl/core'
import { PathLayer, PolygonLayer } from '@deck.gl/layers'
import { ColorPaletteExtension, AdditiveColormapExtension } from '@vivjs/extensions'
import { MultiscaleImageLayer } from '@vivjs/layers'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import { CHANNEL_LUTS, LUT_ORDER, lutNameFromRgb, vivColormapForPane, type LutName } from '../engine/channel-luts'
import { DEFAULT_AXIS_STYLE, drawAxes, visibleImageAxis } from '../engine/axis-ticks'
import {
  dragZoomMode,
  guideRect,
  MIN_REGION_PIXELS,
  selectionRect,
  type DragZoomMode,
  type PlotRect,
} from '../engine/drag-zoom'
import { DISPLAY_ORIENTATION, sourceToDisplay } from '../engine/orientation'
import type { Roi, XyOverlay } from '../engine/types'
import { visibleDisplayRect, type OrthographicViewState } from '../engine/view-fit'
import type { LoadedImage } from '../engine/viewer-engine'
import { vivSelection } from '../engine/viv-selection'
import LucideIcon from './LucideIcon.vue'

const VIEW_ID = 'ortho'

const props = withDefaults(
  defineProps<{
    loaded: LoadedImage | null
    channels: number[]
    channelColors: [number, number, number][]
    channelContrast: [number, number][]
    rois: readonly Roi[]
    selectedRoiId: string | null
    xyOverlays: readonly XyOverlay[]
    camera: OrthographicViewState
    doubleClickBehavior?: 'home' | 'deck'
    overlayRevision: number
    pixelRevision: number
    axesVisible?: boolean
    roisVisible?: boolean
    channelToolbarsVisible?: boolean
  }>(),
  {
    doubleClickBehavior: 'home',
    axesVisible: true,
    roisVisible: true,
    channelToolbarsVisible: true,
  },
)

const emit = defineEmits<{
  'camera-change': [camera: OrthographicViewState]
  home: []
  'select-roi': [id: string | null]
  lut: [channel: number, name: LutName]
  'contrast-panel': [channel: number, button: HTMLElement]
}>()

const host = ref<HTMLDivElement | null>(null)
const plot = ref<HTMLDivElement | null>(null)
const axesCanvas = ref<HTMLCanvasElement | null>(null)
const guide = ref<PlotRect | null>(null)
const deck = shallowRef<Deck<OrthographicView[]> | null>(null)
let committedPixelLayers: unknown[] = []
let committedPixelKey = ''
let pendingPixelLayers: unknown[] | null = null
let pixelUpdateToken = 0
let resizeObserver: ResizeObserver | null = null
let applyingView = false
let applyViewToken = 0
let lastHostWidth = 0
let lastHostHeight = 0
let drag: {
  start: { x: number; y: number }
  last: { x: number; y: number }
  pan: boolean
  mode: DragZoomMode | null
} | null = null

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

function beginApplyView(): void {
  applyViewToken += 1
  applyingView = true
}

function endApplyViewAfterPaint(): void {
  const token = applyViewToken
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (token !== applyViewToken) return
      applyingView = false
      drawAxisChrome()
    })
  })
}

function channelColor(channel: number): [number, number, number] {
  return props.channelColors[channel] ?? CHANNEL_LUTS.green
}

function channelContrast(channel: number): [number, number] {
  return props.channelContrast[channel] ?? props.loaded?.contrast ?? [0, 1]
}

function cameraProps(camera: OrthographicViewState): Record<string, OrthographicViewState & { transitionDuration: number }> {
  return { [VIEW_ID]: { ...camera, transitionDuration: 0 } }
}

function pixelKey(): string {
  const loaded = props.loaded
  if (!loaded) return ''
  return `${loaded.generation}:t${loaded.selection.t}:z${loaded.selection.z}:${props.channels.join('.')}`
}

function pixelLayers(onViewportLoad?: () => void): unknown[] {
  const loaded = props.loaded
  if (!loaded) return []
  const channels = props.channels
  const firstLut = lutNameFromRgb(channelColor(channels[0] ?? 0))
  const colormap = vivColormapForPane(firstLut, channels.length)
  const shared = {
    id: `pixels-${loaded.generation}-${channels.join('.')}-t${loaded.selection.t}-z${loaded.selection.z}-${colormap ?? firstLut}`,
    loader: loaded.loaders as never,
    selections: channels.map((channel) =>
      vivSelection(loaded.labels, { ...loaded.selection, c: channel }),
    ),
    contrastLimits: channels.map((channel) => channelContrast(channel)),
    channelsVisible: channels.map(() => true),
    dtype: loaded.dtype as 'Uint16',
    // In-memory planes use one exact-resolution tiled loader. A Viv background
    // is unnecessary and must not introduce separately scaled image geometry.
    excludeBackground: loaded.inMemoryTiles,
    // These tiles are already decoded in memory, so fill the viewport without
    // Viv's network-oriented request throttle.
    maxRequests: loaded.inMemoryTiles ? 64 : 10,
    ...(onViewportLoad ? { onViewportLoad } : {}),
  }
  if (colormap) {
    return [
      new MultiscaleImageLayer({
        ...shared,
        colormap,
        extensions: [new AdditiveColormapExtension()],
      } as never),
    ]
  }
  return [
    new MultiscaleImageLayer({
      ...shared,
      colors: channels.map((channel) => channelColor(channel)),
      extensions: [new ColorPaletteExtension()],
    } as never),
  ]
}

function overlayLayers(): unknown[] {
  const polygons = props.roisVisible
    ? props.rois
        .filter((roi) => roi.kind === 'rect')
        .map((roi) => {
          const a = sourceToDisplay(roi.x0, roi.y0)
          const b = sourceToDisplay(roi.x1, roi.y0)
          const c = sourceToDisplay(roi.x1, roi.y1)
          const d = sourceToDisplay(roi.x0, roi.y1)
          const selected = roi.id === props.selectedRoiId
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
    : []
  const roiLines = props.roisVisible
    ? props.rois
        .filter((roi) => roi.kind === 'line')
        .map((roi) => {
          const a = sourceToDisplay(roi.x0, roi.y0)
          const b = sourceToDisplay(roi.x1, roi.y1)
          const selected = roi.id === props.selectedRoiId
          return {
            id: roi.id,
            path: [
              [a.x, a.y],
              [b.x, b.y],
            ],
            color: selected ? [250, 204, 21] : [34, 211, 238],
          }
        })
    : []
  const lines = [
    ...roiLines,
    ...props.xyOverlays.map((overlay) => ({
      id: overlay.id,
      path: overlay.x.map((x, index) => {
        const point = sourceToDisplay(x, overlay.y[index] ?? 0)
        return [point.x, point.y]
      }),
      color: [250, 204, 21],
    })),
  ]
  return [
    new PolygonLayer({
      id: 'rois-rect',
      data: polygons,
      getPolygon: (d: { polygon: number[][] }) => d.polygon as [number, number][],
      getLineColor: (d: { lineColor: number[] }) => d.lineColor as [number, number, number],
      getFillColor: [251, 146, 60, 40] as [number, number, number, number],
      lineWidthMinPixels: 2,
      pickable: true,
    }),
    new PathLayer({
      id: 'rois-xy',
      data: lines,
      getPath: (d: { path: number[][] }) => d.path as [number, number][],
      getColor: (d: { color: number[] }) => d.color as [number, number, number],
      widthMinPixels: 2,
      pickable: true,
    }),
  ]
}

function applyLayers(): void {
  const pixels = pendingPixelLayers
    ? [...pendingPixelLayers, ...committedPixelLayers]
    : committedPixelLayers
  deck.value?.setProps({
    layers: [...pixels, ...overlayLayers()] as never[],
  })
}

function updatePixelLayers(): void {
  const nextKey = pixelKey()
  const loaded = props.loaded
  const sameSource =
    committedPixelKey !== '' &&
    loaded != null &&
    committedPixelKey.startsWith(`${loaded.generation}:`)
  const transition = sameSource && nextKey !== committedPixelKey
  const token = pixelUpdateToken + 1
  pixelUpdateToken = token
  let next: unknown[] = []
  const ready = () => {
    if (token !== pixelUpdateToken) return
    committedPixelLayers = next
    committedPixelKey = nextKey
    pendingPixelLayers = null
    applyLayers()
  }
  next = pixelLayers(transition ? ready : undefined)
  if (transition) {
    pendingPixelLayers = next
  } else {
    committedPixelLayers = next
    committedPixelKey = nextKey
    pendingPixelLayers = null
  }
  applyLayers()
}

function applyCamera(camera: OrthographicViewState): void {
  beginApplyView()
  deck.value?.setProps({ viewState: cameraProps(camera) })
  endApplyViewAfterPaint()
}

function plotPoint(event: PointerEvent): { x: number; y: number } {
  const el = requireValue(host.value, 'pane host is not mounted')
  const box = el.getBoundingClientRect()
  return {
    x: Math.min(Math.max(event.clientX - box.left, 0), el.clientWidth),
    y: Math.min(Math.max(event.clientY - box.top, 0), el.clientHeight),
  }
}

function screenToWorld(x: number, y: number): [number, number] | null {
  const viewport = deck.value?.getViewports()[0]
  if (!viewport) return null
  const point = viewport.unproject([x, y])
  const worldX = point[0]
  const worldY = point[1]
  if (worldX === undefined || worldY === undefined) return null
  return [worldX, worldY]
}

function unwrapViewState(next: unknown): OrthographicViewState | null {
  if (!next || typeof next !== 'object') return null
  const record = next as Record<string, unknown>
  if ('target' in record && 'zoom' in record) return record as unknown as OrthographicViewState
  const named = record[VIEW_ID]
  if (named && typeof named === 'object' && 'zoom' in named) {
    return named as OrthographicViewState
  }
  return null
}

function onDoubleClick(event: MouseEvent): void {
  if (props.doubleClickBehavior !== 'home') return
  event.preventDefault()
  event.stopPropagation()
  drag = null
  guide.value = null
  emit('home')
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !props.loaded) return
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
  if (!drag || !props.loaded) return
  const point = plotPoint(event)
  if (drag.pan) {
    const from = screenToWorld(drag.last.x, drag.last.y)
    const to = screenToWorld(point.x, point.y)
    if (from && to) {
      emit('camera-change', {
        ...props.camera,
        target: [
          props.camera.target[0] + (from[0] - to[0]),
          props.camera.target[1] + (from[1] - to[1]),
          0,
        ],
      })
    }
    drag.last = point
    return
  }
  if (drag.mode === 'pending') {
    drag.mode = dragZoomMode(props.loaded.width, props.loaded.height, drag.start, point)
  }
  drag.last = point
  if (drag.mode && drag.mode !== 'pending') {
    const plot = { width: elWidth(), height: elHeight() }
    const selection = selectionRect(props.loaded.width, props.loaded.height, plot, drag.start, point)
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
  if (!active || !props.loaded) return
  if (active.pan) return
  if (!active.mode || active.mode === 'pending') {
    pickRoi(active.last.x, active.last.y)
    return
  }
  const plot = { width: elWidth(), height: elHeight() }
  const selection = selectionRect(
    props.loaded.width,
    props.loaded.height,
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

function pickRoi(x: number, y: number): void {
  const info = deck.value?.pickObject({ x, y, radius: 6 })
  const id = (info?.object as { id?: string } | null)?.id
  if (typeof id === 'string' && props.rois.some((roi) => roi.id === id)) {
    emit('select-roi', id)
  } else {
    emit('select-roi', null)
  }
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
  const viewW = elWidth()
  const viewH = elHeight()
  if (mode === 'region') {
    emit('camera-change', {
      ...props.camera,
      target: [(x0 + x1) / 2, (y0 + y1) / 2, 0],
      zoom: Math.log2(Math.min(viewW / worldW, viewH / worldH)),
    })
    return
  }
  const zoomX = Array.isArray(props.camera.zoom) ? props.camera.zoom[0] : props.camera.zoom
  const zoomY = Array.isArray(props.camera.zoom) ? props.camera.zoom[1] : props.camera.zoom
  if (mode === 'x') {
    emit('camera-change', {
      ...props.camera,
      target: [(x0 + x1) / 2, props.camera.target[1], 0],
      zoom: [Math.log2(viewW / worldW), zoomY],
    })
    return
  }
  if (mode === 'y') {
    emit('camera-change', {
      ...props.camera,
      target: [props.camera.target[0], (y0 + y1) / 2, 0],
      zoom: [zoomX, Math.log2(viewH / worldH)],
    })
  }
}

function onLutEvent(channel: number, event: Event): void {
  emit('lut', channel, (event.target as HTMLSelectElement).value as LutName)
}

function onContrastPanel(channel: number, event: MouseEvent): void {
  const button = event.currentTarget
  if (!(button instanceof HTMLElement)) return
  emit('contrast-panel', channel, button)
}

const stageInset = computed(() => {
  if (!props.axesVisible) {
    return { left: '0px', top: '0px', right: '0px', bottom: '0px' }
  }
  const margins = DEFAULT_AXIS_STYLE.margins
  return {
    left: `${margins.left}px`,
    top: `${margins.top}px`,
    right: `${margins.right}px`,
    bottom: `${margins.bottom}px`,
  }
})

function drawAxisChrome(): void {
  const canvas = axesCanvas.value
  const plotEl = plot.value
  const loaded = props.loaded
  if (!canvas || !plotEl) return
  const context = canvas.getContext('2d')
  if (!context) return
  const cssWidth = Math.max(1, plotEl.clientWidth)
  const cssHeight = Math.max(1, plotEl.clientHeight)
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(cssWidth * dpr)
  canvas.height = Math.round(cssHeight * dpr)
  canvas.style.width = `${cssWidth}px`
  canvas.style.height = `${cssHeight}px`
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, cssWidth, cssHeight)
  if (!loaded || !props.axesVisible) return
  const stageEl = host.value
  if (!stageEl) return
  const plotRect = plotEl.getBoundingClientRect()
  const stageRect = stageEl.getBoundingClientRect()
  const box = {
    left: stageRect.left - plotRect.left,
    top: stageRect.top - plotRect.top,
    width: Math.max(1, stageEl.clientWidth),
    height: Math.max(1, stageEl.clientHeight),
  }
  const axis = visibleImageAxis({
    plot: box,
    view: visibleDisplayRect(box.width, box.height, props.camera.target, props.camera.zoom),
    imageWidth: loaded.width,
    imageHeight: loaded.height,
    xStep: loaded.xStep,
    yStep: loaded.yStep,
  })
  if (!axis) return
  drawAxes(context, {
    plot: axis.plot,
    canvasHeight: cssHeight,
    xLeft: axis.xLeft,
    xRight: axis.xRight,
    yBottom: axis.yBottom,
    yTop: axis.yTop,
    xLabel: loaded.xLabel,
    xUnit: loaded.xUnit,
    yLabel: loaded.yLabel,
    yUnit: loaded.yUnit,
  })
}

function clientSize(): { width: number; height: number } {
  return { width: elWidth(), height: elHeight() }
}

onMounted(() => {
  const canvasHost = requireValue(host.value, 'pane host is not mounted')
  const instance = new Deck<OrthographicView[]>({
    parent: canvasHost,
    views: [
      new OrthographicView({
        id: VIEW_ID,
        controller: false,
        flipY: DISPLAY_ORIENTATION.flipY,
      }),
    ],
    controller: {
      dragPan: false,
      doubleClickZoom: props.doubleClickBehavior === 'deck',
      scrollZoom: true,
    },
    initialViewState: cameraProps(props.camera),
    useDevicePixels: true,
    layers: [],
    onViewStateChange: ({ viewState: next }) => {
      if (applyingView) return
      const incoming = unwrapViewState(next)
      if (!incoming) return
      let zoom = incoming.zoom
      if (Array.isArray(props.camera.zoom) && typeof zoom === 'number') {
        const delta = zoom - props.camera.zoom[0]
        zoom = [props.camera.zoom[0] + delta, props.camera.zoom[1] + delta]
      }
      emit('camera-change', {
        target: incoming.target,
        zoom,
        minZoom: incoming.minZoom ?? props.camera.minZoom,
        maxZoom: incoming.maxZoom ?? props.camera.maxZoom,
      })
    },
  })
  deck.value = instance
  canvasHost.addEventListener('pointerdown', onPointerDown)
  canvasHost.addEventListener('pointermove', onPointerMove)
  canvasHost.addEventListener('pointerup', onPointerUp)
  canvasHost.addEventListener('pointercancel', onPointerUp)
  canvasHost.addEventListener('dblclick', onDoubleClick, true)
  lastHostWidth = canvasHost.clientWidth
  lastHostHeight = canvasHost.clientHeight
  resizeObserver = new ResizeObserver(() => {
    const width = canvasHost.clientWidth
    const height = canvasHost.clientHeight
    if (width === lastHostWidth && height === lastHostHeight) return
    lastHostWidth = width
    lastHostHeight = height
    instance.setProps({ width, height })
    drawAxisChrome()
  })
  resizeObserver.observe(canvasHost)
  updatePixelLayers()
  applyCamera(props.camera)
  drawAxisChrome()
})

watch(
  () => props.camera,
  (camera) => {
    applyCamera(camera)
    drawAxisChrome()
  },
)

watch(
  () =>
    [
      props.loaded?.generation,
      props.loaded?.selection.t,
      props.loaded?.selection.z,
      props.channels.join('.'),
      props.pixelRevision,
      props.channelColors,
      props.channelContrast,
    ] as const,
  () => {
    updatePixelLayers()
  },
)

watch(
  () => [props.overlayRevision, props.roisVisible] as const,
  () => {
    applyLayers()
  },
)

watch(
  () =>
    [
      props.loaded?.generation,
      props.loaded?.xLabel,
      props.loaded?.xStep,
      props.loaded?.yLabel,
      props.loaded?.yStep,
    ] as const,
  () => {
    drawAxisChrome()
  },
)

watch(
  () => props.axesVisible,
  () => {
    drawAxisChrome()
  },
)

watch(
  () => props.doubleClickBehavior,
  () => {
    deck.value?.setProps({
      controller: {
        dragPan: false,
        doubleClickZoom: props.doubleClickBehavior === 'deck',
        scrollZoom: true,
      },
    })
  },
)

onBeforeUnmount(() => {
  applyViewToken += 1
  pixelUpdateToken += 1
  applyingView = false
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

defineExpose({ clientSize })
</script>

<template>
  <section class="mm-image-pane">
    <div v-if="channelToolbarsVisible" class="mm-image-pane-header">
      <label v-for="channel in channels" :key="channel">
        C{{ channel }}
        <select :value="lutNameFromRgb(channelColor(channel))" @change="onLutEvent(channel, $event)">
          <option v-for="name in LUT_ORDER" :key="name" :value="name">{{ name }}</option>
        </select>
        <button
          type="button"
          class="mm-range-button"
          :aria-label="`Channel ${channel} set contrast`"
          title="Set contrast"
          @click="onContrastPanel(channel, $event)"
        >
          <LucideIcon name="chart-column-decreasing" label="Set contrast" />
        </button>
      </label>
    </div>
    <div ref="plot" class="mm-image-plot">
      <canvas ref="axesCanvas" class="mm-image-axes" />
      <div ref="host" class="mm-image-viewer-stage" :style="stageInset">
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
      </div>
    </div>
  </section>
</template>
