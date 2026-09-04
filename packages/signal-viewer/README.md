# MapManager Signal Viewer

`@mapmanager/signal-viewer` is a reusable, range-loaded scientific line-signal
viewer. It is storage-agnostic: applications provide a `SignalSource`, so the
component has no knowledge of SanPy, AcqStore, Zarr, Parquet, or HTTP.

Version 0.1 intentionally represents one Y-axis track. Applications can compose
raw, derivative, and command tracks and synchronize them through the controlled
viewport API.

## Public capabilities

- asynchronous visible-range loading with abort and stale-result protection;
- full-resolution samples and min/max envelope rendering;
- one or more same-unit line series;
- read-only point and interval overlays with stable IDs;
- drag-to-zoom, resize, reset, and controlled viewport updates;
- Vue component, custom element, and framework-independent engine;
- replaceable renderer boundary with a uPlot implementation.

## Vue usage

```vue
<SignalViewerWidget
  ref="viewer"
  @view-change="onViewChange"
  @overlay-select="onOverlaySelect"
/>
```

The exposed widget methods are `setSource`, `setViewport`, `setOverlays`,
`resetView`, and `getViewport`.

## Design boundaries

The source chooses whether to return full samples or a min/max representation
for each request. The controller owns cancellation and range validation. The
uPlot adapter owns canvas drawing and translates viewport interactions into
renderer-neutral events. Applications own sweep/channel selection, persistence,
and linked selection across other components.
