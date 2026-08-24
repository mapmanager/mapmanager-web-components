<script setup lang="ts">
import { Deck, OrthographicView } from '@deck.gl/core'
import { PathLayer, PolygonLayer } from '@deck.gl/layers'
import { ColorPaletteExtension } from '@vivjs/extensions'
import { MultiscaleImageLayer } from '@vivjs/layers'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import type { LoadedImage } from '../engine/viewer-engine'
import { ImageViewerEngine } from '../engine/viewer-engine'
import { DISPLAY_ORIENTATION, sourceToDisplay } from '../engine/orientation'
import type { ImageSource, PlaneSelection, Roi, ViewWindow, XyOverlay } from '../engine/types'
import { homeZoom, type HomeZoom } from '../engine/view-fit'
import { vivSelection } from '../engine/viv-selection'
import './widget.css'

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
const layout = ref<'side' | 'stack' | 'single' | 'composite'>('single')

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

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message)
  return value
}

const CHANNEL_COLORS: [number, number, number][] = [
  [0, 220, 80],
  [255, 0, 220],
  [80, 160, 255],
  [255, 180, 0],
]

function channelIndexes(loaded: LoadedImage): number[] {
  if (layout.value === 'composite') {
    return Array.from({ length: loaded.channelCount }, (_, channel) => channel)
  }
  return [loaded.selection.c]
}

function pixelLayers(): unknown[] {
  const loaded = engine.loaded
  if (!loaded) return []
  const channels = channelIndexes(loaded)
  return [
    new MultiscaleImageLayer({
      id: `pixels-${loaded.generation}-${layout.value}-${channels.join('.')}-${loaded.selection.z}`,
      loader: loaded.loaders as never,
      selections: channels.map((channel) =>
        vivSelection(loaded.labels, { ...loaded.selection, c: channel }),
      ),
      contrastLimits: channels.map(() => loaded.contrast),
      channelsVisible: channels.map(() => true),
      colors: channels.map((channel) => CHANNEL_COLORS[channel] ?? CHANNEL_COLORS[0]),
      dtype: loaded.dtype as 'Uint16',
      extensions: [new ColorPaletteExtension()],
    } as never),
  ]
}

function overlayLayers(): unknown[] {
  const polygons = engine.rois
    .filter((roi) => roi.kind === 'rect')
    .map((roi) => {
      const a = sourceToDisplay(roi.x0, roi.y0)
      const b = sourceToDisplay(roi.x1, roi.y0)
      const c = sourceToDisplay(roi.x1, roi.y1)
      const d = sourceToDisplay(roi.x0, roi.y1)
      return {
        id: roi.id,
        polygon: [
          [a.x, a.y],
          [b.x, b.y],
          [c.x, c.y],
          [d.x, d.y],
        ],
      }
    })
  const lines = [
    ...engine.rois
      .filter((roi) => roi.kind === 'line')
      .map((roi) => {
        const a = sourceToDisplay(roi.x0, roi.y0)
        const b = sourceToDisplay(roi.x1, roi.y1)
        return {
          id: roi.id,
          path: [
            [a.x, a.y],
            [b.x, b.y],
          ],
          color: [34, 211, 238],
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
  return [
    new PolygonLayer({
      id: 'rois-rect',
      data: polygons,
      getPolygon: (d: { polygon: number[][] }) => d.polygon as [number, number][],
      getLineColor: [251, 146, 60] as [number, number, number],
      getFillColor: [251, 146, 60, 40] as [number, number, number, number],
      lineWidthMinPixels: 2,
      pickable: false,
    }),
    new PathLayer({
      id: 'rois-xy',
      data: lines,
      getPath: (d: { path: number[][] }) => d.path as [number, number][],
      getColor: (d: { color: number[] }) => d.color as [number, number, number],
      widthMinPixels: 2,
      pickable: false,
    }),
  ]
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

function fit(width: number, height: number): void {
  const el = host.value
  if (!el) return
  const imageW = Math.max(width, 1)
  const imageH = Math.max(height, 1)
  const zoom = homeZoom(el.clientWidth, el.clientHeight, imageW, imageH)
  viewState = {
    target: [imageW / 2, imageH / 2, 0],
    zoom,
    minZoom: -10,
    maxZoom: 8,
  }
  deck.value?.setProps({ initialViewState: { ortho: viewState }, viewState: { ortho: viewState } })
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
    engine.layout = layout.value
    await nextTick()
    fit(loaded.width, loaded.height)
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
  draw()
}

onMounted(() => {
  const canvasHost = requireValue(host.value, 'image host is not mounted')
  const instance = new Deck<OrthographicView[]>({
    parent: canvasHost,
    views: [new OrthographicView({ id: 'ortho', flipY: DISPLAY_ORIENTATION.flipY, controller: true })],
    controller: true,
    useDevicePixels: true,
    layers: [],
    onViewStateChange: ({ viewState: next }) => {
      const incoming = next as OrthographicViewState
      // Temporary: OrthographicController may emit a scalar zoom. Keep the
      // anisotropic ratio by applying the same delta to both axes.
      if (Array.isArray(viewState.zoom) && typeof incoming.zoom === 'number') {
        const delta = incoming.zoom - viewState.zoom[0]
        incoming.zoom = [viewState.zoom[0] + delta, viewState.zoom[1] + delta]
      }
      viewState = incoming
      instance.setProps({ viewState: { ortho: viewState } })
      emitView()
    },
  })
  deck.value = instance
  resizeObserver = new ResizeObserver(() => {
    instance.setProps({ width: canvasHost.clientWidth, height: canvasHost.clientHeight })
    if (engine.loaded) fit(engine.loaded.width, engine.loaded.height)
  })
  resizeObserver.observe(canvasHost)
})

onBeforeUnmount(() => {
  loadController?.abort()
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
      <label v-if="channelCount > 1">
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
    </div>
    <input
      class="mm-image-viewer-copy"
      type="text"
      readonly
      :value="errorMessage ?? status"
      @focus="selectCopyText"
    />
    <div ref="host" class="mm-image-viewer-stage">
      <p v-if="errorMessage" class="mm-image-viewer-status error">{{ errorMessage }}</p>
      <p v-else class="mm-image-viewer-status">{{ status }}</p>
    </div>
  </section>
</template>
