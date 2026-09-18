# Signal Viewer

`@mapmanager/signal-viewer` is a reusable viewer for aligned, regularly
sampled 2D signals. It supports complete in-memory arrays and lazy
range sources without knowing about an application's storage, transport, or
analysis model.
Plotting is provided by [uPlot](https://github.com/leeoniya/uPlot).

[SanPy Web](https://mapmanager.github.io/sanpy-web/) uses Signal Viewer to plot
recorded signals against time.

[Open the hosted Signal Viewer demo](https://mapmanager.github.io/mapmanager-web-components/demos/signal-viewer/).

## Capabilities

- multiple aligned traces with stable IDs and independent left/right Y axes;
- full-resolution samples or source-provided min/max envelopes;
- X zoom, X/Y zoom, panning, and full-view reset;
- sparse point series and interval overlays;
- selectable overlay points with stable IDs;
- A/B X cursors and C/D left-Y measurement cursors;
- trace, overlay-series, axis, grid, hover, and legend visibility controls;
- explicit Y-axis ranges and light/dark themes;
- Vue and framework-neutral Custom Element entry points.

Signal Viewer is storage-agnostic. Applications own files, network requests,
sweep or channel selection, persistence, and coordination with other widgets.

## Guides

- [Data sources](data-sources.md)
- [Vue integration](vue-integration.md)
- [Custom Element](custom-element.md)
- [Overlays and cursors](overlays-and-cursors.md)
- [Interaction and display](interaction-and-display.md)
- [Architecture](architecture.md)

The component is pre-1.0. Its public types and methods are stable enough for
current clients, but deliberate breaking improvements must include migration
guidance.
