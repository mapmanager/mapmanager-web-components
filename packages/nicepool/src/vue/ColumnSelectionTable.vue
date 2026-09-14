<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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
const selectedLabel = computed(() => props.selectedName ?? 'None')
const scrollContainer = ref<HTMLElement | null>(null)

watch(
  () => props.selectedName,
  async () => {
    await nextTick()
    scrollContainer.value?.querySelector<HTMLElement>('.nicepool-column-row.selected')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  },
  { immediate: true },
)

function select(name: string | null): void {
  if (!props.disabled) emit('select', name)
}
</script>

<template>
  <section class="nicepool-column-selector" :class="{ 'nicepool-column-selector-disabled': disabled }" :aria-disabled="disabled">
    <h3>{{ title }} <span class="nicepool-column-selection">• {{ selectedLabel }}</span></h3>
    <div ref="scrollContainer" class="nicepool-column-table-scroll">
      <table>
        <thead><tr><th>#</th><th>Column</th></tr></thead>
        <tbody v-if="allowNone">
          <tr class="nicepool-column-row" :class="{ selected: selectedName === null }" @click="select(null)">
            <td><input class="nicepool-visually-hidden" type="radio" :name="radioName" :checked="selectedName === null" :disabled="disabled" aria-label="None" @change="select(null)"><span aria-hidden="true">—</span></td>
            <td>None</td>
          </tr>
        </tbody>
        <tbody v-for="group in groups" :key="group.category">
          <tr class="nicepool-category-row"><th aria-hidden="true"></th><th scope="rowgroup">{{ group.category }}</th></tr>
          <tr v-for="entry in group.columns" :key="entry.column.name" class="nicepool-column-row" :class="{ selected: selectedName === entry.column.name }" @click="select(entry.column.name)">
            <td><input class="nicepool-visually-hidden" type="radio" :name="radioName" :checked="selectedName === entry.column.name" :disabled="disabled" :aria-label="`${title}: ${entry.column.name}`" @change="select(entry.column.name)"><span aria-hidden="true">{{ entry.index }}</span></td>
            <td :title="entry.column.axis_label">{{ entry.column.name }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
