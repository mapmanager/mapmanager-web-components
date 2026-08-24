<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { CHANNEL_LUTS, type LutName } from '../engine/channel-luts'
import { paneSlots, type ViewerLayout } from '../engine/layout-panes'
import { displayToSource } from '../engine/orientation'
import type { ImageSource, PlaneSelection, Roi, ViewWindow, XyOverlay } from '../engine/types'
import {
  defaultLineDisplay,
  defaultRectDisplay,
  homeZoom,
  visibleDisplayRect,
  type OrthographicViewState,
} from '../engine/view-fit'
import { ImageViewerEngine, type LoadedImage } from '../engine/viewer-engine'
import ImagePane from './ImagePane.vue'
import './widget.css'

export type DoubleClickBehavior = 'home' | 'deck'

interface PaneApi {
  clientSize: () => { width: number; height: number }
}

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

const status = ref('No image')
const errorMessage = ref<string | null>(null)
const selection = ref<PlaneSelection>({ t: 0, c: 0, z: 0 })
const sourceId = ref<string | null>(null)
const channelCount = ref(1)
const zCount = ref(1)
const tCount = ref(1)
const layout = ref<ViewerLayout>('single')
const selectedRoiId = ref<string | null>(null)
const overlayRevision = ref(0)
const loaded = ref<LoadedImage | null>(null)
const camera = ref<OrthographicViewState>({
  target: [0, 0, 0],
  zoom: 0,
  minZoom: -10,
  maxZoom: 8,
})
const panesHost = ref<HTMLDivElement | null>(null)
const paneRefs = ref<PaneApi[]>([])
const engine = new ImageViewerEngine()
let loadController: AbortController | null = null
let viewIsHome = true
let resizeObserver: ResizeObserver | null = null
let lastPanesWidth = 0
let lastPanesHeight = 0

const slots = computed(() =>
  paneSlots(layout.value, channelCount.value, selection.value.c),
)

function emitView(): void {
  const window = engine.viewWindow()
  if (window) emit('view-change', window)
}

function bumpOverlay(): void {
  overlayRevision.value += 1
}

function bindPane(index: number, el: unknown): void {
  if (!el) return
  paneRefs.value[index] = el as PaneApi
}

function firstPaneSize(): { width: number; height: number } {
  return paneRefs.value[0]?.clientSize() ?? { width: 1, height: 1 }
}

function goHome(): void {
  const image = loaded.value
  if (!image) return
  const pane = firstPaneSize()
  camera.value = {
    target: [Math.max(image.width, 1) / 2, Math.max(image.height, 1) / 2, 0],
    zoom: homeZoom(pane.width, pane.height, image.width, image.height),
    minZoom: -10,
    maxZoom: 8,
  }
  viewIsHome = true
  emitView()
}

function onCameraChange(next: OrthographicViewState): void {
  viewIsHome = false
  camera.value = next
  emitView()
}

function formatStatus(image: LoadedImage): string {
  return [
    image.kind,
    `display ${image.width}×${image.height}`,
    `source ${image.sourceHeight}×${image.sourceWidth}`,
    `C${image.channelCount}`,
    `Z${image.zCount}`,
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
    const next = await engine.setSource(source, controller.signal)
    if (controller.signal.aborted) return null
    loaded.value = next
    selection.value = { ...next.selection }
    sourceId.value = next.sourceId
    channelCount.value = next.channelCount
    zCount.value = next.zCount
    tCount.value = next.tCount
    selectedRoiId.value = engine.selectedRoiId
    engine.layout = layout.value
    bumpOverlay()
    await nextTick()
    goHome()
    status.value = formatStatus(next)
    emit('source-change', next.sourceId)
    emitView()
    return {
      id: next.sourceId,
      kind: next.kind,
      width: next.width,
      height: next.height,
      sourceWidth: next.sourceWidth,
      sourceHeight: next.sourceHeight,
      channelCount: next.channelCount,
      zCount: next.zCount,
      tCount: next.tCount,
    }
  } catch (reason) {
    if (controller.signal.aborted) return null
    errorMessage.value = reason instanceof Error ? reason.message : String(reason)
    status.value = 'Failed'
    loaded.value = null
    return null
  }
}

function setRois(rois: readonly Roi[]): void {
  engine.setRois(rois)
  selectedRoiId.value = engine.selectedRoiId
  bumpOverlay()
}

