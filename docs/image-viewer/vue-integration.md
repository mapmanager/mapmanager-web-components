# Vue integration

Import the widget, its types, and the stylesheet from the package.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import {
  ImageViewerWidget,
  type ViewerSource,
  type XyOverlay,
} from '@mapmanager/image-viewer'
import '@mapmanager/image-viewer/style.css'

const viewer = ref<InstanceType<typeof ImageViewerWidget> | null>(null)

async function show(source: ViewerSource, overlays: readonly XyOverlay[] = []) {
  await viewer.value?.setSource(source, { xyOverlays: overlays })
}
</script>

<template>
  <ImageViewerWidget ref="viewer" />
</template>
```

The widget exposes `setSource`, `setRois`, `setXyOverlays`, and its `engine`.
Source changes are asynchronous and atomic: await `setSource` before treating
the new image as active.

## Props

- `doubleClickBehavior`: `home` (default) or Deck.gl's native behavior.
- `roiToolsEnabled`: show or suppress ROI tools; defaults to `true`.
- `hostClipboardBridge`: ask the host to perform image copying.

## Events

- `view-change` reports the visible calibrated window.
- `source-change` reports the newly active source ID.
- `copy-view-request` carries a `CopyViewRequest` when clipboard work belongs
  to the host.
