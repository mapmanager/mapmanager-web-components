<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { formatTableToTsv } from '../core/table-format'
import type { ColumnSchema, NicePoolRow } from '../core/types'

const props = withDefaults(defineProps<{
  rows: readonly NicePoolRow[]
  columns: readonly ColumnSchema[]
  rowIdColumn: string
  pageSize?: number
  label: string
}>(), { pageSize: 100 })

const emit = defineEmits<{
  copied: [label: string, rowCount: number]
  error: [message: string]
}>()
const page = ref(0)
const pageCount = computed(() => Math.max(1, Math.ceil(props.rows.length / props.pageSize)))
const visibleRows = computed(() => {
  const start = page.value * props.pageSize
  return props.rows.slice(start, start + props.pageSize)
})
const firstVisibleRow = computed(() => props.rows.length ? page.value * props.pageSize + 1 : 0)
const lastVisibleRow = computed(() => Math.min((page.value + 1) * props.pageSize, props.rows.length))

watch(() => props.rows, () => { page.value = 0 })
watch(pageCount, (count) => { page.value = Math.min(page.value, count - 1) })

function displayValue(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

async function copyTable(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatTableToTsv(props.rows, props.columns))
    emit('copied', props.label, props.rows.length)
  } catch (reason) {
    emit('error', reason instanceof Error ? reason.message : String(reason))
  }
}
</script>

<template>
  <div class="nicepool-table-view">
    <div class="nicepool-table-pagination">
      <span>Rows {{ firstVisibleRow }}–{{ lastVisibleRow }} of {{ rows.length }}</span>
      <button type="button" @click="copyTable">Copy Table</button>
      <button type="button" :disabled="page === 0" @click="page -= 1">Previous</button>
      <button type="button" :disabled="page + 1 >= pageCount" @click="page += 1">Next</button>
    </div>
    <div class="nicepool-summary-table-scroll" tabindex="0" :aria-label="`${label} table data`">
      <table :aria-label="label">
        <thead><tr><th>#</th><th v-for="column in columns" :key="column.name">{{ column.axis_label }}</th></tr></thead>
        <tbody><tr v-for="(row, rowIndex) in visibleRows" :key="String(row[rowIdColumn] ?? rowIndex)">
          <td>{{ page * pageSize + rowIndex + 1 }}</td>
          <td v-for="column in columns" :key="column.name">{{ displayValue(row[column.name]) }}</td>
        </tr></tbody>
      </table>
    </div>
  </div>
</template>
