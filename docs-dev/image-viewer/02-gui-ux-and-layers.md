# GUI / UX inventory and canvas layers

> **STATUS: survey / roadmap only.**  
> Not a public API, not a frozen contract, not implementation source of truth.  
> This is an inventory of **current CloudScope Web engine chrome**
> (`cloudscope-web/src/raster-viewer/`) plus which of that chrome
> `ImageViewer.vue` turns on.  
> `@mapmanager/image-viewer` should cover this surface (and may regroup
> controls) but is not required to clone CSS pixel-for-pixel.

**Plotly is not part of this inventory.** In-image traces are canvas overlays
(`xy-plot-overlay.js`). App-level analysis plots (`XYPlot.vue` / Plotly) are a
different widget and stay out of the image-viewer package.

## 1. Layer stack (required in the MapManager component)

Each image pane is stacked canvases, back to front (approximate current DOM
order):

| Z (back → front) | Surface | Module | Interactive? |
|---|---|---|---|
| 0 | Channel bitmap (LUT + contrast) | `raster-viewer.js` `renderBitmap` + `viewport.js` | Pan/zoom hit-target |
| 1 | XY overlay (lines / markers) | `xy-plot-overlay.js` | No (draw-only today) |
| 2 | ROI overlay (rect, line segment, handles) | `roi-overlay.js` | Yes when editing / select |
| — | Axis ticks / labels | `viewport.js` (same bitmap canvas gutters) | No |

**v1 requirement:** the public API must let a host drive layers 0, 1, and 2
independently: set planes + display, add/update/hide XY plots, and ROI CRUD
(local or delegated).

### 1.1 Bitmap layer

- Multi-channel layouts: `side` (side-by-side), `stack` (vertical), `single`,
  `composite` (additive LUT blend — **not** packed RGB dtype).
- Per-channel: enable, LUT (gray, red, green, blue, cyan, magenta, yellow,
  fire, viridis, magma), contrast min/max (histogram popover; autoscale if
  descriptor range is null).
- Copy-view button (Clipboard API, or host PNG bridge).

`ImageViewer.vue` does not set layout; engine default is `side` (forced
`single` if one channel). CloudScope App often sets `composite` before load.

### 1.2 ROI layer (CRUD required)

Types in the current engine: `rectroi`, `linesegmentroi`. Coordinates are
source row/col (viewer applies display orientation).

**Host modes:**

| Mode | Who mutates the ROI list |
|---|---|
| `local` | Engine (demo / mock) |
| `delegated` | Host; engine emits `*-request` events; host calls silent `addRoi` / `updateRoi` / `removeRoi` / `setRois` |

**Chrome (when `roiChromeEnabled` and toolbar visible):**

- Dropdown select
- If `roiEditingEnabled`: add, delete, edit, commit, cancel
- Menu toggles: show ROIs, show ROI toolbar

**Pointer:** idle click-select; create/edit drafts with handles; Esc cancels
in delegated mode via `requestRoiEditCancel`.

**CloudScope Web primary:** chrome on, **editing off**, **delegated**
(select-only). CloudScope App: delegated **with** full CRUD chrome.

**MapManager v1:** ship **both** modes and full CRUD chrome, with flags to
disable editing or hide the strip (do not strip CRUD from the engine to match
today’s Web host).

Silent vs user-originated: `selectRoi(..., { emit: false })` is the host-sync
path (avoids feedback loops). Same pattern as today.

### 1.3 XY overlay layer (required)

Physical-space traces: `{ plot_id, x[], y[], mode, style, visible, channel_ids?, z_index? }`.
`coordinate_space` is `'physical'` only. Non-finite x/y become gaps.

Engine methods today: `addXYPlot`, `updateXYPlot`, `removeXYPlot`,
`showXYPlot`, `hideXYPlot`.

**CloudScope Web usage:** `ReferenceImageInspector.vue` scan path (lines,
yellow). **Not** used by primary `ImageViewer.vue`.

**Not this layer:** Plotly analysis charts beside the image in `App.vue`.

**v1:** public overlay API required even if the first Vue demo only shows a
synthetic polyline. Keep overlays non-interactive unless a later ticket adds
picking.

## 2. Top toolbar (engine)

Left → right (document order today):

1. **Viewer options** (hamburger): Axes, ROIs, Channel toolbars, ROI toolbar,
   Reset view.
2. **Layout radios** (hidden if one channel): Side by side, Stacked, One
   channel, Composite.
3. **Channel `<select>`** (only `single` + ≥2 channels).
4. **Sliding-Z** (if Z size ≥ 1): enable + ± radius, MIP via loader.
5. **ROI strip** (if chrome on).

**T/Z sliders** sit on a designated pane body (last pane, or first if
stacked), not on the top strip.

### Hotkeys (pointer-activated viewer)

| Key | Action |
|---|---|
| `1` / `2` | Single-channel 0 / 1 (if ≥2 channels) |
| `3` | Composite |
| Enter | Reset view |
| Esc | Close options menu, or cancel ROI edit |

Ignore when focus is in an editable control. Only the last pointer-activated
viewer instance handles layout/reset keys.

## 3. Viewport gestures (`viewport.js`)

| Gesture | Action |
|---|---|
| Wheel | Zoom about cursor (`wheelZoomFactor`, default ~1.06) |
| Alt/Option + wheel | Step Z, else T (invertible) |
| Drag | Region zoom; elongated drag → axis-locked X or Y |
| Shift + drag | Pan |
| Double-click | Reset that pane |

Pan/zoom is **snapshotted** across layout rebuilds so 1/2/3 and radios do not
home the view.

View-change events include `cause` (`pan`, `region`, `wheel`, `reset`,
`api-x-range`, …) and `physical_range` with **unit and label** on both axes.
Programmatic API causes must not echo into host linking.

## 4. What CloudScope Web turns on

| Feature | `ImageViewer.vue` | `ReferenceImageInspector.vue` |
|---|---|---|
| Dark theme | yes | yes |
| ROI chrome | yes | no |
| ROI editing | **no** | n/a |
| ROI host | delegated | n/a |
| Sliding-Z MIP in loader | yes | no |
| T/Z from engine | yes (synced to app) | no (2D / C,Y,X) |
| XY overlay | no | **scan path** |
| Clipboard bridge | no | no |
| Linked X as time | **yes (Vue only)** | no |

`SelectedAcqImageBar` is currently hidden so the engine owns C / ROI / Z / T.

## 5. Accessibility / chrome notes (survey)

- Layout radios and many buttons use `aria-label` + tooltip dataset.
- Contrast popover is a custom overlay, not a native dialog.
- Loading/error strings in Vue wrap the host; the engine also emits
  `raster-error`.

These can be improved in the package; this list is descriptive, not a WCAG
gate.

## 6. Screenshot checklist (later, not blocking these docs)

When implementing demos, capture: side / stack / single / composite; LUT +
contrast popover; ROI select + edit draft; XY overlay on reference-style
image; wheel zoom + shift-pan; linked X range **with units shown in the
event payload** (even if the demo only logs it).
