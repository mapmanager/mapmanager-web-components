<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  histogramBarFraction,
  numberText,
  type Histogram,
} from '../engine/contrast-range'

const HISTOGRAM_LEFT = 6
const HISTOGRAM_RIGHT = 294

const props = defineProps<{
  open: boolean
  channel: number | null
  histogram: Histogram | null
  min: number
  max: number
  color: readonly [number, number, number]
  logScale: boolean
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  range: [min: number, max: number]
  auto: []
  log: [enabled: boolean]
}>()

const root = ref<HTMLDivElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const minInput = ref(numberText(props.min))
const maxInput = ref(numberText(props.max))
let dragHandle: 'minimum' | 'maximum' | null = null

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function syncFields(): void {
  minInput.value = numberText(props.min)
  maxInput.value = numberText(props.max)
}

function applyNumericRange(): void {
  const minimum = Number(minInput.value)
  const maximum = Number(maxInput.value)
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !(maximum > minimum)) return
  emit('range', minimum, maximum)
}

function valueToX(value: number): number {
  const histogram = props.histogram
  if (!histogram) return HISTOGRAM_LEFT
  const fraction = clamp(
    (value - histogram.domainMin) / (histogram.domainMax - histogram.domainMin),
    0,
    1,
  )
  return HISTOGRAM_LEFT + fraction * (HISTOGRAM_RIGHT - HISTOGRAM_LEFT)
}

function eventPixelX(event: PointerEvent): number {
  const el = canvas.value
  if (!el) return 0
  const rect = el.getBoundingClientRect()
  return ((event.clientX - rect.left) * el.width) / Math.max(1, rect.width)
}

function drawHistogram(): void {
  const el = canvas.value
  const histogram = props.histogram
  if (!el || !histogram) return
  const context = el.getContext('2d')
  if (!context) return
  const top = 6
  const bottom = el.height - 8
  const maxCount = Math.max(1, ...histogram.bins)
  context.clearRect(0, 0, el.width, el.height)
  context.fillStyle = '#020617'
  context.fillRect(0, 0, el.width, el.height)
  const [red, green, blue] = props.color
  context.fillStyle = `rgb(${Math.round(red * 0.8)} ${Math.round(green * 0.8)} ${Math.round(blue * 0.8)})`
  histogram.bins.forEach((count, index) => {
    const x0 = HISTOGRAM_LEFT + (index / histogram.bins.length) * (HISTOGRAM_RIGHT - HISTOGRAM_LEFT)
    const x1 =
      HISTOGRAM_LEFT + ((index + 1) / histogram.bins.length) * (HISTOGRAM_RIGHT - HISTOGRAM_LEFT)
    const height = histogramBarFraction(count, maxCount, props.logScale) * (bottom - top)
    context.fillRect(x0, bottom - height, Math.max(1, x1 - x0), height)
  })
  drawHandle(context, props.min, '#020617', top, bottom)
  drawHandle(context, props.max, '#ffffff', top, bottom)
}

function drawHandle(
  context: CanvasRenderingContext2D,
  value: number,
  fill: string,
  top: number,
  bottom: number,
): void {
  const x = valueToX(value)
  context.strokeStyle = fill
  context.lineWidth = 2
  context.beginPath()
  context.moveTo(x, top)
  context.lineTo(x, bottom)
  context.stroke()
  context.fillStyle = fill
  context.strokeStyle = '#e2e8f0'
  context.fillRect(x - 4, top, 8, 9)
  context.strokeRect(x - 4, top, 8, 9)
}

function position(): void {
  const el = root.value
  const button = props.anchor
  if (!el || !button) return
  const rect = button.getBoundingClientRect()
  const width = el.offsetWidth || 330
  const height = el.offsetHeight || 190
  const margin = 8
  const left = clamp(rect.left, margin, Math.max(margin, window.innerWidth - width - margin))
  const below = rect.bottom + 6
  const top =
    below + height <= window.innerHeight - margin ? below : Math.max(margin, rect.top - height - 6)
  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
}

function beginDrag(event: PointerEvent): void {
  if (!props.histogram) return
  const pixelX = eventPixelX(event)
  dragHandle =
    Math.abs(pixelX - valueToX(props.min)) <= Math.abs(pixelX - valueToX(props.max))
      ? 'minimum'
      : 'maximum'
  canvas.value?.setPointerCapture(event.pointerId)
  updateDrag(event)
}

function updateDrag(event: PointerEvent): void {
  if (!props.histogram || !dragHandle) return
  const fraction = clamp(
    (eventPixelX(event) - HISTOGRAM_LEFT) / (HISTOGRAM_RIGHT - HISTOGRAM_LEFT),
    0,
    1,
  )
  const value =
    props.histogram.domainMin + fraction * (props.histogram.domainMax - props.histogram.domainMin)
  const epsilon = Math.max(1e-12, (props.histogram.domainMax - props.histogram.domainMin) * 1e-6)
  if (dragHandle === 'minimum') {
    emit('range', Math.min(value, props.max - epsilon), props.max)
  } else {
    emit('range', props.min, Math.max(value, props.min + epsilon))
  }
  event.preventDefault()
}

function endDrag(event: PointerEvent): void {
  if (!dragHandle) return
  canvas.value?.releasePointerCapture(event.pointerId)
  dragHandle = null
}

function onDocumentPointer(event: PointerEvent): void {
  const el = root.value
  const target = event.target
  if (!props.open || !el || !(target instanceof Node)) return
  if (el.contains(target)) return
  if (target instanceof Element && target.closest('.mm-range-button')) return
  emit('close')
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => [props.min, props.max] as const,
  () => {
    syncFields()
    drawHistogram()
  },
)

watch(
  () => [props.open, props.histogram, props.logScale, props.color] as const,
  async () => {
    if (!props.open) return
    await nextTick()
    position()
    drawHistogram()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', onResizeClose)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', onResizeClose)
})

function onResizeClose(): void {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-show="open"
      ref="root"
      class="mm-range-popover"
      role="dialog"
      aria-label="Display range"
    >
      <div class="mm-histogram-wrap">
        <canvas
          ref="canvas"
          class="mm-range-histogram"
          width="300"
          height="100"
          @pointerdown="beginDrag"
          @pointermove="updateDrag"
          @pointerup="endDrag"
        />
      </div>
      <div class="mm-range-fields">
        <label>
          Min
          <input v-model="minInput" type="number" step="any" aria-label="Min display value" @change="applyNumericRange" />
        </label>
        <label>
          Max
          <input v-model="maxInput" type="number" step="any" aria-label="Max display value" @change="applyNumericRange" />
        </label>
        <button type="button" @click="emit('auto')">Auto</button>
        <label class="mm-range-log">
          <input
            type="checkbox"
            :checked="logScale"
            aria-label="Log histogram Y scale"
            @change="emit('log', ($event.target as HTMLInputElement).checked)"
          />
          Log
        </label>
      </div>
    </div>
  </Teleport>
</template>
