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
  type InMemorySignalSourceOptions,
  type SignalAxisRange,
  type SignalAxisRangeSetting,
  type SignalCursor,
  type SignalCursorChange,
  type SignalCursorId,
  type SignalCursorState,
  type SignalOverlays,
  type SignalSeriesDescriptor,
  type SignalSource,
  type SignalTrace,
  type SignalTraceUpdate,
  type SignalViewport,
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
let engine = new SignalViewerEngine()
let renderer: SignalRenderer | null = null
let inMemorySource: InMemorySignalSource | null = null
let resizeObserver: ResizeObserver | null = null
let viewportTimer: ReturnType<typeof setTimeout> | null = null
let currentViewport: SignalViewport | null = null
let width = 640
let height = 300
let overlays: SignalOverlays = { points: [] }
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
  renderer?.setFrame(frame)
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
    renderer?.setFrame(frame)
    currentViewport = frame.requestedViewport
  } catch (reason) {
    if (!isAbort(reason)) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

/** Replace all sparse point and interval overlays. */
function setOverlays(next: SignalOverlays): void {
  overlays = next
  renderer?.setOverlays(next)
}

/** Set one Y axis to automatic or explicit range control. */
function setAxisRange(axis: SignalYAxisId, range: SignalAxisRangeSetting): void {
  renderer?.setAxisRange(axis, range)
}

/** Return the currently rendered range for one Y axis. */
function getAxisRange(axis: SignalYAxisId): SignalAxisRange | null {
  return renderer?.getAxisRange(axis) ?? null
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
  overlays = { points: [] }
  cursors = defaultCursorState()
  hasSource.value = false
  traceControls.value = []
  visibleControlIds.value = []
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
  })
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
  setViewport, getViewport, resetView, setOverlays, setAxisRange, getAxisRange,
  setCursor, setCursorVisible, setCursors, getCursor, getCursors,
})
</script>

<template>
  <div class="mm-signal-viewer">
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
