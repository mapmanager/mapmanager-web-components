# Image viewer — survey and roadmap

> **STATUS: survey / roadmap only.**  
> These files are planning notes for a future `@mapmanager/image-viewer`
> package. They are **not** a public API, **not** a frozen contract, and
> **not** implementation source of truth.  
> Until that package exists and is tested, the only runtime truth is the
> CloudScope Web engine at `cloudscope-web/src/raster-viewer/`.  
> Implementation may diverge from every statement below.

## What this folder is

Planning material so we can lift the **CloudScope Web raster engine** into
`mapmanager-web-components` as a reusable **image viewer**, with standalone
demos, then later thin clients in CloudScope Web and CloudScope App.

## Package name (proposed)

`@mapmanager/image-viewer`

Rename **raster → image** only inside `mapmanager-web-components`. Existing
CloudScope / NiceWidgets names stay until those repos consume the package.

## Files

| File | Purpose |
|---|---|
| [01-survey-cloudscope-web.md](./01-survey-cloudscope-web.md) | How the current CloudScope Web engine works (init, planes, events, adapters) |
| [02-gui-ux-and-layers.md](./02-gui-ux-and-layers.md) | Toolbar / gestures and the canvas layer stack (pixels, ROI, XY overlay) |
| [03-package-and-demos.md](./03-package-and-demos.md) | Target package shape, required APIs, standalone demos, consumer order |
| [04-phase1-handoff.md](./04-phase1-handoff.md) | 2026-08-24 stop: what shipped, OME-Zarr blocker, how to resume |

## Locked for this roadmap (still not a spec)

- **Lift source:** `cloudscope-web/src/raster-viewer/` (JS engine + CSS + modules).
- **Do not lift:** `ImageViewer.vue` (AcqStore / OME-Zarr / time-link adapter).
- **NiceGUI pattern:** `cloudscope-app` + `nicewidgets` `RasterViewerWidget`
  show how a Python client will *use* the finished Custom Element. They do not
  own the JS we copy.
- **NicePool pattern:** `@mapmanager/nicepool` package layout + how
  **CloudScope Web** consumes it (`NicePoolPanel.vue`). Do not confuse that
  with the separate Python NicePool inside `nicewidgets`.
- **v1 data model:** the *client* loads 2D planes (`loadPlane`). No OME-Zarr
  or NumPy inside the package.
- **Required v1 APIs:** ROI (including CRUD + local/delegated host modes) and
  in-image XY overlays (canvas, not Plotly).
- **Required v1 viewport:** square vs non-square **home fill** and
  **click+drag zoom** from `cloudscope-web/src/raster-viewer/viewport.js`
  ([02](./02-gui-ux-and-layers.md) §3). Not optional chrome.
- **Not in this package:** Plotly, analysis plot panels, AcqStore, zarrita,
  NumPy HTTP sources, [Viv](https://github.com/hms-dbmi/viv) / chunked OME-Zarr
  streaming (future viewer, separate effort).

## Suggested consumer order (after the package is real)

1. Fully working, tested `@mapmanager/image-viewer` + standalone demos in this
   repo (same bar as NicePool).
2. CloudScope Web replaces vendored `src/raster-viewer/`.
3. NiceWidgets thin adapter (Custom Element host), analogous to `NicePoolWebView`.
4. CloudScope App keeps its view; swap import/config only.

## Banner for every file in this folder

Copy this block at the top of any new note added here:

```text
STATUS: survey / roadmap only. Not API. Not source of truth.
Runtime truth: cloudscope-web/src/raster-viewer/ until @mapmanager/image-viewer ships.
```
