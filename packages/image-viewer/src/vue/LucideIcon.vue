<script setup lang="ts">
import { ICONS, type IconName } from './icons'

defineProps<{
  name: IconName
  label?: string
}>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    :data-label="label"
  >
    <template v-for="(node, index) in ICONS[name]" :key="index">
      <rect v-if="node[0] === 'rect'" v-bind="node[1]" />
      <line v-else-if="node[0] === 'line'" v-bind="node[1]" />
      <path v-else v-bind="node[1]" />
    </template>
  </svg>
</template>
