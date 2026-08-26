# `@mapmanager/image-viewer`

Deck.gl / Viv image viewer (Phase 0–1 spike). Not a frozen API.

```bash
npm run dev --workspace @mapmanager/image-viewer
```

Demo sources: synthetic **YX**, **CYX**, **ZCYX**. If
`cloudscope-data/ome-zarr-output/manning-velocity-20260625-v2.ome.zarr`
is present, Manning kymograph and reference OME-Zarr buttons are enabled.

Custom element demo: `element-demo.html` (Vite).

## Lazy planes

`AsyncPlaneSource` lets a viewer request one selected scientific YX plane at a
time. Storage formats, workers, and Python runtimes remain outside this package.

```ts
import type { AsyncPlaneSource } from '@mapmanager/image-viewer'

const source: AsyncPlaneSource = {
  kind: 'async-plane',
  id: 'local-image',
  dtype: 'uint16',
  shape: [2, 10_000, 512],
  labels: ['c', 'y', 'x'],
  async getPlane({ selection, signal }) {
    return loadSelectedPlane(selection, signal)
  },
}
```

Existing `PlaneSource` and OME-Zarr source APIs are unchanged. Async planes use
the same orientation, channel layouts, composites, contrast, and calibration
behavior as existing sources.
