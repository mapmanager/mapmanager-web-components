# Image viewer Phase 1 handoff — 2026-08-24

> **HISTORICAL PLANNING NOTE — not source of truth, not a lock.**
>
> Dated diary of a stop on 2026-08-24. Must **never** block current
> implementation. Architecture sentences below (including “revert zarrita
> plane” / “Viv is future”) are **not** rules. Runtime truth is
> `packages/image-viewer/` as it exists now.

Stopped on purpose after ~100 minutes stuck on a simple OME-Zarr load.
This is a resume note, not a public API and not a ticket report.

**Do not continue guessing URL/Vite tweaks.** The remaining problem is
understood (below). The last implementation detour is the wrong architecture.

## Status in one paragraph

`@mapmanager/image-viewer` exists in `mapmanager-web-components`. Synthetic
**YX / CYX / ZCYX** display in the demo with ROI + XY overlays. Manning OME-Zarr
does **not** display. The demo already points Viv/the loader at a **nested
image group** (`acq_images/acq_image_340`), not the collection root. The
failure is: some fetch of that store hits Vite’s SPA `index.html`
(`Unexpected token '<', "<!doctype "... is not valid JSON`). A later change
decoded the whole plane with zarrita and fed Viv an in-memory array. That
**defeats Viv’s tiled/GPU OME-Zarr path** and must be reverted.

## What works

- Package layout (NicePool-like): `src/engine`, `src/vue`, `src/element`, `src/app`
- Element: `<mapmanager-image-viewer>`
- Deck.gl **9.1.11** + luma.gl **9.1.9** pinned in package + root `overrides`
  (Viv 0.19 will pull 9.3 and break if unpinned)
- Vite `resolve.dedupe` for deck/luma in app/element configs
- In-memory `PlaneSource` + `TiledPlanePixelSource` + `MultiscaleImageLayer`
- Demo buttons: YX, CYX, ZCYX, Manning YX kymo, Manning reference
- Unit tests: 10 passing (`npm test --workspace @mapmanager/image-viewer`)
- Typecheck was green after the zarrita detour
- NicePool was kept green earlier (`npm run check` includes Playwright on
  **nicepool only**). Do not point Playwright at image-viewer without a new
  project config — that would break NicePool `check`.

## What does not work

Manning kymo and Manning reference in the demo. Browser error:

```text
Unexpected token '<', "<!doctype "... is not valid JSON
```

### Measured facts (not guesses)

Collection root disk path:

```text
/Users/cudmore/Sites/cs_project/cloudscope-data/ome-zarr-output/manning-velocity-20260625-v2.ome.zarr
```

That root `zarr.json` is an empty group (`attributes: {}`). **Not** an OME image.

Child kymo (what the demo uses):

```text
…/manning-velocity-20260625-v2.ome.zarr/acq_images/acq_image_340
```

NGFF 0.5, zarr v3, YX uint16 **30000×24**, blosc/zstd. `zarr.json` has
`attributes.ome.multiscales`.

Child reference:

```text
…/acq_images/acq_image_340/reference
```

Pyramid. Finest `0` is 512×512 uint16.

Dev HTTP (Vite `sirv`, CloudScope Web pattern):

```text
http://127.0.0.1:<port>/__dev_collection__/acq_images/acq_image_340/zarr.json
```

returns JSON (`Content-Type: application/json`, has `ome`).

```text
http://127.0.0.1:<port>/__dev_collection__/acq_images/acq_image_340/
```

returns **HTML** (Vite app shell). That is the doctype error.

We did **not** load `acq_image_007`. User agreed to keep **340** as the demo kymo.

## Architecture that is agreed (resume with this)

1. **Caller** gives the reader the **child image group URL**, not the
   collection `.ome.zarr` root. Same join as CloudScope Web:
   `new URL(ome_zarr_path + '/', collectionRoot)`.
2. **Viv** (`loadOmeZarr` + `MultiscaleImageLayer`) is the OME-Zarr
   reader/renderer: tiles, pyramid, GPU. Do not decode the full plane in JS
   and wrap it as `TiledPlanePixelSource`.
3. Synthetic YX/CYX/ZCYX stay in-memory planes (Viv layer over
   `TiledPlanePixelSource` is fine for those).
4. Auto-load Manning in the **demo** needs no directory picker. Picker is only
   for a user choosing a folder (Chrome/Edge). CloudScope Web has both:
   `sirv` + `/__dev_collection__/` (dev) and `showDirectoryPicker` (user).
5. Demo sample: **acq_image_340**, not 007.

Do **not** copy the `@hms-dbmi/viv` / `openGroup` / `LayerManager` sample as
source of truth. This package uses Viv **0.19** (`@vivjs/loaders` /
`@vivjs/layers`) and deck.gl 9.1.

## Wrong detour currently on disk (revert first)

