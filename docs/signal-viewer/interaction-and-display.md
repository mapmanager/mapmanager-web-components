# Interaction and display

Signal Viewer uses [uPlot](https://github.com/leeoniya/uPlot) at the rendering
boundary while its public controls remain renderer-independent.

## Navigation

- Drag horizontally to zoom X.
- Drag vertically to zoom both Y axes.
- Shift-drag to pan X and both Y axes.
- Double-click to restore the complete X range and configured Y ranges.

X panning is clamped to the complete recording. Lazy sources receive one range
request when a pan gesture completes rather than a request for every pointer
move. `setViewport()` accepts calibrated X coordinates and normalizes them to
the available recording.

## Display controls

The options panel and public methods share the same state transitions:

```ts
viewer.setAxisVisible('x', false)
viewer.setGridVisible('y', false)
viewer.setHoverVisible(true)
viewer.setLegendVisible(true)
viewer.setAxisRange('left', { min: -80, max: 40 })
viewer.setTheme('light')
```

Axis chrome visibility does not alter the inner plot bounds. The left and
right Y axes can have independent automatic or explicit ranges, while their
chrome is shown or hidden together. Grid visibility is independent for X and
Y.

Hover shows a crosshair, one trace-colored position marker per visible trace,
and current values in the legend. Hiding hover removes those live indicators
without hiding the legend itself.

Trace and scatter-series visibility can be changed from the options panel or
through public methods. Stable IDs—not labels or display order—are the
integration contract.
