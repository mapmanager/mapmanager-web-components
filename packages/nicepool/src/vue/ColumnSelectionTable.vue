<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnSchema } from '../core/types'
import { groupColumnSchemas } from './columnSelection'

const props = defineProps<{
  title: string
  columns: readonly ColumnSchema[]
  selectedName: string | null
  disabled: boolean
  allowNone: boolean
}>()
const emit = defineEmits<{ select: [name: string | null] }>()
const groups = computed(() => groupColumnSchemas(props.columns))
const radioName = computed(() => `nicepool-${props.title.toLowerCase().replaceAll(' ', '-')}`)

function select(name: string | null): void {
  if (!props.disabled) emit('select', name)
}
</script>

<template>
  <section class="nicepool-column-selector" :class="{ 'nicepool-column-selector-disabled': disabled }" :aria-disabled="disabled">
    <h3>{{ title }}</h3>
    <div class="nicepool-column-table-scroll">
      <table>
        <thead><tr><th>#</th><th>Column</th><th>Axis label</th></tr></thead>
        <tbody v-if="allowNone">
          <tr class="nicepool-column-row" :class="{ selected: selectedName === null }" @click="select(null)">
            <td><input class="nicepool-visually-hidden" type="radio" :name="radioName" :checked="selectedName === null" :disabled="disabled" aria-label="None" @change="select(null)"><span aria-hidden="true">—</span></td>
            <td>None</td><td></td>
          </tr>
        </tbody>
        <tbody v-for="group in groups" :key="group.category">
          <tr class="nicepool-category-row"><th colspan="3" scope="rowgroup">{{ group.category }}</th></tr>
          <tr v-for="entry in group.columns" :key="entry.column.name" class="nicepool-column-row" :class="{ selected: selectedName === entry.column.name }" @click="select(entry.column.name)">
            <td><input class="nicepool-visually-hidden" type="radio" :name="radioName" :checked="selectedName === entry.column.name" :disabled="disabled" :aria-label="`${title}: ${entry.column.name}`" @change="select(entry.column.name)"><span aria-hidden="true">{{ entry.index }}</span></td>
            <td :title="entry.column.name">{{ entry.column.name }}</td>
            <td :title="entry.column.axis_label">{{ entry.column.axis_label }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
