# ROI pointer-draw (deferred edit)

> **PLANNING ONLY — not source of truth, not a lock, not an API.**
>
> Memory of a pointer-draw add path we shipped then replaced. Keep this when
> we implement **ROI edit**. Runtime truth is `packages/image-viewer/`.

## Current product (do not regress)

- **Add rect** / **Add line**: insert a default shape in the **current view**
  (`defaultRectDisplay` 40%, `defaultLineDisplay` 60% width). Select it.
- **Delete ROI** removes the selection.
- **Click** picks an ROI (`pickObject`). No handles. **Edit is deferred.**

## Pointer-draw add (what we had)

Same pointer pipeline as drag-zoom, with a tool mode:

| Piece | Behavior |
|---|---|
| Tool | `idle` \| `add-rect` \| `add-line` (toolbar toggle) |
| `pointerdown` | Capture; store start in pane CSS pixels |
| `pointermove` | Rubber-band `guide` overlay (axis-aligned box) |
| `pointerup` | `screenToWorld` both corners → `displayToSource` → `engine.addRoi` |

Line matched rect: **drag** start→end, not two-click (two-click fought
double-click home).

World mapping was `viewport.unproject` on the pane Deck, then
`displayToSource` so ROI stays in **source** row/col (same as overlays).

Constants already in `drag-zoom.ts`: `AXIS_LOCK_PIXELS = 8`,
`MIN_REGION_PIXELS = 12`. Ignore a release shorter than 12 px.

## What to reuse for edit later

- Rubber-band: `selectionRect` / `guideRect` (already used for **zoom**).
- Hit-test: `deck.pickObject` on rect `PolygonLayer` / line `PathLayer`.
- Do **not** invent a second coordinate space. Keep source coords +
  `sourceToDisplay` at draw time.
- Edit handles would be extra pickable points on the selected ROI only.

## What not to copy

- Do not put ROI draw on the **shared** multi-view Deck (`viewIds` split).
  Draw in the **pane** that received the pointer (`ImagePane.vue`).
- Do not use two-click line while double-click is home.
