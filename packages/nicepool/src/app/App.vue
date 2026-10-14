<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { NicePoolSelection, NicePoolTheme } from '../core/types'
import NicePoolWidget from '../vue/NicePoolWidget.vue'
import { loadLuoDemoDataset, syntheticDemoDataset, type DemoDataset } from './demoData'

type DatasetName = 'Synthetic' | 'Luo et al. 2024'

const pool = ref<InstanceType<typeof NicePoolWidget> | null>(null)
const datasetName = ref<DatasetName>('Synthetic')
const rowCount = ref(0)
const lastSelection = ref<NicePoolSelection>({ primaryRowId: null, selectedRowIds: [] })
const theme = ref<NicePoolTheme>('dark')
const loading = ref(false)
const loadError = ref('')
let loadRevision = 0

function initialize(dataset: DemoDataset): void {
  pool.value?.initializeData(dataset.dataset, dataset.presetDefinitions, dataset.defaultPreset)
  rowCount.value = dataset.dataset.rows.length
  lastSelection.value = { primaryRowId: null, selectedRowIds: [] }
}

async function selectDataset(name: DatasetName): Promise<void> {
  datasetName.value = name
  const revision = ++loadRevision
  loading.value = true
  loadError.value = ''
  try {
    const dataset = name === 'Synthetic' ? syntheticDemoDataset() : await loadLuoDemoDataset()
    if (revision === loadRevision) initialize(dataset)
  } catch (reason) {
    if (revision === loadRevision) loadError.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    if (revision === loadRevision) loading.value = false
  }
}

onMounted(() => void selectDataset('Synthetic'))
</script>

<template>
  <div class="demo-page" :class="`demo-page-${theme}`">
    <header>
      <div>
        <h1>NicePool Web</h1>
        <label>Dataset
          <select :value="datasetName" :disabled="loading" @change="selectDataset(($event.target as HTMLSelectElement).value as DatasetName)">
            <option value="Synthetic">Synthetic</option>
            <option value="Luo et al. 2024">Luo et al. 2024</option>
          </select>
        </label>
      </div>
      <p>{{ loading ? 'Loading…' : `${rowCount} rows` }} · primary {{ lastSelection.primaryRowId ?? 'none' }}</p>
    </header>
    <p v-if="loadError" class="demo-error" role="alert">{{ loadError }}</p>
    <NicePoolWidget ref="pool" :theme="theme" preset-storage-key="nicepool-web-demo-presets-v4" @selection-change="lastSelection = $event" @theme-change="theme = $event" />
  </div>
</template>

<style>
html, body, #app { min-height: 100%; margin: 0; }
.demo-page { min-height: 100vh; box-sizing: border-box; margin: 0 auto; padding: 24px max(24px, calc((100vw - 1280px) / 2)); transition: background 120ms ease, color 120ms ease; }
.demo-page-dark { color: #e5e7eb; background: #0b1120; color-scheme: dark; }
.demo-page-light { color: #172033; background: #e2e8f0; color-scheme: light; }
.demo-page > header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 16px; color: inherit; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.demo-page h1, .demo-page p { margin: 0; }
.demo-page header label { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; }
.demo-page header select { min-width: 190px; padding: 4px 7px; color: inherit; background: transparent; border: 1px solid currentColor; border-radius: 4px; }
.demo-error { margin-bottom: 12px !important; padding: 8px 10px; color: #fecaca; background: #7f1d1d; border-radius: 5px; }
</style>
