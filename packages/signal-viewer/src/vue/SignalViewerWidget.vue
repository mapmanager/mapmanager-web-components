<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import 'uplot/dist/uPlot.min.css'

import {
  InMemorySignalSource,
  SignalViewerEngine,
  cloneCursorState,
  defaultCursorState,
  fullViewport,
  isAbort,
  signalViewerThemeVariables,
  type InMemorySignalSourceOptions,
  type SignalAxisRange,
  type SignalAxisRangeSetting,
  type SignalAxisId,
  type SignalCursor,
  type SignalCursorChange,
  type SignalCursorId,
  type SignalCursorState,
  type SignalOverlays,
  type SignalScatterSeries,
  type SignalScatterSeriesUpdate,
  type SignalSeriesDescriptor,
  type SignalSource,
  type SignalTrace,
  type SignalTraceUpdate,
  type SignalViewport,
  type SignalViewerTheme,
  type SignalYAxisId,
} from '../core'
import type { SignalRenderer } from '../renderers/renderer-api'
import { UPlotSignalRenderer } from '../renderers/uplot/uplot-renderer'
import './widget.css'

const emit = defineEmits<{
  'source-change': [id: string]
  'view-change': [viewport: SignalViewport]
  'overlay-select': [id: string | null]
  'cursor-change': [change: SignalCursorChange]
}>()

const host = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const hasSource = ref(false)
const traceControls = ref<readonly SignalSeriesDescriptor[]>([])
const visibleControlIds = ref<readonly string[]>([])
const cursorControls = ref<SignalCursorState>(defaultCursorState())
const scatterControls = ref<readonly SignalScatterSeries[]>([])
const axisControls = ref<Record<SignalAxisId, boolean>>({ x: true, y: true })
const gridControls = ref<Record<SignalAxisId, boolean>>({ x: true, y: true })
const hoverControl = ref(true)
const legendControl = ref(true)
const activeTheme = ref<SignalViewerTheme>('dark')
let engine = new SignalViewerEngine()
let renderer: SignalRenderer | null = null
let inMemorySource: InMemorySignalSource | null = null
let resizeObserver: ResizeObserver | null = null
let viewportTimer: ReturnType<typeof setTimeout> | null = null
let currentViewport: SignalViewport | null = null
let width = 640
let height = 300
let overlays: SignalOverlays = { scatterSeries: [] }
let cursors = defaultCursorState()
let visibleTraceIds = new Set<string>()

/** Replace the complete session with an asynchronous range source. */
async function setSource(source: SignalSource): Promise<void> {
  inMemorySource = null
  await replaceSource(source)
}

/** Replace the complete session with aligned in-memory traces. */
async function setTraces(
  traces: readonly SignalTrace[],
  options: InMemorySignalSourceOptions = {},
): Promise<void> {
  inMemorySource = new InMemorySignalSource(traces, options)
  const visible = traces.filter((trace) => trace.visible !== false).map(({ id }) => id)
  visibleTraceIds = new Set(visible)
  await replaceSource(inMemorySource, visible)
}

/** Add one aligned in-memory trace while preserving the current viewport. */
async function addTrace(trace: SignalTrace): Promise<void> {
  requireInMemory().addTrace(trace)
  if (trace.visible !== false) visibleTraceIds.add(trace.id)
  await reloadInMemory()
}

/** Update one in-memory trace while preserving the current viewport. */
async function updateTrace(id: string, update: SignalTraceUpdate): Promise<void> {
  requireInMemory().updateTrace(id, update)
  if (update.visible === true) visibleTraceIds.add(id)
  else if (update.visible === false) visibleTraceIds.delete(id)
  await reloadInMemory()
}

/** Show or hide one source trace and reload only the visible range. */
async function setTraceVisible(id: string, visible: boolean): Promise<void> {
  const frame = await engine.setSeriesVisibility(id, visible, targetPoints())
  if (visible) visibleTraceIds.add(id)
  else visibleTraceIds.delete(id)
  visibleControlIds.value = engine.getVisibleSeries()
  renderer?.setFrame(frame, { preserveYAxisRange: true })
}

/** Return visible trace IDs in source declaration order. */
function getVisibleTraces(): readonly string[] {
  return engine.getVisibleSeries()
}