`viewer-engine.ts` `#loadOmeZarr` calls `loadOmeZarrPlane` in
`src/engine/ome-zarr-loader.ts`: zarrita `fetch(zarr.json)` then `zarr.get`
of a full YX plane, then `#loadPlane` / `TiledPlanePixelSource`.

That copies CloudScope Web’s **plane** loader (canvas RasterViewer), not Viv.
User rejected it: it does not use Viv’s optimized OME-Zarr path.

Also added deps that exist only for that detour: `zarrita`, `numcodecs`.
Keep them only if a later design still needs zarrita. Resume should restore
`loadOmeZarr` from `@vivjs/loaders` for `kind: 'ome-zarr'`.

## Files that matter

| Path | Role |
|---|---|
| `packages/image-viewer/src/engine/viewer-engine.ts` | `setSource`; currently wrong ome-zarr path |
| `packages/image-viewer/src/engine/ome-zarr-loader.ts` | zarrita full-plane load — **revert/remove for Viv design** |
| `packages/image-viewer/src/engine/tile-source.ts` | in-memory tiled PixelSource (synthetics) |
| `packages/image-viewer/src/vue/ImageViewerWidget.vue` | Deck + `MultiscaleImageLayer` |
| `packages/image-viewer/src/app/App.vue` | demo; Manning URLs from Vite `define` |
| `packages/image-viewer/sample-paths.ts` | child rel paths `acq_image_340` |
| `packages/image-viewer/vite.config.ts` | `sirv` at `/__dev_collection__/`, deck/luma dedupe |
| `packages/image-viewer/package.json` | Viv 0.19, deck 9.1.11, luma 9.1.9 |
| repo `package.json` `overrides` | same deck/luma pins |

CloudScope Web (read-only reference, do not import at runtime):

- `cloudscope-web/vite.config.ts` — `sirv(ACQSTORE_OME_ZARR_ROOT)` at `/__dev_collection__/`
- `cloudscope-web/src/data/omeZarrLoader.ts` — `zarr.json` then zarrita `get` (their canvas viewer)
- `cloudscope-web/src/data/acqImageCollectionLoader.ts` — `childRoot = new URL(ome_zarr_path + '/', root)`

## How to start again

Repo: `mapmanager-web-components/` (independent git repo). `cs_project/` is not a git repo.

```bash
cd /Users/cudmore/Sites/cs_project/mapmanager-web-components
npm test --workspace @mapmanager/image-viewer
npm run typecheck --workspace @mapmanager/image-viewer
npm run dev --workspace @mapmanager/image-viewer -- --host 127.0.0.1 --port 4177
```

Demo: `http://127.0.0.1:4177/`

Sanity **before** clicking Manning:

```bash
curl -sS -D - -o /tmp/z.json \
  'http://127.0.0.1:4177/__dev_collection__/acq_images/acq_image_340/zarr.json' | head
# body must start with `{` and include `"ome"`
```

If a directory URL returns HTML, that is expected from Vite today. Viv must
not JSON-parse that response.

**Do not** add a second Playwright project without updating
`playwright.config.ts`. Root `npm run check` is NicePool e2e on 4173.

**Do not** commit unless asked. Work was on the current branch / main working
tree (user commits as they go).

## Recommended next implementation (one problem, one fix)

1. Revert `#loadOmeZarr` to Viv `loadOmeZarr(childUrl, { type: 'multiscales' })`.
2. Keep `sirv` + child URLs (`/__dev_collection__/acq_images/acq_image_340/`).
3. Fix **one** transport bug: Viv’s FetchStore GETs the store URL; Vite answers
   HTML for the directory. Plan, then implement **one** of:
   - **A (recommended):** wrap `fetch` so a GET of a `/__dev_collection__/.../`
     directory is turned into `.../zarr.json` (and leave chunk paths alone), **or**
   - **B:** Vite middleware under `/__dev_collection__/` must not fall through
     to `index.html` for missing/directory keys (404 instead of SPA HTML).
4. Browser: Manning kymo shows ~30000×24; reference shows a pyramid; synthetics
   still work.
5. If (4) still shows doctype: **stop**. Log the exact failing URL from
   DevTools Network (filter `zarr.json` / `.zarray` / first HTML 200). Do not
   add another loader.

Do not mix A+B+zarrita-plane in the same pass.

## Explicit non-goals (until asked)

- Chrome/Edge directory picker
- CloudScope Web / NiceWidgets / cloudscope-app integration
- `side` / `stack` as real multi-pane layouts (UI-only today)
- Image-viewer Playwright
- Loading collection root as if it were one image
- Changing demo image from 340 to 007

## Why this took so long (so the next agent does not repeat it)

Guesses that failed: Vite `/@fs` URLs, extra ports (4174/4175/4176), treating
the collection root as an image, replacing Viv with a full-plane zarrita load.
The nested child path was already correct. The HTML response is Vite SPA
fallback on a **directory** GET. Fix that contract; do not invent a third
reader.
