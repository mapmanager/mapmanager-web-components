# MapManager Signal Viewer

`@mapmanager/signal-viewer` is a storage-agnostic viewer for aligned,
regularly sampled scientific signals. It knows nothing about SanPy, Zarr,
Parquet, or HTTP. Applications either provide complete arrays or implement the
small asynchronous `SignalSource` range-loading interface.

## Data model

Every trace in one viewer has the same `xStart`, `xStep`, and sample count.
Traces have stable IDs, optional labels and styles, and use either the required
left Y axis or one optional independent right Y axis. Sparse points and regions
are overlays, not signal traces.

## Vue API

The component exposes these methods through a template ref:

- `setTraces(traces, options?)`: replace the complete in-memory session;
- `addTrace(trace)` and `updateTrace(id, update)`: modify in-memory traces;
- `setSource(source)`: replace the complete session with a lazy range source;
- `setTraceVisible(id, visible)` and `getVisibleTraces()`;
- `setViewport(viewport)`, `getViewport()`, and `resetView()`;
- `setOverlays(overlays)`;
- `setAxisRange('left' | 'right', 'auto' | { min, max })` and `getAxisRange()`;
- `setCursor()`, `setCursorVisible()`, `setCursors()`, `getCursor()`, and
  `getCursors()`.

`setSource()` and `setTraces()` are deliberate full-session replacements. They
clear overlays and cursors, reset the viewport, and recalculate axis ranges.
Single-trace deletion is intentionally absent; hide a trace or replace the
complete trace set.

```vue
<SignalViewerWidget
  ref="viewer"
  @view-change="onViewChange"
  @overlay-select="onOverlaySelect"
  @cursor-change="onCursorChange"
/>
```

```ts
await viewer.value?.setTraces([
  {
    id: 'vm',
    label: 'Vm',
    values: vm,
    xStart: 0,
    xStep: 0.0001,
    style: { color: '#38bdf8', lineWidth: 2 },
  },
  {
    id: 'command',
    label: 'Command',
    values: command,
    xStart: 0,
    xStep: 0.0001,
    yAxis: 'right',
  },
], {
  xLabel: 'Time',
  xUnit: 's',
  yAxes: {
    left: { label: 'Membrane potential', unit: 'mV' },
    right: { label: 'Command', unit: 'pA' },
  },
})
```

## Cursors and events

A/B are vertical X cursors. C/D are horizontal cursors calibrated to the left
Y axis. Programmatic cursor changes do not emit events. A completed user drag
emits `cursor-change` with `changedId`, defensive copies of all four cursors,
`deltaX` (`B - A`), and `deltaY` (`D - C`). Right-axis horizontal cursors are
outside this API version.

The other events are `source-change`, `view-change`, and `overlay-select`.
The custom element exposes the same methods and emits events with the same
payloads in `CustomEvent.detail`.

## Design boundaries

The source decides whether to return full samples or min/max envelopes. The
framework-independent engine owns cancellation, visible-series requests, and
range validation. The renderer adapter owns drawing and interaction. The
application owns persistence, sweep/channel selection, and linked selection
with tables or other components.
