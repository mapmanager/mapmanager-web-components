# Custom Element

Register `<mm-signal-viewer>` once and then use its framework-neutral API:

```ts
import { registerSignalViewerElement } from '@mapmanager/signal-viewer'

registerSignalViewerElement()

const viewer = document.querySelector('mm-signal-viewer')
await viewer.setTraces([
  { id: 'signal', values: [0, 1, 0, -1], xStart: 0, xStep: 0.1 },
])
```

The host element must have a usable height. The component fills that height:

```css
mm-signal-viewer { display: block; height: 420px; }
```

## Data and navigation

- `setSource(source, { overlays?, initialViewport? })`
- `setTraces(traces, options?)`
- `addTrace(trace)` and `updateTrace(id, update)`
- `setTraceVisible(id, visible)` and `getVisibleTraces()`
- `setViewport(viewport)`, `getViewport()`, and `resetView()`

`setSource()` may be called before connection and is queued. Its optional
state is committed atomically with the new source. Other methods require a
connected element. Methods that load signal data return promises.

## Overlays and display

- `setOverlays()`, `setScatterSeries()`, `addScatterSeries()`, and
  `updateScatterSeries()`;
- `setScatterSeriesVisible()` and `getVisibleScatterSeries()`;
- `setAxisRange()` and `getAxisRange()`;
- axis, grid, hover, legend, and theme setter/getter pairs;
- cursor setter/getter methods described in
  [Overlays and cursors](overlays-and-cursors.md).

## DOM events

The element emits bubbling, composed `CustomEvent` values named
`source-change`, `view-change`, `overlay-select`, and `cursor-change`. Event
payloads are in `CustomEvent.detail` and match the Vue events. Source
installation emits `source-change`, while `view-change` is reserved for user
navigation and reset actions.

```ts
viewer.addEventListener('overlay-select', (event) => {
  console.log(event.detail) // stable point ID or null
})
```
