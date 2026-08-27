# Architecture

The viewer keeps storage, image state, rendering, and presentation boundaries
small and explicit.

```text
client source adapter -> ImageViewerEngine -> Viv/Deck.gl pane rendering
                                  |                 ^
                                  `-> Vue widget ---'
                                           |
                                           `-> Custom Element host
```

## Boundaries

- `src/engine/` owns source validation and loading, plane selection, channel
  state, contrast, layouts, axes, overlays, ROIs, and view calculations.
- `src/vue/` renders controls and image panes and relays user intent.
- `src/element/` provides the framework-neutral browser boundary.
- `src/app/` is the standalone development application, not package API.

Clients that own a storage format should adapt it to `AsyncPlaneSource` rather
than adding application-specific storage logic to the viewer. Native OME-Zarr
loading is the exception because it is a viewer-supported interoperable image
format.

Source and plane switches are prepared before publication so an operation does
not expose partially updated frames. The previous complete frame remains
visible until the replacement can be committed.
