<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { SignalOverlays, SignalSource, SignalViewport } from '../core'
import SignalViewerWidget from '../vue/SignalViewerWidget.vue'
import { SyntheticSignalSource } from './synthetic-source'

interface WidgetApi {
  setSource(source: SignalSource): Promise<void>
  setOverlays(overlays: SignalOverlays): void
  resetView(): Promise<void>
}

const widget = ref<WidgetApi | null>(null)
const viewport = ref<SignalViewport | null>(null)
const selected = ref<string | null>(null)

const overlays: SignalOverlays = {
  points: Array.from({ length: 20 }, (_, index) => ({
    id: `peak-${index}`,
    x: index * 2 + 1,
    y: 20,
    kind: 'peak',
    label: `Peak ${index + 1}`,
  })),
  regions: [{ id: 'epoch-1', xStart: 4, xStop: 8, kind: 'epoch', color: 'rgba(168, 85, 247, 0.12)' }],
}

function onOverlaySelect(id: string | null): void {
  selected.value = id
}

onMounted(async () => {
  await widget.value?.setSource(new SyntheticSignalSource())
  widget.value?.setOverlays(overlays)
})
</script>

<template>
  <main>
    <header>
      <div>
        <h1>MapManager Signal Viewer</h1>
        <p>Lazy three-million-sample source with min/max overview and peak overlays.</p>
      </div>
      <button type="button" @click="widget?.resetView()">Reset view</button>
    </header>
    <SignalViewerWidget
      ref="widget"
      @view-change="viewport = $event"
      @overlay-select="onOverlaySelect"
    />
    <footer>
      <span>Viewport: {{ viewport ? `${viewport.xMin.toFixed(3)}–${viewport.xMax.toFixed(3)} s` : '—' }}</span>
      <span>Selected: {{ selected ?? 'none' }}</span>
    </footer>
  </main>
</template>

<style>
html, body, #app { height: 100%; margin: 0; }
body { background: #020617; }
main { display: grid; grid-template-rows: auto 1fr auto; height: 100%; color: #e2e8f0; font-family: Inter, system-ui, sans-serif; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; }
h1, p { margin: 0; }
p, footer { color: #94a3b8; font-size: 13px; }
button { padding: 6px 10px; color: #e2e8f0; background: #1e293b; border: 1px solid #475569; border-radius: 5px; cursor: pointer; }
.mm-signal-viewer { min-height: 0; }
</style>
