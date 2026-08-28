# MapManager Web Components

MapManager Web Components contains reusable browser components shared by
MapManager web and Python/NiceGUI applications.

## Components

### Image Viewer

`@mapmanager/image-viewer` is a Deck.gl/Viv scientific image viewer. It loads
in-memory and lazy image planes as well as remote or browser-selected local
OME-Zarr data. It provides channel layouts, composites, contrast and color-map
controls, calibrated axes, ROIs, XY overlays, and copying of the current view.

[Read the Image Viewer guide](image-viewer/index.md).
[Open the hosted Image Viewer demo](https://mapmanager.github.io/mapmanager-web-components/demos/image-viewer/).

### NicePool

`@mapmanager/nicepool` provides linked statistical plots, filtering,
selection, summaries, saved plot presets, and Vue and Custom Element entry
points.

[Read the NicePool guide](nicepool/index.md).
[Open the hosted NicePool demo](https://mapmanager.github.io/mapmanager-web-components/demos/nicepool/).

## Project status

Both components are implemented and used by MapManager applications. They are
actively developed and pre-1.0: breaking API changes are allowed when they
improve the design and should include changelog and migration notes.
