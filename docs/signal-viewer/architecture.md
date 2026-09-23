# Architecture

Signal Viewer separates data coordination, rendering, and host integration.

## Framework-independent core

`SignalViewerEngine` owns source descriptions, visible-series state,
calibrated viewport normalization, request cancellation, generation guards,
and range-result validation. It has no Vue or
[uPlot](https://github.com/leeoniya/uPlot) dependency.

`InMemorySignalSource` adapts complete aligned arrays to the same
`SignalSource` contract used by lazy storage adapters. This keeps validation
and viewport loading consistent between small and large recordings.

## Vue and rendering boundary

`SignalViewerWidget.vue` coordinates the engine, component controls, overlays,
cursors, and the renderer interface. `UPlotSignalRenderer` owns uPlot-specific
drawing and pointer interaction. Plot-library details do not leak into the
engine or host API.

## Public integration surfaces

The package exports:

- core types, validation helpers, and `SignalViewerEngine`;
- `InMemorySignalSource`;
- `SignalViewerWidget` for Vue clients;
- `SignalViewerElement` and `registerSignalViewerElement()` for other hosts;
- the renderer contract and default uPlot implementation.

## Ownership boundary

Signal Viewer owns validated range loading, rendering, navigation, visibility,
overlays, and cursor interaction. The embedding application owns persistence,
storage and transport adapters, analysis, sweep/channel choice, and linked
selection with other components.

Full-session replacement resets overlays and cursors by default. `setSource()`
can receive initial overlays and a viewport so the candidate engine loads and
validates a complete session before the widget commits it. Until that commit,
the renderer keeps the previous session intact. This prepare-then-commit
boundary prevents hosts from exposing partially updated traces and overlays.
