# Overlays and ROIs

The Vue widget accepts two independent annotation types.

## XY overlays

An `XyOverlay` is a named polyline with equal-length X and Y arrays and an
optional CSS color. Supply initial overlays in the atomic source call or update
them later:

```ts
await viewer.setSource(source, { xyOverlays })
viewer.setXyOverlays(nextOverlays)
```

The Options menu's **XY Plot** item is disabled when no overlays exist and
toggles their visibility when they do.

## ROIs

`Roi` is a rectangle or line in image coordinates. IDs must be stable within
the supplied collection.

```ts
viewer.setRois([
  { id: 'region-1', kind: 'rect', x0: 10, y0: 20, x1: 40, y1: 60 },
])
```

Set the `roiToolsEnabled` prop to `false` when the host does not want the
viewer to expose ROI controls. ROIs and XY overlays are currently Vue-widget
APIs; the Custom Element forwards neither setter.
