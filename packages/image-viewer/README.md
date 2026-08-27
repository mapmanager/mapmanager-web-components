# `@mapmanager/image-viewer`

A reusable Deck.gl/Viv scientific image viewer for Vue and framework-neutral
Custom Element clients. It supports in-memory and lazy YX planes, URL and local
directory OME-Zarr sources, channel layouts and composites, contrast and color
maps, calibrated axes, ROIs, XY overlays, and view copying.

The component is actively developed, used by
[AcqView](https://github.com/mapmanager/acqview), and currently pre-1.0. API
changes remain possible and are recorded in the repository changelog.

## Development

```bash
npm ci
npm run dev --workspace @mapmanager/image-viewer
npm test --workspace @mapmanager/image-viewer
npm run build --workspace @mapmanager/image-viewer
```

The standalone demo includes synthetic YX, CYX, and ZCYX sources. The custom
element development host is `element-demo.html`.

## Documentation

See the repository documentation for:

- [source types and lazy planes](../../docs/image-viewer/sources.md)
- [Vue integration](../../docs/image-viewer/vue-integration.md)
- [Custom Element integration](../../docs/image-viewer/custom-element.md)
- [local and remote OME-Zarr](../../docs/image-viewer/ome-zarr.md)
- [ROIs and XY overlays](../../docs/image-viewer/overlays-and-rois.md)
- [architecture and package boundaries](../../docs/image-viewer/architecture.md)