/** Replace the calibrated visible X interval. */
async function setViewport(viewport: SignalViewport): Promise<void> {
  currentViewport = viewport
  loading.value = true
  error.value = null
  try {
    const frame = await engine.setViewport(viewport, targetPoints())
    renderer?.setFrame(frame, { preserveYAxisRange: true })
    currentViewport = frame.requestedViewport
  } catch (reason) {
    if (!isAbort(reason)) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

/** Replace all sparse point and interval overlays. */
function setOverlays(next: SignalOverlays): void {
  validateScatterSeries(next.scatterSeries)
  overlays = cloneOverlays(next)
  scatterControls.value = overlays.scatterSeries
  renderer?.setOverlays(overlays)
}

/** Replace all named scatter overlays while preserving interval overlays. */
function setScatterSeries(series: readonly SignalScatterSeries[]): void {
  setOverlays({ ...overlays, scatterSeries: series })
}

/** Add one named scatter overlay with a stable ID. */
function addScatterSeries(series: SignalScatterSeries): void {
  setScatterSeries([...overlays.scatterSeries, series])
}

/** Update one named scatter overlay without changing its stable ID. */
function updateScatterSeries(id: string, update: SignalScatterSeriesUpdate): void {
  const index = overlays.scatterSeries.findIndex((series) => series.id === id)
  if (index < 0) throw new Error(`unknown scatter series id: ${id}`)
  setScatterSeries(overlays.scatterSeries.map((series, seriesIndex) =>
    seriesIndex === index ? { ...series, ...update, id } : series,
  ))
}

/** Show or hide one named scatter overlay without affecting point hit identities. */
function setScatterSeriesVisible(id: string, visible: boolean): void {
  updateScatterSeries(id, { visible })
}

/** Return visible scatter-series IDs in declaration order. */
function getVisibleScatterSeries(): readonly string[] {
  return overlays.scatterSeries.filter((series) => series.visible !== false).map(({ id }) => id)
}

/** Set one Y axis to automatic or explicit range control. */
function setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void {
  renderer?.setAxisRange(axis, range)
}

/** Return the currently rendered range for one Y axis. */
function getAxisRange(axis: SignalYAxisId): SignalAxisRange | null {
  return renderer?.getAxisRange(axis) ?? null
}

/** Show or hide X-axis or combined Y-axis chrome. */
function setAxisVisible(axis: SignalAxisId, visible: boolean): void {
  renderer?.setAxisVisible(axis, visible)
  axisControls.value = { ...axisControls.value, [axis]: visible }
}

/** Return whether X-axis or combined Y-axis chrome is visible. */
function getAxisVisible(axis: SignalAxisId): boolean {
  return axisControls.value[axis]
}

/** Show or hide vertical X or horizontal Y grid lines. */
function setGridVisible(axis: SignalAxisId, visible: boolean): void {
  renderer?.setGridVisible(axis, visible)
  gridControls.value = { ...gridControls.value, [axis]: visible }
}

/** Return whether vertical X or horizontal Y grid lines are visible. */
function getGridVisible(axis: SignalAxisId): boolean {
  return gridControls.value[axis]
}

/** Show or hide the hover crosshair and trace-position symbols. */
function setHoverVisible(visible: boolean): void {
  renderer?.setHoverVisible(visible)
  hoverControl.value = visible
}

/** Return whether the hover crosshair and trace-position symbols are visible. */
function getHoverVisible(): boolean {
  return hoverControl.value
}

/** Show or hide the uPlot trace legend. */
function setLegendVisible(visible: boolean): void {
  renderer?.setLegendVisible(visible)
  legendControl.value = visible
}

/** Return whether the trace legend is visible. */
function getLegendVisible(): boolean {
  return legendControl.value
}

/** Apply a complete centralized light or dark palette. */
function setTheme(theme: SignalViewerTheme): void {
  activeTheme.value = theme
  renderer?.setTheme(theme)
}

/** Return the active viewer palette. */
function getTheme(): SignalViewerTheme {
  return activeTheme.value
}

/** Set and show one persistent A/B/C/D cursor without emitting an event. */
function setCursor(id: SignalCursorId, value: number): void {
  if (!Number.isFinite(value)) throw new Error('cursor value must be finite')
  cursors[id] = { ...cursors[id], value, visible: true }
  cursorControls.value = cloneCursorState(cursors)
  renderer?.setCursors(cursors)
}

/** Show or hide one persistent cursor without emitting an event. */
function setCursorVisible(id: SignalCursorId, visible: boolean): void {
  if (visible && cursors[id].value == null) throw new Error(`cursor ${id} has no position`)
  cursors[id] = { ...cursors[id], visible }
  cursorControls.value = cloneCursorState(cursors)
  renderer?.setCursors(cursors)
}

/** Replace A/B/C/D cursor state without emitting an event. */
function setCursors(next: readonly SignalCursor[]): void {
  const state = defaultCursorState()
  const seen = new Set<SignalCursorId>()
  for (const cursor of next) {
    if (seen.has(cursor.id)) throw new Error(`duplicate cursor id: ${cursor.id}`)
    if (cursor.value != null && !Number.isFinite(cursor.value)) throw new Error('cursor value must be finite or null')
    if (cursor.visible && cursor.value == null) throw new Error(`visible cursor ${cursor.id} requires a position`)
    seen.add(cursor.id)
    state[cursor.id] = { ...state[cursor.id], ...cursor }
  }
  cursors = state
  cursorControls.value = cloneCursorState(cursors)
  renderer?.setCursors(cursors)
}

/** Return a defensive copy of one persistent cursor. */
function getCursor(id: SignalCursorId): SignalCursor {
  return { ...cursors[id] }
}

/** Return defensive copies of complete A/B/C/D cursor state. */
function getCursors(): SignalCursorState {
  return cloneCursorState(cursors)
}

/** Restore the complete calibrated X range. */
async function resetView(): Promise<void> {
  if (!engine.description) return
  await setViewport(fullViewport(engine.description))
  renderer?.resetYAxisRanges()
  if (currentViewport) emit('view-change', currentViewport)
}

/** Return the current calibrated X viewport. */
function getViewport(): SignalViewport | null {
  return currentViewport ? { ...currentViewport } : null
}

async function replaceSource(source: SignalSource, visible?: readonly string[]): Promise<void> {
  engine.abort()
  engine = new SignalViewerEngine()
  loading.value = true
  error.value = null
  overlays = { scatterSeries: [] }
  cursors = defaultCursorState()
  hasSource.value = false
  traceControls.value = []
  visibleControlIds.value = []
  scatterControls.value = []
  cursorControls.value = cloneCursorState(cursors)
  renderer?.setOverlays(overlays)
  renderer?.setCursors(cursors)
  try {
    const frame = await engine.setSource(source, targetPoints(), visible)
    visibleTraceIds = new Set(engine.getVisibleSeries())
    traceControls.value = frame.description.series
    visibleControlIds.value = engine.getVisibleSeries()
    renderer?.setDescription(frame.description)
    renderer?.setFrame(frame)
    currentViewport = frame.requestedViewport
    hasSource.value = true
    emit('source-change', frame.description.id)
    emit('view-change', frame.requestedViewport)
  } catch (reason) {
    if (!isAbort(reason)) {
      error.value = reason instanceof Error ? reason.message : String(reason)
      throw reason
    }
  } finally {
    loading.value = false
  }
}

async function reloadInMemory(): Promise<void> {
  const source = requireInMemory()
  const viewport = currentViewport
  const available = new Set(source.traces.map(({ id }) => id))
  const visible = [...visibleTraceIds].filter((id) => available.has(id))
  const savedOverlays = overlays
  const savedCursors = cloneCursorState(cursors)
  const frame = await engine.setSource(source, targetPoints(), visible)
  traceControls.value = frame.description.series
  visibleControlIds.value = engine.getVisibleSeries()
  renderer?.setDescription(frame.description)
  renderer?.setFrame(frame)
  if (viewport) {
    const restored = await engine.setViewport(viewport, targetPoints())
    renderer?.setFrame(restored)
    currentViewport = restored.requestedViewport
  }
  overlays = savedOverlays
  cursors = savedCursors
  renderer?.setOverlays(overlays)
  renderer?.setCursors(cursors)
}

function requireInMemory(): InMemorySignalSource {
  if (!inMemorySource) throw new Error('addTrace and updateTrace require in-memory trace mode')
  return inMemorySource
}

function targetPoints(): number { return Math.max(500, Math.floor(width * 2)) }

function requestViewport(viewport: SignalViewport): void {
  currentViewport = viewport
  emit('view-change', viewport)
  if (viewportTimer) clearTimeout(viewportTimer)
  viewportTimer = setTimeout(() => { viewportTimer = null; void setViewport(viewport) }, 80)
}

function selectOverlay(id: string | null): void {
  overlays = { ...overlays, selectedPointId: id }
  renderer?.setOverlays(overlays)
  emit('overlay-select', id)
}

function toggleScatterFromPanel(id: string, event: Event): void {
  setScatterSeriesVisible(id, eventChecked(event))
}

function toggleAxisFromPanel(axis: SignalAxisId, event: Event): void {
  setAxisVisible(axis, eventChecked(event))
}

function toggleGridFromPanel(axis: SignalAxisId, event: Event): void {
  setGridVisible(axis, eventChecked(event))
}

function toggleHoverFromPanel(event: Event): void {
  setHoverVisible(eventChecked(event))
}

function toggleLegendFromPanel(event: Event): void {
  setLegendVisible(eventChecked(event))
}

function requestTraceVisibility(id: string, visible: boolean): void {
  void setTraceVisible(id, visible).catch((reason) => {
    if (!isAbort(reason)) error.value = reason instanceof Error ? reason.message : String(reason)
  })
}

function handleCursorChange(change: SignalCursorChange): void {
  cursors = cloneCursorState(change.cursors)
  cursorControls.value = cloneCursorState(cursors)
  emit('cursor-change', change)
}

async function toggleTraceFromPanel(id: string, event: Event): Promise<void> {
  try {
    await setTraceVisible(id, eventChecked(event))
  } catch (reason) {
    if (!isAbort(reason)) error.value = reason instanceof Error ? reason.message : String(reason)
  }
}

function toggleCursorPair(first: SignalCursorId, second: SignalCursorId, event: Event): void {
  const visible = eventChecked(event)
  if (visible) initializeCursorPair(first, second)
  setCursorVisible(first, visible)
  setCursorVisible(second, visible)
}

function initializeCursorPair(first: SignalCursorId, second: SignalCursorId): void {
  if (cursors[first].value != null && cursors[second].value != null) return
  const range = first === 'a' ? currentViewport : getAxisRange('left')
  if (!range) throw new Error(`cannot initialize cursor pair ${first.toUpperCase()}/${second.toUpperCase()} without a visible range`)
  const minimum = 'xMin' in range ? range.xMin : range.min
  const maximum = 'xMax' in range ? range.xMax : range.max
  const span = maximum - minimum
  if (cursors[first].value == null) setCursor(first, minimum + span * 0.25)
  if (cursors[second].value == null) setCursor(second, minimum + span * 0.75)
}

function eventChecked(event: Event): boolean {
  if (!(event.target instanceof HTMLInputElement)) throw new Error('expected checkbox input')
  return event.target.checked
}

function pairVisible(first: SignalCursorId, second: SignalCursorId): boolean {
  return cursorControls.value[first].visible && cursorControls.value[second].visible
}

function cloneOverlays(source: SignalOverlays): SignalOverlays {
  return {
    scatterSeries: source.scatterSeries.map((series) => ({
      ...series,
      points: series.points.map((point) => ({ ...point })),
    })),
    ...(source.regions ? { regions: source.regions.map((region) => ({ ...region })) } : {}),
    ...(source.selectedPointId !== undefined ? { selectedPointId: source.selectedPointId } : {}),
  }
}

function validateScatterSeries(series: readonly SignalScatterSeries[]): void {
  const seriesIds = series.map(({ id }) => id)
  if (seriesIds.some((id) => !id) || new Set(seriesIds).size !== seriesIds.length) {
    throw new Error('scatter series ids must be non-empty and unique')
  }
  const pointIds = series.flatMap(({ points }) => points.map(({ id }) => id))
  if (pointIds.some((id) => !id) || new Set(pointIds).size !== pointIds.length) {
    throw new Error('scatter point ids must be non-empty and unique across series')
  }
}

onMounted(async () => {
  await nextTick()
  const element = host.value
  if (!element) return
  width = element.clientWidth || width
  height = element.clientHeight || height
  renderer = new UPlotSignalRenderer(element, {
    viewportChange: requestViewport,
    overlaySelect: selectOverlay,
    cursorChange: handleCursorChange,
    resetViewRequest: () => { void resetView() },
    traceVisibilityRequest: requestTraceVisibility,
  })
  renderer.setTheme(activeTheme.value)
  renderer.resize(width, height)
  renderer.setOverlays(overlays)
  renderer.setCursors(cursors)
  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry) return
    width = entry.contentRect.width
    height = entry.contentRect.height
    renderer?.resize(width, height)
  })
  resizeObserver.observe(element)
})

