# Data sources

Every trace in one Signal Viewer session shares a sample count and regular X
calibration. Stable IDs identify recordings and series; display labels may
change independently.

## In-memory traces

Use `setTraces()` when the caller already holds complete arrays:

```ts
await viewer.setTraces([
  {
    id: 'voltage',
    label: 'Voltage',
    values: voltage,
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

Values may be ordinary numeric arrays, `Float32Array`, or `Float64Array`.
Signal Viewer borrows these arrays instead of copying them. Do not mutate a
displayed array in place; replace it through `updateTrace()`.

All traces must have identical `xStart`, positive `xStep`, and sample count.
`setTraces()` and `setSource()` are full-session replacements: they reset the
viewport, overlays, and cursors by default. A source can install its initial
overlays and viewport atomically:

```ts
await viewer.setSource(source, {
  overlays,
  initialViewport: { xMin: 2, xMax: 4 },
})
```

The previous session remains displayed with a loading status until the new
source is ready. A failed or superseded load does not partially replace the
active session. `addTrace()` and `updateTrace()` are available only for an
in-memory session and preserve the current viewport.

## Lazy range sources

Implement `SignalSource` for large or remote recordings:

```ts
interface SignalSource {
  describe(signal?: AbortSignal): Promise<SignalDescription>
  getRange(request: SignalRangeRequest): Promise<SignalRangeResult>
}
```

`describe()` returns calibration, axes, and series metadata without loading
the recording. `getRange()` receives a half-open sample interval, the required
series IDs, a display-sized `targetPoints`, and an abort signal.

The result may contain full samples or min/max envelopes. An envelope declares
its integer reduction `factor` and supplies one minimum and maximum per source
bin. The source—not the viewer—decides how data is fetched and reduced.

Respect the abort signal and reject cancellation with an `AbortError`. Signal
Viewer also uses a request generation guard, so a stale response can never
replace a newer viewport.

## Visibility and loading

`setTraceVisible(id, visible)` reloads only the current visible range and only
the visible series. `getVisibleTraces()` returns IDs in source declaration
order. A session may temporarily have no visible traces; the viewer still
retains its calibrated viewport and metadata.