function setXyOverlays(overlays: readonly XyOverlay[]): void {
  engine.setXyOverlays(overlays)
  bumpOverlay()
}

async function onSelection(): Promise<void> {
  if (!engine.loaded) return
  engine.setSelection(selection.value)
  selection.value = { ...engine.loaded.selection }
  loaded.value = engine.loaded
  await engine.refreshPlaneContrast()
  bumpOverlay()
}

function onLayout(): void {
  engine.layout = layout.value
  void nextTick().then(() => {
    if (viewIsHome) goHome()
  })
}

function onLut(channel: number, name: LutName): void {
  engine.setChannelColor(channel, CHANNEL_LUTS[name])
  bumpOverlay()
}

function onContrast(channel: number, which: 0 | 1, value: number): void {
  const current = engine.channelContrast[channel] ?? engine.loaded?.contrast ?? [0, 1]
  const next: [number, number] = which === 0 ? [value, current[1]] : [current[0], value]
  engine.setChannelContrast(channel, next)
  bumpOverlay()
}

function addDefaultRoi(kind: 'rect' | 'line'): void {
  const image = loaded.value
  if (!image) return
  const pane = firstPaneSize()
  const view = visibleDisplayRect(pane.width, pane.height, camera.value.target, camera.value.zoom)
  const display =
    kind === 'rect'
      ? defaultRectDisplay(view, image.width, image.height)
      : defaultLineDisplay(view, image.width, image.height)
  const a = displayToSource(display.x0, display.y0)
  const b = displayToSource(display.x1, display.y1)
  engine.addRoi({
    id: engine.nextRoiId(),
    kind,
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  })
  selectedRoiId.value = engine.selectedRoiId
  bumpOverlay()
}

function onSelectRoi(id: string | null): void {
  engine.selectRoi(id)
  selectedRoiId.value = engine.selectedRoiId
  bumpOverlay()
}

function deleteSelectedRoi(): void {
  if (!engine.selectedRoiId) return
  engine.removeRoi(engine.selectedRoiId)
  selectedRoiId.value = engine.selectedRoiId
  bumpOverlay()
}

onMounted(() => {
  const el = panesHost.value
  if (!el) return
  lastPanesWidth = el.clientWidth
  lastPanesHeight = el.clientHeight
  resizeObserver = new ResizeObserver(() => {
    const width = el.clientWidth
    const height = el.clientHeight
    if (width === lastPanesWidth && height === lastPanesHeight) return
    lastPanesWidth = width
    lastPanesHeight = height
    if (loaded.value && viewIsHome) goHome()
  })
  resizeObserver.observe(el)
})

watch(slots, (next) => {
  paneRefs.value = paneRefs.value.slice(0, next.length)
})

onBeforeUnmount(() => {
  loadController?.abort()
  resizeObserver?.disconnect()
  resizeObserver = null
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
      <button type="button" @click="addDefaultRoi('rect')">Add rect</button>
      <button type="button" @click="addDefaultRoi('line')">Add line</button>
      <button type="button" :disabled="!selectedRoiId" @click="deleteSelectedRoi">Delete ROI</button>
    </div>
    <input
      class="mm-image-viewer-copy"
      type="text"
      readonly
      :value="errorMessage ?? status"
      @focus="selectCopyText"
    />
    <div ref="panesHost" class="mm-image-viewer-panes" :data-layout="layout">
      <ImagePane
        v-for="(slot, index) in slots"
        :key="slot.id"
        :ref="(el) => bindPane(index, el)"
        :loaded="loaded"
        :channels="slot.channels"
        :channel-colors="engine.channelColors"
        :channel-contrast="engine.channelContrast"
        :rois="engine.rois"
        :selected-roi-id="selectedRoiId"
        :xy-overlays="engine.xyOverlays"
        :camera="camera"
        :double-click-behavior="doubleClickBehavior"
        :overlay-revision="overlayRevision"
        @camera-change="onCameraChange"
        @home="goHome"
        @select-roi="onSelectRoi"
        @lut="onLut"
        @contrast="onContrast"
      />
      <p v-if="errorMessage" class="mm-image-viewer-status error">{{ errorMessage }}</p>
      <p v-else class="mm-image-viewer-status">{{ status }}</p>
    </div>
  </section>
</template>
