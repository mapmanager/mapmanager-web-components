<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { syntheticPlaneSource } from '../engine/synthetic'
import { BrowserDirectoryStore, pickOmeZarrDirectory } from '../engine/browser-directory-store'
import type { ImageSource, XyOverlay } from '../engine/types'
import ImageViewerWidget from '../vue/ImageViewerWidget.vue'

type PresetKind = 'YX' | 'CYX' | 'ZCYX' | 'kymo' | 'reference'
type DemoKind = PresetKind | 'local'

interface WidgetApi {
  setSource: (source: ImageSource, options?: { xyOverlays?: readonly XyOverlay[] }) => Promise<{
    width: number
    height: number
    sourceWidth: number
    sourceHeight: number
  } | null>
  setXyOverlays: (overlays: readonly XyOverlay[]) => void
}

const widget = ref<WidgetApi | null>(null)
const demo = ref<DemoKind>('YX')
const localError = ref<string | null>(null)

const R2_COLLECTION = 'https://data.mapmanager.net/samples/velocity-sample-data.ome.zarr/'
const kymoUrl = `${R2_COLLECTION}acq_images/acq_image_000/`
const referenceUrl = `${R2_COLLECTION}acq_images/acq_image_000/reference/`

function sourceFor(kind: PresetKind): ImageSource {
  if (kind === 'kymo') {
    return { kind: 'ome-zarr', id: 'r2-velocity-kymo', url: kymoUrl }
  }
  if (kind === 'reference') {
    return { kind: 'ome-zarr', id: 'r2-velocity-reference', url: referenceUrl }
  }
  return syntheticPlaneSource(kind)
}

/**
 * Constant source-X, varying source-Y. After transpose that is a horizontal
 * line in display (display x = source y, display y = source x).
 */
function demoScanOverlay(sourceWidth: number, sourceHeight: number): XyOverlay {
  const column = Math.floor(sourceWidth / 2)
  const x: number[] = []
  const y: number[] = []
  const step = Math.max(1, Math.floor(sourceHeight / 80))
  for (let row = 0; row < sourceHeight; row += step) {
    x.push(column)
    y.push(row)
  }
  const last = sourceHeight - 1
  if (y[y.length - 1] !== last) {
    x.push(column)
    y.push(last)
  }
  return { id: 'demo-scan', x, y }
}

async function load(kind: PresetKind): Promise<void> {
  demo.value = kind
  const api = widget.value
  if (!api) return
  const source = sourceFor(kind)
  const xyOverlays =
    source.kind === 'plane'
      ? [demoScanOverlay(source.shape.at(-1) ?? 1, source.shape.at(-2) ?? 1)]
      : []
  await api.setSource(source, { xyOverlays })
}

async function openLocalOmeZarr(): Promise<void> {
  localError.value = null
  try {
    const directory = await pickOmeZarrDirectory()
    demo.value = 'local'
    await widget.value?.setSource(
      {
        kind: 'ome-zarr',
        id: directory.name,
        store: new BrowserDirectoryStore(directory),
      },
      { xyOverlays: [] },
    )
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === 'AbortError') return
    localError.value = reason instanceof Error ? reason.message : String(reason)
  }
}

onMounted(() => {
  void load('YX')
})
</script>

<template>
  <div class="demo-page">
    <header>
      <div>
        <h1>MapManager Image Viewer</h1>
      </div>
      <nav>
        <button type="button" :class="{ active: demo === 'YX' }" @click="load('YX')">YX</button>
        <button type="button" :class="{ active: demo === 'CYX' }" @click="load('CYX')">CYX</button>
        <button type="button" :class="{ active: demo === 'ZCYX' }" @click="load('ZCYX')">ZCYX</button>
        <button type="button" :class="{ active: demo === 'kymo' }" @click="load('kymo')">
          R2 YX kymo
        </button>
        <button type="button" :class="{ active: demo === 'reference' }" @click="load('reference')">
          R2 reference
        </button>
        <button type="button" :class="{ active: demo === 'local' }" @click="openLocalOmeZarr">
          Open local OME-Zarr
        </button>
      </nav>
      <p v-if="localError" role="alert">{{ localError }}</p>
    </header>
    <ImageViewerWidget ref="widget" />
  </div>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
}
.demo-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #e2e8f0;
  background: #020617;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
}
.demo-page > header {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  justify-content: space-between;
  padding: 16px 20px 12px;
}
.demo-page h1,
.demo-page p {
  margin: 0;
}
.demo-page nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.demo-page button {
  color: #e2e8f0;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.demo-page button.active {
  border-color: #38bdf8;
}
.demo-page button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.demo-page .mm-image-viewer {
  flex: 1;
  min-height: 0;
}
</style>
