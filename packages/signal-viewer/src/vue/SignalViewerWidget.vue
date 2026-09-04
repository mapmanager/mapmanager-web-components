<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import 'uplot/dist/uPlot.min.css'

import {
  SignalViewerEngine,
  fullViewport,
  isAbort,
  type SignalOverlays,
  type SignalSource,
  type SignalViewport,
} from '../core'
import { UPlotSignalRenderer } from '../renderers/uplot/uplot-renderer'
import type { SignalRenderer } from '../renderers/renderer-api'
import './widget.css'

const emit = defineEmits<{
  'source-change': [id: string]
  'view-change': [viewport: SignalViewport]
  'overlay-select': [id: string | null]
}>()

const host = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
let engine = new SignalViewerEngine()
let renderer: SignalRenderer | null = null
let resizeObserver: ResizeObserver | null = null
let viewportTimer: ReturnType<typeof setTimeout> | null = null
let currentViewport: SignalViewport | null = null
let width = 640
let height = 300
let overlays: SignalOverlays = { points: [] }

async function setSource(source: SignalSource): Promise<void> {
  engine.abort()
  engine = new SignalViewerEngine()
  loading.value = true
  error.value = null
  try {
    const frame = await engine.setSource(source, targetPoints())
    renderer?.setDescription(frame.description)
    renderer?.setOverlays(overlays)
    renderer?.setFrame(frame)
    currentViewport = frame.requestedViewport
    emit('source-change', frame.description.id)
    emit('view-change', frame.requestedViewport)
  } catch (reason) {
    if (!isAbort(reason)) error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    loading.value = false
  }
}

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

function setOverlays(next: SignalOverlays): void {
  overlays = next
  renderer?.setOverlays(next)
}

async function resetView(): Promise<void> {
  if (!engine.description) return
  await setViewport(fullViewport(engine.description))
  if (currentViewport) emit('view-change', currentViewport)
}

function getViewport(): SignalViewport | null {
  return currentViewport ? { ...currentViewport } : null
}

function targetPoints(): number {
  return Math.max(500, Math.floor(width * 2))
}

function requestViewport(viewport: SignalViewport): void {
  currentViewport = viewport
  emit('view-change', viewport)
  if (viewportTimer) clearTimeout(viewportTimer)
  viewportTimer = setTimeout(() => {
    viewportTimer = null
    void setViewport(viewport)
  }, 80)
}

function selectOverlay(id: string | null): void {
  overlays = { ...overlays, selectedPointId: id }
  renderer?.setOverlays(overlays)
  emit('overlay-select', id)
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
  })
  renderer.resize(width, height)
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

defineExpose({ setSource, setViewport, setOverlays, resetView, getViewport })
</script>

<template>
  <div class="mm-signal-viewer">
    <div ref="host" class="mm-signal-viewer__plot" />
    <div v-if="loading" class="mm-signal-viewer__status">Loading…</div>
    <div v-if="error" class="mm-signal-viewer__error" role="alert">{{ error }}</div>
  </div>
</template>
