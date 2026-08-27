# Changelog

Notable user-facing changes to MapManager Web Components are documented here.

NicePool is currently versioned `0.1.0`; Image Viewer is versioned `0.2.0`.
Both packages are private, pre-1.0 workspaces and have no tagged releases.
Pending changes remain under `Unreleased` until a release is created.

## Unreleased

### Added

- Added a repository-wide MkDocs site with current guides for Image Viewer and
  NicePool, client examples, and contributor documentation.

- Added `@mapmanager/nicepool`, a reusable browser-native statistical plotting component with linked selection, filtering, summaries, persistent plot slots, saved presets, Vue and Custom Element integrations, and scatter, swarm, box, violin, histogram, and cumulative-histogram views.
- Added `@mapmanager/image-viewer`, a reusable Deck.gl/Viv scientific image viewer with YX, CYX, and ZCYX sources; channel layouts and color maps; contrast controls and histograms; calibrated axes; zoom and pan; ROI tools; XY overlays; Vue and Custom Element integrations; and standalone development sources.
- Added browser-native opening of a directly renderable local OME-Zarr image directory without uploading it to a server.
- Added workspace-wide tests, type checking, production builds, browser end-to-end coverage, and continuous-integration checks.

### Changed

- Finalized the first Image Viewer rewrite release as `0.2.0`; it remains a
  pre-1.0 API that may evolve with documented migration guidance.

- Upgraded the image viewer from Viv 0.19 to Viv 0.22.1 with coordinated Deck.gl 9.3.3, Luma.gl 9.3.3, and loaders.gl 4.4.1 dependencies.
- Unified URL-backed and browser-directory OME-Zarr loading through Viv's supported loader APIs.
- Made image-source switching a single state update: the current frame remains unchanged while a candidate source is prepared, then its source, camera, channels, and overlays are published together.
- Split side-by-side and stacked channel layouts into independent panes and expanded viewer options, channel color maps, contrast controls, and calibrated-axis presentation.
- Changed materialized planes to use one exact-resolution, 1024-pixel tiled Viv source instead of generating an artificial image pyramid.

### Fixed

- Fixed slow initial rendering of small, single-resolution OME-Zarr kymographs by materializing eligible planes and serving them to Viv as larger in-memory tiles.
- Fixed narrow kymographs rendering beyond the Y-axis zero boundary because artificial pyramid levels were uniformly scaled to incorrect image bounds.
- Removed the separate old-camera and post-load overlay updates that produced empty, axes-only, or overlay-only intermediate frames while switching image sources.
- Fixed Y-axis ticks moving opposite to the image during pan.
- Fixed independent channel-pane rendering, default ROI placement, and Viv pixel-source method binding.
