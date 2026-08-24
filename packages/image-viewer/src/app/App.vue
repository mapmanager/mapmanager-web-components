<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { syntheticPlaneSource } from '../engine/synthetic'
import type { ImageSource } from '../engine/types'
import ImageViewerWidget from '../vue/ImageViewerWidget.vue'

type DemoKind = 'YX' | 'CYX' | 'ZCYX' | 'kymo' | 'reference'

interface WidgetApi {
  setSource: (source: ImageSource) => Promise<{
    width: number
    height: number
    sourceWidth: number
    sourceHeight: number
  } | null>
}

const widget = ref<WidgetApi | null>(null)
const demo = ref<DemoKind>('YX')

const R2_COLLECTION = 'https://data.mapmanager.net/samples/velocity-sample-data.ome.zarr/'
const kymoUrl = `${R2_COLLECTION}acq_images/acq_image_000/`
const referenceUrl = `${R2_COLLECTION}acq_images/acq_image_000/reference/`

function sourceFor(kind: DemoKind): ImageSource {
  if (kind === 'kymo') {
    return { kind: 'ome-zarr', id: 'r2-velocity-kymo', url: kymoUrl }
  }
  if (kind === 'reference') {
    return { kind: 'ome-zarr', id: 'r2-velocity-reference', url: referenceUrl }
  }
  return syntheticPlaneSource(kind)
}

async function load(kind: DemoKind): Promise<void> {
  demo.value = kind
  await widget.value?.setSource(sourceFor(kind))
}

onMounted(() => {
  void load('YX')
})
</script>

<template>
  <div class="demo-page">
    <header>
      <div>
        <p class="eyebrow">Phase 1 spike</p>
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
      </nav>
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
.demo-page .eyebrow {
  margin-bottom: 4px;
  color: #94a3b8;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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
