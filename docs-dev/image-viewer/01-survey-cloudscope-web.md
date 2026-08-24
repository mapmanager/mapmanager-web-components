# Survey: CloudScope Web raster engine

> **STATUS: survey / roadmap only.**  
> Not a public API, not a frozen contract, not implementation source of truth.  
> Runtime truth: `cloudscope-web/src/raster-viewer/` until
> `@mapmanager/image-viewer` exists and is tested.  
> Names below (`RasterViewer`, `raster-*` events) are **current CloudScope Web**
> names. The MapManager package is expected to use **image** naming.

## 1. What we are looking at

Three layers in CloudScope Web, only the first is the lift target:

| Layer | Path | Lift? |
|---|---|---|
| Engine | `cloudscope-web/src/raster-viewer/` | **Yes** |
| Primary Vue host | `cloudscope-web/src/components/ImageViewer.vue` | No — AcqStore client |
| Second Vue host | `cloudscope-web/src/components/ReferenceImageInspector.vue` | No — another client |

`App.vue` mounts `ImageViewer` next to collection UI and **separate** analysis
plots. Those analysis plots are **not** part of the raster engine and are
**out of scope** for `@mapmanager/image-viewer`.

## 2. Engine shape (as implemented today)

`RasterViewer` is a framework-free class:

- Constructor takes an empty `HTMLElement` plus options.
- It builds toolbar + stage with DOM APIs (not Vue).
- It talks to hosts via methods, constructor options, and bubbling
  `CustomEvent`s on `host`.

Modules (sibling files under `src/raster-viewer/`):

| Module | Role |
|---|---|
| `raster-viewer.js` | Shell, toolbar, layouts, plane updates, event dispatch |
| `raster-viewer.css` | Chrome |
| `viewport.js` | Pan / zoom / axes canvas |
| `plane-cache.js` | Decode + transpose; calls injected `loadSourcePlane` |
| `lut.js` / `contrast-range.js` | Color LUT + contrast popover |
| `orientation.js` | Required transpose + flip-Y |
| `roi-overlay.js` | Rect + line-segment ROIs |
| `xy-plot-overlay.js` | Physical X/Y traces drawn **on the image** (canvas, not Plotly) |
| `clipboard.js`, `theme.js`, `tooltip.js`, `icons.js` | Chrome helpers |

**Plotly is not used** in this tree. In-image traces are 2D canvas overlays.

## 3. Data in: descriptor + lazy 2D planes

The engine does not open files. A host:

1. Builds a schema **2.0** descriptor (sizes, axes with step/label/unit,
   channels with LUT/contrast, optional ROIs).
2. Supplies `loadSourcePlane(channel, selection, signal) => ArrayLike<number>`.
3. Calls `viewer.load(descriptor)`.

`PlaneCache` then fetches planes, checks sample count, **transposes** source YX
to display XY (flip-Y). Display-X is whatever the descriptor’s X axis says
(seconds, microns, pixels, …). The engine does not require time-on-X.

CloudScope Web’s `ImageViewer.vue` currently **interprets** display-X as time
when forwarding range events to analysis plots. That policy stays in the
**client**, not in the reusable package.

### Sliding-Z max intensity

The engine UI can request `plus_minus_z` on the plane selection. In CloudScope
Web, **MIP is implemented in `ImageViewer.vue`** (`slidingZ.ts`), not in
`plane-cache.js`. NiceWidgets does MIP in Python instead. v1 package
recommendation: keep MIP in **loaders**, not in the engine core (see
`03-package-and-demos.md`).

## 4. How CloudScope Web initializes (primary image)

`ImageViewer.vue` `onMounted`:

```text
new RasterViewer(hostDiv, {
  theme: 'dark',
  roiChromeEnabled: true,
  roiToolbarVisible: true,
  roiEditingEnabled: false,   // display/select only in this client
  roiHostMode: 'delegated',
  hostClipboardBridge: false,
  loadSourcePlane,
})
probe one OME-Zarr plane via props.loadPlane (zarrita)
buildRasterDescriptor(...)
viewer.load(descriptor)
selectChannel / setZIndex / setTIndex / selectRoi / optional setXRange
```

Pixels arrive only through `loadSourcePlane` → zarrita. The engine never holds
the volume.

## 5. Events out (engine → host)

Current event names (will be renamed in the package; this list is a survey):

