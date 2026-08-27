# Image sources

`ImageViewerWidget.setSource()` accepts the `ViewerSource` union. A source has
a stable `id`, a supported dtype (`uint8`, `uint16`, or `float32`), and axis
labels whose final two entries are always `y`, `x`.

## In-memory planes

Use `PlaneSource` when all pixel values are already available in JavaScript.

```ts
import type { PlaneSource } from '@mapmanager/image-viewer'

const source: PlaneSource = {
  kind: 'plane',
  id: 'reference',
  data: pixels,
  dtype: 'uint16',
  shape: [2, 512, 512],
  labels: ['c', 'y', 'x'],
  xAxis: { label: 'x', unit: 'µm', step: 0.25 },
  yAxis: { label: 'y', unit: 'µm', step: 0.25 },
}
```

## Lazy planes

Use `AsyncPlaneSource` when a client should load only the selected YX plane.
Storage formats, workers, and Python runtimes stay outside the viewer.

```ts
import type { AsyncPlaneSource } from '@mapmanager/image-viewer'

const source: AsyncPlaneSource = {
  kind: 'async-plane',
  id: 'acquisition',
  dtype: 'uint16',
  shape: [2, 100, 512, 512],
  labels: ['c', 'z', 'y', 'x'],
  async getPlane({ selection, signal }) {
    return loadPlane(selection, signal) // { data, width, height }
  },
}
```

Honor the optional abort signal so obsolete plane requests can stop when a
user changes source or selection. Returned data must be a matching typed array
and contain exactly `width * height` values.

## OME-Zarr

An OME-Zarr source contains either a remote `url` or an
`OmeZarrReadableStore`; it never contains both. See [OME-Zarr](ome-zarr.md).
