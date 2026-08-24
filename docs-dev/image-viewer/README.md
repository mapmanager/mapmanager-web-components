# Image viewer — survey and roadmap

> **PLANNING ONLY — not source of truth, not a lock, not an API.**
>
> These files say what we **plan to build** in `@mapmanager/image-viewer`
> (`mapmanager-web-components`). They must **never** block implementation.
> If this text disagrees with current work (including **using Viv**), the
> **code** in `packages/image-viewer/` wins. Do not treat an old sentence
> here as a veto.
>
> CloudScope-Web `cloudscope-web/src/raster-viewer/` is the UX we plan to
> match. It is a reference, not a second source of truth.

## What this folder is

Planning material for a reusable **image viewer** in `mapmanager-web-components`:
CloudScope-Web raster UX, Viv for HTTP OME-Zarr pyramids, standalone demos,
then later thin clients in CloudScope-Web and CloudScope-App.

## Package name (proposed)

`@mapmanager/image-viewer`

Rename **raster → image** only inside `mapmanager-web-components`. Existing
CloudScope / NiceWidgets names stay until those repos consume the package.

## Files

| File | Purpose |
|---|---|
| [01-survey-cloudscope-web.md](./01-survey-cloudscope-web.md) | How CloudScope-Web’s engine works (reference, not a lock) |
| [02-gui-ux-and-layers.md](./02-gui-ux-and-layers.md) | Toolbar / gestures / layers we **plan** to implement |
| [03-package-and-demos.md](./03-package-and-demos.md) | Package shape, planned APIs, demos |
| [04-phase1-handoff.md](./04-phase1-handoff.md) | Dated diary of a 2026-08-24 stop — **historical**, not architecture law |

## Planning intent (not a lock)

What we **plan** to do. None of this forbids a later product decision.

- **UX reference:** CloudScope-Web `cloudscope-web/src/raster-viewer/`.
- **Do not copy into this package:** CloudScope-Web `ImageViewer.vue` (AcqStore adapter).
- **HTTP images:** Viv in **this** package (pyramids). Single-level small YX may decode one plane into RAM.
- **Planned APIs:** ROI (CRUD, local/delegated), in-image XY overlays (canvas, not Plotly), viewport home-fill and click+drag zoom ([02](./02-gui-ux-and-layers.md) §3).
- **Stay out of this package:** Plotly analysis plots, AcqStore models, CloudScope-App Python.

## Suggested consumer order (after the package is trusted)

1. Working, tested `@mapmanager/image-viewer` + standalone demos in this repo.
2. CloudScope-Web replaces vendored `src/raster-viewer/`.
3. NiceWidgets thin Custom Element host.
4. CloudScope-App swaps widget import/config only.

## Banner for any new note in this folder

```text
PLANNING ONLY. Not source of truth. Not a lock. Must not block implementation.
Code: packages/image-viewer/. UX reference: cloudscope-web/src/raster-viewer/.
```