| Event | Typical payload use |
|---|---|
| `raster-ready` | Dataset id, full physical X |
| `raster-view-change` | Viewport + `physical_range.x/y` with **label and unit** |
| `raster-channel-selected` | Channel id |
| `raster-plane-change` | `t_index`, `z_index`, `plus_minus_z` |
| `raster-display-change` | LUT / contrast / visibility per channel |
| `raster-roi-select` | `roi_id` |
| `raster-roi-add-request` / `delete-request` / `edit-request` / `edit-cancel-request` | Delegated CRUD |
| `raster-roi-create` / `raster-roi-edit-commit` | Local (or committed) geometry |
| `raster-roi-state-change` | Idle / creating / editing |
| `raster-toolbar-action` | Layout, axes toggle, reset, … |
| `raster-copy-view-request` | PNG data URL when clipboard API missing |
| `raster-error` / `raster-performance` | Diagnostics |

`ImageViewer.vue` currently **drops unit/label** and emits Vue
`x-range-change` with `group: 'time'`. The engine already has units; the
MapManager package must keep units on the event and **must not** hard-code time.

## 6. How CloudScope App / NiceWidgets use the older copy (pattern only)

`cloudscope-app` does **not** own JS. `PrimaryImageViewV2` constructs
`nicewidgets.RasterViewerWidget`, which:

- Registers a `NumPyRasterSource` (in-memory arrays, already loaded).
- Serves descriptor JSON + per-plane `data_url` over HTTP.
- The **older** JS copy `fetch`es those URLs.

Callbacks (`on_view_change`, `on_channel_selected`, ROI request handlers, …)
become CloudScope intents. This is the **NiceGUI client pattern** for the
future Custom Element: Python owns arrays and CRUD authority; the browser
component owns drawing and chrome.

Do not copy `nicewidgets/.../web/raster-viewer.js` as the engine source of
truth. Use it as the adapter/HTTP-plane pattern.

## 7. How CloudScope Web uses `@mapmanager/nicepool` (pattern to copy)

Confirmed: **`cloudscope-web`** is the MapManager NicePool consumer
(`package.json` `file:../mapmanager-web-components/packages/nicepool`,
`NicePoolPanel.vue`).

That is the pattern for the image viewer after it exists:

- Vue app imports the **library** build.
- NiceGUI later loads the **Custom Element** build via a thin NiceWidgets
  wrapper.

`nicewidgets` also contains a **different**, older Python NicePool widget.
Ignore that when copying package layout.

## 8. Second CloudScope Web host (not the lift, but proves APIs)

`ReferenceImageInspector.vue` also instantiates `RasterViewer`:

- `roiChromeEnabled: false`
- No T/Z
- Calls `addXYPlot` / `showXYPlot` / `hideXYPlot` for a **scan path** in
  physical coordinates

So XY overlay is **engine-complete** and **used in CloudScope Web**, just not
by the primary kymograph `ImageViewer.vue`.

## 9. Orientation contract (survey)

Current engine **requires** `display_orientation: { transpose: true, flip_y: true }`.
ROIs and XY plots are specified in **source** or **physical** space; the
viewer maps them onto display. Hosts must not pre-transpose ROI geometry.

This constraint may be relaxed later; v1 should preserve it unless a demo
proves a safer default.

## 10. What the Vue file owns (stays in CloudScope Web)

- OME-Zarr / zarrita `loadPlane`
- `buildRasterDescriptor` from AcqImage JSON
- Sliding-Z MIP over fetched planes
- Mapping view-change → plot-linked time
- Loading / error chrome around the host `div`

None of that belongs in `@mapmanager/image-viewer`.

## 11. Viewport fit and drag-zoom (v1 requirement)

This is missing from older notes in this folder and **is required** for
`@mapmanager/image-viewer`. Source of truth today is CloudScope-Web
`cloudscope-web/src/raster-viewer/viewport.js` (`fit`, `dragZoomMode`,
`selectionRect`, `zoomRegion`, `zoomAxis`, `drawRegionGuide`).

Compare **display** bitmap `width` vs `height` (after orientation), not source
YX before transpose.

**Home / fill (`fit`):**

- `width === height`: square pixels. One scale = `min(viewW/W, viewH/H) * 0.98`,
  centered in the plot.
- `width !== height`: fill the plot. `scaleX = viewW/W`, `scaleY = viewH/H`.
  Rectangular pixels are allowed; no letterbox.

**Click+drag zoom:**

- Square display: rubber-band is forced **square**; mouse-up zooms to that
  square (`zoomRegion`).
- Non-square display: after an 8 px movement threshold, lock to X-only or
  Y-only from the dominant initial axis; draw a full-height or full-width
  band; mouse-up zooms that axis only (`zoomAxis`).

Full gesture table and constants: [02-gui-ux-and-layers.md](./02-gui-ux-and-layers.md) §3.
