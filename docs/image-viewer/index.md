# Image Viewer

`@mapmanager/image-viewer` is the reusable MapManager scientific image viewer.
It combines Viv image layers with Deck.gl interaction and a Vue user interface.
It is used in production by [AcqView](https://mapmanager.github.io/acqview/).

## Capabilities

- in-memory `PlaneSource` data and lazy `AsyncPlaneSource` data;
- URL-backed and browser-selected local OME-Zarr;
- YX, CYX, ZYX, ZCYX, and compatible T/C/Z/Y/X arrangements;
- side-by-side, stacked, single-channel, and composite layouts;
- per-channel color maps, contrast controls, and histograms;
- calibrated axes, zoom, pan, and home view;
- rectangle and line ROIs plus XY plot overlays;
- browser clipboard copying or a host-provided clipboard bridge;
- Vue and framework-neutral Custom Element entry points.

## Status

Version `0.2.0` represents the completed first rewrite pass. The component is
actively developed and production-used, but remains pre-1.0. API changes are
permitted and should be documented with migration guidance.

Start with [Sources](sources.md), then choose the [Vue](vue-integration.md) or
[Custom Element](custom-element.md) integration guide.
