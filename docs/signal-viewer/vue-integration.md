# Vue integration

Import the component and use a template ref for its imperative API:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import {
  SignalViewerWidget,
  type SignalCursorChange,
  type SignalViewport,
} from '@mapmanager/signal-viewer'
import '@mapmanager/signal-viewer/style.css'

const viewer = ref<InstanceType<typeof SignalViewerWidget> | null>(null)

onMounted(async () => {
  await viewer.value?.setTraces([
    { id: 'signal', values: [0, 1, 0, -1], xStart: 0, xStep: 0.1 },
  ], { xLabel: 'Time', xUnit: 's' })
})

function viewChanged(viewport: SignalViewport) {
  console.log(viewport)
}

function cursorsChanged(change: SignalCursorChange) {
  console.log(change.deltaX, change.deltaY)
}
</script>

<template>
  <SignalViewerWidget
    ref="viewer"
    @view-change="viewChanged"
    @overlay-select="console.log($event)"
    @cursor-change="cursorsChanged"
  />
</template>
```

## Events

- `source-change`: emitted after a source is successfully installed;
- `view-change`: emitted after a completed user zoom, pan, or reset;
- `overlay-select`: selected point ID, or `null` when selection clears;
- `cursor-change`: the changed cursor, all cursor state, and A/B or C/D delta.

Programmatic viewport, cursor, and visibility methods do not echo their
corresponding user events. Await asynchronous source, trace, viewport, and
trace-visibility methods before issuing work that depends on the new frame.

The public methods are shared with the Custom Element and documented in the
[Custom Element guide](custom-element.md).
