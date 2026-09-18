# Overlays and cursors

Overlays annotate signal data without becoming sampled traces. They are owned
by the application and replaced through public APIs.

## Scatter series and regions

Points belong to named scatter series. Visibility is controlled per series,
while hit testing and selection use each point's stable ID:

```ts
viewer.setOverlays({
  scatterSeries: [{
    id: 'peaks',
    label: 'Detected peaks',
    color: '#22d3ee',
    points: peaks.map((peak) => ({
      id: peak.id,
      x: peak.time,
      y: peak.value,
      kind: 'peak',
      metadata: { index: peak.index },
    })),
  }],
  regions: [{
    id: 'stimulus-1',
    xStart: 1.0,
    xStop: 1.5,
    kind: 'stimulus',
    label: 'Stimulus',
  }],
  selectedPointId: null,
})
```

Regions render behind the traces and are not selectable. `overlay-select`
emits a point ID or `null`. The application uses that stable identity to link
selection with tables or other viewers.

`setScatterSeries()` replaces point series while preserving regions.
`addScatterSeries()` and `updateScatterSeries()` provide stable-ID updates.

## Measurement cursors

A/B are vertical cursors in calibrated X units. C/D are horizontal cursors in
left-axis units. Programmatic cursor methods do not emit user events:

```ts
viewer.setCursor('a', 1.25)
viewer.setCursorVisible('b', true)
const cursors = viewer.getCursors()
```

The first time a cursor pair is enabled in the options panel, it is placed at
25% and 75% of the visible range. Hiding a cursor preserves its value.

A completed user drag emits `cursor-change` with `changedId`, defensive copies
of all four cursors, `deltaX` (`B - A`), and `deltaY` (`D - C`). A delta is
`null` unless both cursors in its pair are visible and positioned.