onBeforeUnmount(() => {
  if (viewportTimer) clearTimeout(viewportTimer)
  engine.abort()
  resizeObserver?.disconnect()
  renderer?.destroy()
})

defineExpose({
  setSource, setTraces, addTrace, updateTrace, setTraceVisible, getVisibleTraces,
  setViewport, getViewport, resetView, setOverlays,
  setScatterSeries, addScatterSeries, updateScatterSeries,
  setScatterSeriesVisible, getVisibleScatterSeries,
  setAxisRange, getAxisRange, setAxisVisible, getAxisVisible,
  setGridVisible, getGridVisible, setHoverVisible, getHoverVisible,
  setLegendVisible, getLegendVisible,
  setTheme, getTheme,
  setCursor, setCursorVisible, setCursors, getCursor, getCursors,
})
</script>

<template>
  <div
    class="mm-signal-viewer"
    :class="`mm-signal-viewer--${activeTheme}`"
    :style="signalViewerThemeVariables(activeTheme)"
  >
    <div ref="host" class="mm-signal-viewer__plot" />
    <details class="mm-signal-viewer__options">
      <summary aria-label="Viewer options" title="Viewer options">☰</summary>
      <div class="mm-signal-viewer__options-panel">
        <fieldset v-if="traceControls.length">
          <legend>Traces</legend>
          <label v-for="trace in traceControls" :key="trace.id">
            <input
              type="checkbox"
              :checked="visibleControlIds.includes(trace.id)"
              @change="toggleTraceFromPanel(trace.id, $event)"
            >
            {{ trace.label }}
          </label>
        </fieldset>
        <fieldset v-if="scatterControls.length">
          <legend>Overlays</legend>
          <label v-for="series in scatterControls" :key="series.id">
            <input
              type="checkbox"
              :checked="series.visible !== false"
              @change="toggleScatterFromPanel(series.id, $event)"
            >
            {{ series.label ?? series.id }}
          </label>
        </fieldset>
        <fieldset>
          <legend>Axes</legend>
          <label>
            <input type="checkbox" :checked="axisControls.x" @change="toggleAxisFromPanel('x', $event)">
            X axis
          </label>
          <label>
            <input type="checkbox" :checked="axisControls.y" @change="toggleAxisFromPanel('y', $event)">
            Y axes
          </label>
        </fieldset>
        <fieldset>
          <legend>Grid</legend>
          <label>
            <input type="checkbox" :checked="gridControls.x" @change="toggleGridFromPanel('x', $event)">
            X grid lines
          </label>
          <label>
            <input type="checkbox" :checked="gridControls.y" @change="toggleGridFromPanel('y', $event)">
            Y grid lines
          </label>
        </fieldset>
        <fieldset>
          <legend>Display</legend>
          <label>
            <input type="checkbox" :checked="legendControl" @change="toggleLegendFromPanel($event)">
            Trace legend
          </label>
        </fieldset>
        <fieldset>
          <legend>Pointer</legend>
          <label>
            <input type="checkbox" :checked="hoverControl" @change="toggleHoverFromPanel($event)">
            Hover cursor
          </label>
        </fieldset>
        <fieldset>
          <legend>Cursors</legend>
          <label>
            <input type="checkbox" :checked="pairVisible('a', 'b')" @change="toggleCursorPair('a', 'b', $event)">
            A/B cursors
          </label>
          <label>
            <input type="checkbox" :checked="pairVisible('c', 'd')" @change="toggleCursorPair('c', 'd', $event)">
            C/D cursors
          </label>
        </fieldset>
        <button type="button" :disabled="!hasSource" @click="resetView">Reset full view</button>
      </div>
    </details>
    <div v-if="loading" class="mm-signal-viewer__status">Loading…</div>
    <div v-if="error" class="mm-signal-viewer__error" role="alert">{{ error }}</div>
  </div>
</template>
