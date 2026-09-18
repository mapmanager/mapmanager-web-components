# MapManager Signal Viewer

`@mapmanager/signal-viewer` is a storage-agnostic viewer for aligned,
regularly sampled scientific signals. It knows nothing about SanPy, Zarr,
Parquet, or HTTP. Applications either provide complete arrays or implement the
small asynchronous `SignalSource` range-loading interface.

The canonical guide and hosted demo are available at
[mapmanager.github.io/mapmanager-web-components/signal-viewer/](https://mapmanager.github.io/mapmanager-web-components/signal-viewer/).

## Run the demo on macOS

From the `mapmanager-web-components` repository root:

```bash
cd /Users/cudmore/Sites/cs_project/mapmanager-web-components
npm install
npm run dev --workspace=@mapmanager/signal-viewer
```

Open the local URL printed by Vite, normally <http://localhost:5173/>. If the
repository dependencies are already installed, skip `npm install`.

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
- `setScatterSeries()`, `addScatterSeries()`, and `updateScatterSeries()`;
- `setScatterSeriesVisible(id, visible)` and `getVisibleScatterSeries()`;
- `setAxisVisible('x' | 'y', visible)` and `getAxisVisible()`;
- `setGridVisible('x' | 'y', visible)` and `getGridVisible()`;
- `setHoverVisible(visible)` and `getHoverVisible()`;
- `setAxisRange('left' | 'right', 'auto' | { min, max })` and `getAxisRange()`;
- `setLegendVisible()` and `getLegendVisible()`;
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

viewer.value?.setScatterSeries([{
  id: 'peaks',
  label: 'Peaks',
  color: '#22d3ee',
  points: peakResults.map((peak) => ({
    id: peak.id,
    x: peak.time,
    y: peak.vm,
    kind: 'peak',
  })),
}])
```

Scatter visibility is series-level while selection and hit testing remain
point-level. X-axis chrome and combined left/right Y-axis chrome can be toggled
independently without changing the inner plot bounds. Configured axes reserve a
fixed amount of layout space even while hidden. X and Y grid lines and the
hover crosshair can also be toggled independently. uPlot chooses tick intervals
automatically from the visible range and available pixel space.

Call `setTheme('light' | 'dark')` to switch the complete component palette at
runtime and `getTheme()` to inspect it. The default is `dark`. Theme tokens are
centralized and shared by the uPlot adapter and component chrome; callers do
not need to know about uPlot styling.

## Cursors and events

A/B are vertical X cursors. C/D are horizontal cursors calibrated to the left
Y axis. Programmatic cursor changes do not emit events. A completed user drag
emits `cursor-change` with `changedId`, defensive copies of all four cursors,
`deltaX` (`B - A`), and `deltaY` (`D - C`). Right-axis horizontal cursors are
outside this API version.

The plot's options button uses these same public operations to show or hide
traces, named scatter series, axes, and cursor pairs and to reset the full view.
Double-clicking the plot uses the same full-view reset operation, restoring both
the complete X range and the configured Y-axis ranges. The first time a pair is
enabled, A/B are placed at 25% and 75% of the visible X range and C/D at 25%
and 75% of the visible left Y range. Later toggles preserve their positions.
Dragging chooses the dominant direction and zooms only X or only both Y
scales. A visible selection band previews that range. When hover is enabled,
uPlot shows the crosshair and one trace-colored position marker per visible
trace, and the legend reports corresponding values. Disabling hover also
disables those live legend values.
Shift-drag pans X and both Y axes freely. X panning is clamped to the complete
recording, and a lazy range request is issued once when the gesture ends. The
built-in uPlot legend delegates trace toggles to the same source-aware
visibility operation used by the options panel.

The other events are `source-change`, `view-change`, and `overlay-select`.
The custom element exposes the same methods and emits events with the same
payloads in `CustomEvent.detail`.

## Design boundaries

The source decides whether to return full samples or min/max envelopes. The
framework-independent engine owns cancellation, visible-series requests, and
range validation. The renderer adapter owns drawing and interaction. The
application owns persistence, sweep/channel selection, and linked selection
with tables or other components.
