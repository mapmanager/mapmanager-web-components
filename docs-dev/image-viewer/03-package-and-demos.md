# Package sketch and standalone demos

> **STATUS: survey / roadmap only.**  
> Not a public API, not a frozen contract, not implementation source of truth.  
> Folder names, export paths, and Custom Element tags below are
> **recommendations** for `@mapmanager/image-viewer`. The implementing PR may
> change them. Do not treat this file as the package README or as a substitute
> for `cloudscope-web/src/raster-viewer/` until the package exists and
> `npm run check` in `mapmanager-web-components` is green.

## 1. Goal

A fully working, tested **image viewer** in this repo, at the same quality bar
as `@mapmanager/nicepool`: engine, Vue widget, Custom Element, standalone
demo app, unit tests, and a Playwright smoke path.

**Then** (separate work): CloudScope Web replaces vendored JS; NiceWidgets
gains a thin element host; CloudScope App swaps widget import/config.

## 2. Recommended package layout (follow NicePool)

Mirror `packages/nicepool/` without copying Plotly:

```text
packages/image-viewer/
  src/engine/          # lifted raster-viewer modules, renamed image-*
  src/vue/             # thin ImageViewerWidget.vue
  src/element/         # <mapmanager-image-viewer>
  src/app/             # standalone demo (synthetic planes)
  docs/                # real package docs after implementation (not this folder)
  tests/
  e2e/
```

Repo README already lists `@mapmanager/image-viewer` as planned. Prefer that
npm name.

**Recommended Custom Element tag:** `mapmanager-image-viewer`  
(avoids colliding with generic `image-viewer`). Override only if NicePool’s
registered tag convention disagrees when we implement.

**Dependency rule (same as this repo’s AGENTS.md):** no CloudScope, no
AcqStore, no zarrita, no NumPy, no Python adapters inside the package.

## 3. Required v1 public surface (intent, not signatures)

The implementing work **must** expose, in some typed form:

### 3.1 Session / data

- `load(descriptor)` (or equivalent) + required `loadPlane(channel, selection, signal)`.
- Axes on the descriptor carry **step, label, unit**. View events echo
  physical min/max **and unit/label**. No `group: 'time'` in the component.
- Layout: side, stack, single, composite.
- Channel display: LUT, contrast, visibility.
- T/Z (optional dims), sliding-Z **selection** (MIP may remain in the loader).

### 3.2 ROI (including CRUD) — required

- Types: rectangle and line segment (as in current engine).
- `local` vs `delegated` host mode.
- Silent host APIs: replace list, add, update, remove, select.
- User path: select, add, delete, edit, commit, cancel (events in delegated
  mode; mutate in local mode).
- Flags to hide chrome or disable editing without removing the API.

### 3.3 XY overlays — required

- Add / update / remove / show / hide plots in **physical** display coordinates.
- Canvas overlay, **not Plotly**.
- Optional per-channel / per-Z filters as in the current engine.

### 3.4 Viewport fit and drag-zoom — required

Match CloudScope-Web `cloudscope-web/src/raster-viewer/viewport.js`. See
[02-gui-ux-and-layers.md](./02-gui-ux-and-layers.md) §3. Summary:

- Home: square display → contain, equal scale, 0.98 inset, centered.
  Non-square display → independent `scaleX`/`scaleY` that **fill** the plot
  (rectangular pixels allowed).
- Click+drag: square display → forced-square region zoom. Non-square → lock
  to X-only or Y-only from initial mouse movement, then zoom that axis.
- Wheel multiplies both scales by the same factor. Shift+drag pans.
  Double-click restores home.

### 3.5 Out of v1 (explicit)

| Out | Why |
|---|---|
| Plotly | Not used by the raster engine; analysis plots are a different widget |
| OME-Zarr / zarrita | Client loader (CloudScope Web) |
| NumPy / HTTP `data_url` server | NiceWidgets adapter |
| AcqStore models | Client |
| [Viv](https://github.com/hms-dbmi/viv) / chunked mosaic streaming | **Future** MapManager viewer, new effort |
| Packed RGB file decoder | Composite is LUT blend of scalar channels |

## 4. Dual ingest without two engines

One engine, two **client** loaders:

```text
CloudScope-Web-like demo:  loadPlane → in-memory tiles or fetch fixture
NiceGUI-like demo:         Custom Element default loadPlane → GET data_url
                           (fixture HTTP in the demo app, not in engine)

Later production:
  cloudscope-web:  loadPlane → zarrita
  nicewidgets:     loadPlane → fetch(tokenized plane URL from NumPy source)
```

Do **not** put a NumPy bridge in `mapmanager-web-components`. Optional later:
`setPlane` / transferable arrays if HTTP is too slow — not v1.

## 5. Standalone demos (launchpad, not product integration)

Ship **in this repo**, runnable without CloudScope:

### Demo A — Vue / static (CloudScope-Web-like)

- `npm run dev --workspace @mapmanager/image-viewer`
- Synthetic or fixture 2D planes (no live OME-Zarr required for CI).
- Exercise: layouts, LUT/contrast, pan/zoom, T/Z if fixture has them.
- Exercise: square vs non-square **home fill** and (when implemented)
  square rubber-band vs axis-locked X/Y drag-zoom.
- Exercise: **ROI CRUD** (local mode is enough for the demo).
- Exercise: **XY overlay** (e.g. a polyline in physical units).
- Log `view-change` payloads including **units** (prove time is not assumed).

### Demo B — Custom Element (CloudScope-App-like)

- `element-demo.html` (NicePool already has this pattern).
- Same engine; host is plain HTML + element API (`load`, `setRois`, …).
- Optional tiny static file server for `data_url` planes to mimic NiceWidgets.
- This is the launchpad for `nicewidgets` `ImageViewerWebView`, not that wrapper
  itself.

Both demos must be **standalone**. Wiring `cloudscope-web` / `cloudscope-app`
is a later ticket after the package is trusted.

## 6. Implementation slices (recommendation)

Order is a recommendation; PRs may split differently.

1. Scaffold `packages/image-viewer` (vite lib + element + app, like NicePool).
2. Move/port engine modules; rename raster → image in **this package only**.
3. `loadPlane` + descriptor; synthetic demo paints a plane.
4. Toolbar + layouts + LUT/contrast + viewport gestures.
5. ROI overlay + CRUD + delegated events + demo.
6. XY overlay API + demo.
7. Tests (plane cache, orientation, ROI envelopes, overlay normalize) + e2e smoke.
8. **Stop.** Do not edit CloudScope or NiceWidgets until this package demos
   match the UX inventory well enough to replace the vendored copy.

Sliding-Z MIP: keep in demo loaders in slice 3–4; do not block on unifying
Python vs JS MIP.

## 7. Future: Viv / OME-Zarr streaming

A later MapManager component may stream chunked/mosaic OME-Zarr via
[Viv](https://github.com/hms-dbmi/viv) (WebGL, pyramid, deck.gl layers).

That is **not** an evolution of `loadPlane` in disguise. It is a different
renderer and data path. v1 stays CPU/canvas + client-supplied 2D planes so
NiceGUI in-memory NumPy and CloudScope Web zarrita-per-plane both work.

These roadmap files should not be updated as if Viv were in scope.

## 8. Docs after implementation

When the package is real, **package** docs live under
`packages/image-viewer/docs/` (architecture, data API, GUI contract) — written
from the **new** code, not copied blindly from this `docs-dev/` survey.

This `docs-dev/image-viewer/` folder can then be marked historical or deleted
in a dedicated docs pass. Until then, treat it as roadmap only.
