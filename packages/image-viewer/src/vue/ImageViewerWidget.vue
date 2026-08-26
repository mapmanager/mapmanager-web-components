<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { CHANNEL_LUTS, type LutName } from '../engine/channel-luts'
import { paneSlots, type ViewerLayout } from '../engine/layout-panes'
import { displayToSource } from '../engine/orientation'
import type { Histogram } from '../engine/contrast-range'
import type { PlaneSelection, Roi, ViewerSource, ViewWindow, XyOverlay } from '../engine/types'
import {
  defaultLineDisplay,
  defaultRectDisplay,
  homeZoom,
  visibleDisplayRect,
  type OrthographicViewState,
} from '../engine/view-fit'
import { ImageViewerEngine, type LoadedImage } from '../engine/viewer-engine'
import ContrastPopover from './ContrastPopover.vue'
import ImagePane from './ImagePane.vue'
import LucideIcon from './LucideIcon.vue'
import './widget.css'

export type DoubleClickBehavior = 'home' | 'deck'

interface PaneApi {
  clientSize: () => { width: number; height: number }
}

const props = withDefaults(
  defineProps<{
    doubleClickBehavior?: DoubleClickBehavior
    /** Enable ROI overlays and interactive ROI controls. */
    roiToolsEnabled?: boolean
  }>(),
  { doubleClickBehavior: 'home', roiToolsEnabled: true },
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
const axesVisible = ref(true)
const roisVisible = ref(true)
const channelToolbarsVisible = ref(true)
const roiToolbarVisible = ref(true)
const optionsOpen = ref(false)
const optionsMenu = ref<HTMLDivElement | null>(null)
const selectedRoiId = ref<string | null>(null)
const overlayRevision = ref(0)
const pixelRevision = ref(0)
const planeRevision = ref(0)
const loaded = ref<LoadedImage | null>(null)
const camera = ref<OrthographicViewState>({
  target: [0, 0, 0],
  zoom: 0,
  minZoom: -10,
  maxZoom: 8,
})
const panesHost = ref<HTMLDivElement | null>(null)
const paneRefs = ref<PaneApi[]>([])
let engine = new ImageViewerEngine()
const rangeOpen = ref(false)
const rangeChannel = ref<number | null>(null)
const rangeAnchor = ref<HTMLElement | null>(null)
const rangeHistogram = ref<Histogram | null>(null)
const rangeLog = ref(true)
const rangeMin = ref(0)
const rangeMax = ref(1)
const switchingSource = ref(false)
const LAYOUT_MODES = [
  { value: 'side' as const, label: 'Side by side', icon: 'columns-2' as const },
  { value: 'stack' as const, label: 'Stacked', icon: 'rows-2' as const },
  { value: 'single' as const, label: 'One channel', icon: 'square' as const },
  { value: 'composite' as const, label: 'Composite', icon: 'layers-3' as const },
]
let loadController: AbortController | null = null
let selectionRevision = 0
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

function bumpPixels(): void {
  pixelRevision.value += 1
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

async function setSource(
  source: ViewerSource,
  options: { xyOverlays?: readonly XyOverlay[] } = {},
): Promise<SourceInfo | null> {
  selectionRevision += 1
  loadController?.abort()
  const controller = new AbortController()
  loadController = controller
  switchingSource.value = true
  errorMessage.value = null
  try {
    const candidate = new ImageViewerEngine()
    candidate.layout = layout.value
    candidate.axesVisible = axesVisible.value
    const next = await candidate.setSource(source, controller.signal)
    if (controller.signal.aborted) return null
    candidate.setXyOverlays(options.xyOverlays ?? [])
    const pane = firstPaneSize()
    const nextCamera: OrthographicViewState = {
      target: [Math.max(next.width, 1) / 2, Math.max(next.height, 1) / 2, 0],
      zoom: homeZoom(pane.width, pane.height, next.width, next.height),
      minZoom: -10,
      maxZoom: 8,
    }

    // Publish one complete frame. The pane must never see new loaders with
    // the previous source's camera, channels, or overlays.
    engine = candidate
    camera.value = nextCamera
    selection.value = { ...next.selection }
    sourceId.value = next.sourceId
    channelCount.value = next.channelCount
    zCount.value = next.zCount
    tCount.value = next.tCount
    selectedRoiId.value = engine.selectedRoiId
    loaded.value = next
    bumpOverlay()
    rangeOpen.value = false
    viewIsHome = true
    status.value = formatStatus(next)
    switchingSource.value = false
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
    return null
  } finally {
    if (loadController === controller) switchingSource.value = false
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

async function onSelection(axis: keyof PlaneSelection, event: Event): Promise<void> {
  if (!engine.loaded) return
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const value = Number(input.value)
  if (!Number.isInteger(value)) return
  const revision = selectionRevision + 1
  selectionRevision = revision
  const requested = { ...selection.value, [axis]: value }
  const prepared = await engine.prepareSelection(requested)
  if (revision !== selectionRevision) return
  const next = engine.commitSelection(prepared)
  selection.value = { ...next.selection }
  loaded.value = next
  planeRevision.value += 1
}

function onLayout(): void {
  engine.layout = layout.value
  void nextTick().then(() => {
    if (viewIsHome) goHome()
  })
}

function onLut(channel: number, name: LutName): void {
  engine.setChannelColor(channel, CHANNEL_LUTS[name])
  bumpPixels()
}

function syncRangeFields(): void {
  if (rangeChannel.value == null) return
  const current = engine.channelContrast[rangeChannel.value] ?? engine.loaded?.contrast ?? [0, 1]
  rangeMin.value = current[0] ?? 0
  rangeMax.value = current[1] ?? 1
}

async function onContrastPanel(channel: number, button: HTMLElement): Promise<void> {
  if (rangeOpen.value && rangeChannel.value === channel) {
    rangeOpen.value = false
    return
  }
  rangeChannel.value = channel
  rangeAnchor.value = button
  rangeHistogram.value = await engine.channelHistogram(channel)
  syncRangeFields()
  rangeOpen.value = true
}

function onContrastRange(min: number, max: number): void {
  if (rangeChannel.value == null) return
  engine.setChannelContrast(rangeChannel.value, [min, max])
  syncRangeFields()
  bumpPixels()
}

async function onContrastAuto(): Promise<void> {
  if (rangeChannel.value == null) return
  await engine.autoChannelContrast(rangeChannel.value)
  syncRangeFields()
  bumpPixels()
}

function onAxesToggle(): void {
  engine.axesVisible = axesVisible.value
  void nextTick().then(() => {
    if (viewIsHome) goHome()
  })
}

function closeOptionsMenu(): void {
  optionsOpen.value = false
}

function onResetView(): void {
  goHome()
  closeOptionsMenu()
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!optionsOpen.value) return
  const menu = optionsMenu.value
  if (event.target instanceof Node && menu?.contains(event.target)) return
  optionsOpen.value = false
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && optionsOpen.value) {
    optionsOpen.value = false
  }
}

function setLayout(next: ViewerLayout): void {
  layout.value = next
  onLayout()
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
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeyDown)
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

watch(channelToolbarsVisible, () => {
  void nextTick().then(() => {
    if (viewIsHome) goHome()
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeyDown)
  loadController?.abort()
  resizeObserver?.disconnect()
  resizeObserver = null
})

defineExpose({
  setSource,
  setRois,
  setXyOverlays,
  get engine() {
    return engine
  },
})
</script>

<template>
  <section
    class="mm-image-viewer"
    :class="{ 'is-switching-source': switchingSource }"
    :aria-busy="switchingSource"
  >
    <div class="mm-image-viewer-toolbar">
      <div ref="optionsMenu" class="mm-options-menu">
        <button
          type="button"
          class="mm-options-button"
          aria-label="Viewer options"
          title="Viewer options"
          :aria-expanded="optionsOpen"
          @click="optionsOpen = !optionsOpen"
        >
          <LucideIcon name="menu" label="Viewer options" />
        </button>
        <div v-show="optionsOpen" class="mm-options-panel">
          <label class="mm-radio">
            <input v-model="axesVisible" type="checkbox" aria-label="Axes" @change="onAxesToggle" />
            Axes
          </label>
          <label v-if="roiToolsEnabled" class="mm-radio">
            <input v-model="roisVisible" type="checkbox" aria-label="ROIs" />
            ROIs
          </label>
          <label class="mm-radio">
            <input v-model="channelToolbarsVisible" type="checkbox" aria-label="Channel Toolbars" />
            Channel Toolbars
          </label>
          <label v-if="roiToolsEnabled" class="mm-radio">
            <input v-model="roiToolbarVisible" type="checkbox" aria-label="ROI Toolbar" />
            ROI Toolbar
          </label>
          <button type="button" class="mm-menu-action" aria-label="Reset view" @click="onResetView">
            <LucideIcon name="maximize-2" label="Reset view" />
            Reset view
          </button>
        </div>
      </div>
      <span>{{ sourceId ?? 'idle' }}</span>
      <div
        v-if="channelCount > 1"
        class="mm-layout-controls"
        role="radiogroup"
        aria-label="Channel layout"
      >
        <label
          v-for="mode in LAYOUT_MODES"
          :key="mode.value"
          class="mm-icon-radio"
          :title="mode.label"
        >
          <input
            type="radio"
            name="mm-layout"
            :value="mode.value"
            :checked="layout === mode.value"
            :aria-label="mode.label"
            @change="setLayout(mode.value)"
          />
          <LucideIcon :name="mode.icon" :label="mode.label" />
        </label>
      </div>
      <label v-if="channelCount > 1 && layout === 'single'">
        C
        <input
          :value="selection.c"
          type="range"
          min="0"
          :max="channelCount - 1"
          @input="onSelection('c', $event)"
        />
        {{ selection.c }}
      </label>
      <button v-if="roiToolsEnabled && roiToolbarVisible" type="button" @click="addDefaultRoi('rect')">
        Add rect
      </button>
      <button v-if="roiToolsEnabled && roiToolbarVisible" type="button" @click="addDefaultRoi('line')">
        Add line
      </button>
      <button
        v-if="roiToolsEnabled && roiToolbarVisible"
        type="button"
        :disabled="!selectedRoiId"
        @click="deleteSelectedRoi"
      >
        Delete ROI
      </button>
    </div>
    <input
      class="mm-image-viewer-copy"
      type="text"
      readonly
      :value="errorMessage ?? status"
      @focus="selectCopyText"
    />
    <div class="mm-image-viewer-stage-row">
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
          :pixel-revision="pixelRevision"
          :plane-revision="planeRevision"
          :axes-visible="axesVisible"
          :rois-visible="roiToolsEnabled && roisVisible"
          :channel-toolbars-visible="channelToolbarsVisible"
          @camera-change="onCameraChange"
          @home="goHome"
          @select-roi="onSelectRoi"
          @lut="onLut"
          @contrast-panel="onContrastPanel"
        />
        <p v-if="errorMessage" class="mm-image-viewer-status error">{{ errorMessage }}</p>
        <p v-else class="mm-image-viewer-status">{{ status }}</p>
      </div>
      <label v-if="tCount > 1" class="mm-slice-control">
        T
        <input
          :value="selection.t"
          type="range"
          min="0"
          :max="tCount - 1"
          step="1"
          aria-label="T plane"
          @input="onSelection('t', $event)"
        />
        {{ selection.t }}
      </label>
      <label v-if="zCount > 1" class="mm-slice-control">
        Z
        <input
          :value="selection.z"
          type="range"
          min="0"
          :max="zCount - 1"
          step="1"
          aria-label="Z plane"
          @input="onSelection('z', $event)"
        />
        {{ selection.z }}
      </label>
    </div>
    <ContrastPopover
      :open="rangeOpen"
      :channel="rangeChannel"
      :histogram="rangeHistogram"
      :min="rangeMin"
      :max="rangeMax"
      :color="rangeChannel == null ? CHANNEL_LUTS.green : (engine.channelColors[rangeChannel] ?? CHANNEL_LUTS.green)"
      :log-scale="rangeLog"
      :anchor="rangeAnchor"
      @close="rangeOpen = false"
      @range="onContrastRange"
      @auto="onContrastAuto"
      @log="rangeLog = $event"
    />
  </section>
</template>
