<script setup lang="ts">
import { onMounted, ref } from 'vue'

import {
  signalViewerThemeVariables,
  type SignalCursorChange,
  type SignalOverlays,
  type SignalSource,
  type SignalViewerTheme,
  type SignalViewport,
} from '../core'
import SignalViewerWidget from '../vue/SignalViewerWidget.vue'
import {
  SYNTHETIC_DATASETS,
  SYNTHETIC_DURATION,
  SYNTHETIC_PERIOD,
  SyntheticSignalSource,
  type SyntheticDatasetId,
} from './synthetic-source'

interface WidgetApi {
  setSource(source: SignalSource): Promise<void>
  setOverlays(overlays: SignalOverlays): void
  setCursor(id: 'a' | 'b' | 'c' | 'd', value: number): void
  resetView(): Promise<void>
  setTheme(theme: SignalViewerTheme): void
}

const widget = ref<WidgetApi | null>(null)
const viewport = ref<SignalViewport | null>(null)
const selected = ref<string | null>(null)
const cursorDelta = ref<string>('—')
const datasetId = ref<SyntheticDatasetId>('recording-a')
const theme = ref<SignalViewerTheme>('dark')

function datasetOverlays(id: SyntheticDatasetId): SignalOverlays {
  const dataset = SYNTHETIC_DATASETS.find((candidate) => candidate.id === id)
  if (!dataset) throw new Error(`unknown synthetic dataset: ${id}`)
  const count = Math.floor(SYNTHETIC_DURATION / SYNTHETIC_PERIOD)
  return {
    scatterSeries: [{
      id: 'peaks',
      label: 'Peaks',
      color: '#22d3ee',
      points: Array.from({ length: count }, (_, index) => ({
        id: `${id}-peak-${index}`,
        x: dataset.phaseSeconds + index * SYNTHETIC_PERIOD,
        y: dataset.baseline + dataset.spikeAmplitude,
        kind: 'peak',
        label: `Peak ${index + 1}`,
      })),
    }],
    regions: [{
      id: `${id}-epoch-1`, xStart: 4, xStop: 8, kind: 'epoch',
      color: 'rgba(168, 85, 247, 0.12)',
    }],
  }
}

async function loadDataset(): Promise<void> {
  selected.value = null
  cursorDelta.value = '—'
  await widget.value?.setSource(new SyntheticSignalSource(datasetId.value))
  widget.value?.setOverlays(datasetOverlays(datasetId.value))
  widget.value?.setCursor('a', 60)
  widget.value?.setCursor('b', 120)
}

function toggleTheme(event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return
  theme.value = event.target.checked ? 'dark' : 'light'
  widget.value?.setTheme(theme.value)
}

function onOverlaySelect(id: string | null): void { selected.value = id }

onMounted(loadDataset)
</script>

<template>
  <main :class="`demo-theme-${theme}`" :style="signalViewerThemeVariables(theme)">
    <header>
      <div>
        <h1>MapManager Signal Viewer</h1>
        <p>Lazy three-million-sample recordings with min/max overview and named peak overlays.</p>
      </div>
      <div class="demo-controls">
        <label class="theme-switch">
          <input type="checkbox" :checked="theme === 'dark'" @change="toggleTheme">
          Dark theme
        </label>
        <label>
          Dataset
          <select v-model="datasetId" @change="loadDataset">
            <option v-for="dataset in SYNTHETIC_DATASETS" :key="dataset.id" :value="dataset.id">
              {{ dataset.label }}
            </option>
          </select>
        </label>
        <button type="button" @click="widget?.resetView()">Reset view</button>
      </div>
    </header>
    <SignalViewerWidget
      ref="widget"
      @view-change="viewport = $event"
      @overlay-select="onOverlaySelect"
      @cursor-change="cursorDelta = ($event as SignalCursorChange).deltaX?.toFixed(3) ?? '—'"
    />
    <footer>
      <span>Viewport: {{ viewport ? `${viewport.xMin.toFixed(3)}–${viewport.xMax.toFixed(3)} s` : '—' }}</span>
      <span>Selected: {{ selected ?? 'none' }}</span>
      <span>B − A: {{ cursorDelta }} s</span>
    </footer>
  </main>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
body { background: #020617; }
main { display: grid; grid-template-rows: auto 1fr auto; height: 100%; color: var(--sv-text); background: var(--sv-background); font-family: Inter, system-ui, sans-serif; }
header, footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; }
h1, p { margin: 0; }
p, footer { color: var(--sv-muted); font-size: 13px; }
.demo-controls, .demo-controls label { display: flex; align-items: center; gap: 8px; }
button, select { padding: 6px 10px; color: var(--sv-text); background: var(--sv-input); border: 1px solid var(--sv-border); border-radius: 5px; }
button { cursor: pointer; }
.mm-signal-viewer { min-height: 0; }
</style>
