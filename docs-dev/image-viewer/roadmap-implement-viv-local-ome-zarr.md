# Roadmap: Implement Viv Local OME-Zarr Loading

> [!CAUTION]
> **This document is a roadmap, not a source of truth.** It records a proposed
> implementation based on the repository and upstream projects as inspected on
> 2026-08-24. Before changing code, the implementing agent must verify every
> dependency API, version constraint, browser capability, file path, and current
> behavior against the checked-out source, installed packages, lockfile, and
> authoritative upstream documentation. When this roadmap conflicts with the
> current code, tests, repository instructions, or verified upstream APIs, those
> sources take precedence. Do not preserve a roadmap assumption merely because
> it is written here.

## Purpose

Allow the MapManager image viewer to open a user-selected local OME-Zarr image
directory directly in Viv, without uploading the dataset and without requiring
a separate local data server.

The permanent implementation should support two explicit OME-Zarr transports:

1. an HTTP(S) URL for hosted data; and
2. a browser-authorized local directory backed by a
   `FileSystemDirectoryHandle` and exposed to Viv as a Zarrita-compatible
   readable store.

A literal `file://` URL is not the implementation target. A Vite application
cannot reliably use `fetch()` to traverse an arbitrary local directory through
`file://`. Local filesystem access must be granted through a browser picker or
provided through HTTP.

## Desired final implementation

The final local-data path should be:

```text
User clicks "Open local OME-Zarr"
    -> browser grants a FileSystemDirectoryHandle
    -> a lazy, read-only Zarrita store resolves requested Zarr keys
    -> Viv loadOmeZarrFromStore constructs its multiscale PixelSources
    -> the existing orientation, contrast, selection, and rendering pipeline runs
```

The existing remote-data path should remain:

```text
HTTP(S) OME-Zarr child-image URL
    -> Viv loadOmeZarr
    -> the same downstream image-viewer pipeline
```

The feature is complete only when both paths work and the remote path has not
regressed.

## Scope

This roadmap concerns only `packages/image-viewer` and the repository-level npm
metadata required to keep its dependency graph coherent.

In scope:

- upgrading the coordinated Viv packages from the currently pinned `0.19.0`;
- adding a lazy browser-directory store;
- integrating URL-backed and store-backed OME-Zarr loading;
- adding a local-directory action to the image-viewer demo or appropriate
  viewer-facing API;
- focused unit, build, and live-browser verification;
- preserving remote OME-Zarr, synthetic planes, orientation, overlays, LUTs,
  contrast, and Z/C/T selection.

Out of scope unless separately requested:

- importing CloudScope-specific orchestration or AcqStore transport behavior;
- changing sibling repositories;
- treating a collection root as an image group;
- implementing a desktop/native filesystem API;
- using a mandatory localhost data server as the permanent design;
- global replacement or monkey-patching of `window.fetch`;
- eagerly reading every chunk of a large OME-Zarr into memory;
- unrelated viewer refactoring.

## Verified repository state

The implementing agent must re-check these facts because the working tree is
active and may have changed.

### Current dependencies

At inspection time, `packages/image-viewer/package.json` pins:

- `@vivjs/extensions`: `0.19.0`;
- `@vivjs/layers`: `0.19.0`;
- `@vivjs/loaders`: `0.19.0`;
- Deck.gl packages: `9.1.11`;
- Luma.gl packages: `9.1.9`;
- direct `zarrita`: `^0.7.4`.

The repository root also overrides the Deck.gl and Luma.gl versions. These pins
are deliberate integration constraints, not incidental package versions.

Viv 0.19's public `loadOmeZarr` constructs its own `FetchStore` from a URL. The
public `loadOmeZarrFromStore` integration point was introduced after 0.19 (in
Viv 0.20 according to the inspected upstream changelog). Therefore the present
code cannot simply import that function without upgrading Viv.

### Current image path

At inspection time:

- `OmeZarrSource` contains `kind`, `id`, and a required `url`;
- `ViewerEngine.#loadOmeZarr` first calls the local
  `loadOmeZarrPlaneIfSmall` helper;
- small, single-resolution images may be decoded with direct Zarrita and then
  wrapped as an in-memory plane;
- other images use Viv `loadOmeZarr(url, { type: 'multiscales' })`;
- Viv PixelSources are wrapped by the local `OrientedPixelSource` adapter;
- `ImagePane.vue` renders them with `MultiscaleImageLayer` and Viv extensions.

The local-directory design must account for both current OME-Zarr branches. It
must not make only the Viv tiled branch local-aware while leaving the
small-plane probe dependent on global HTTP `fetch()`.

### Existing development server path

`packages/image-viewer/vite.config.ts` already mounts a configured sample root
under a development URL with `sirv`. This is useful for demos and HTTP control
tests. It is not the same feature as allowing an end user to choose an arbitrary
local OME-Zarr directory.

Do not remove or redesign the existing Vite sample path as part of this work
unless a verified incompatibility makes a narrowly scoped change necessary.

## Why the Viv upgrade is a separate high-risk phase

The upgrade from Viv 0.19 is required for the recommended public
`loadOmeZarrFromStore` approach, but it can break code unrelated to local file
loading. Treat it as an isolated compatibility migration with its own rollback
point and verification gate.

### Observed upgrade friction

1. **Viv, Deck.gl, and Luma.gl are a coordinated stack.**
   `@vivjs/layers` depends directly on Viv extensions/loaders/types and on
   specific Deck/Luma ranges. The repository also pins and deduplicates Deck and
   Luma packages. Upgrading only `@vivjs/loaders` could create incompatible
   duplicate types or runtime classes.

2. **There are three build shapes.**
   The standalone app, externalized library build, and bundled custom-element
   build use different Vite configurations. A dependency graph that succeeds in
   the dev app may still fail in `dist-lib` or `dist-element` through missing
   externals, duplication, or mismatched runtime identities.

3. **The rendering boundary currently suppresses type checking.**
   `ImagePane.vue` casts the loader and layer options through `as never`. That
   may conceal an actual Viv 0.19/0.20 contract change. A successful typecheck
   alone is insufficient evidence that tile selection, extension props, dtype,
   or loader ordering still behave correctly.

4. **The orientation adapter mirrors Viv's PixelSource contract manually.**
   `InnerPixelSource` locally declares `shape`, `labels`, `dtype`, `tileSize`,
   `getTile`, optional `getRaster`, and `onTileError`. Any upstream signature or
   return-shape change can break orientation at runtime while remaining hidden
   by casts.

5. **The code depends on Viv extension behavior.**
   `ColorPaletteExtension`, `AdditiveColormapExtension`, colormap identifiers,
   and `MultiscaleImageLayer` properties all require live rendering checks after
   the upgrade.

6. **The lockfile currently contains multiple Zarrita generations.**
   At inspection time, Viv 0.19 resolves Zarrita 0.5.x while the image-viewer
   directly resolves Zarrita 0.7.x. A custom store is structurally small, but
   types or class-identity assumptions must not cross versions accidentally.
   The selected Viv release's actual Zarrita dependency must be inspected after
   installation.

7. **The npm lockfile already shows nested graphics packages.**
   Some Deck dependencies resolve nested Luma packages outside the root pins.
   The post-upgrade tree must be examined for additional copies; WebGL failures
   caused by duplicate runtime packages may not appear in unit tests.

8. **OME-Zarr result assumptions are embedded in the engine.**
   The engine assumes a `result.data` pyramid ordering, reads labels and shape
   from the first loader, parses `result.metadata`, and derives contrast from a
   loader. Each assumption must be verified against the chosen Viv version.

9. **Current documentation describes earlier implementation detours.**
   Existing files under `docs-dev/image-viewer` are historical context, not
   authority. They include prior decisions about HTTP serving, full-plane
   Zarrita decoding, and Viv 0.19. Do not mechanically follow or rewrite those
   documents during this task.

### Upgrade rule

Upgrade all directly used Viv packages as one coherent version set. Do not pick
"latest" automatically, and do not assume that `0.20.0` is the best final
target merely because it is the minimum version known to expose
`loadOmeZarrFromStore`.

Before editing dependency versions, the implementing agent must inspect the
candidate release's package metadata, changelog, exported types, Deck/Luma peer
requirements, Zarrita dependency, and compatibility with the repository's
current pins. If no compatible Viv release can be established without changing
Deck/Luma, stop and report the exact dependency conflict before widening the
upgrade.

## Architectural approach

### 1. Model transport explicitly

Do not encode a selected directory as `file://` or pretend that it is an HTTP
URL. Define an explicit internal distinction between a URL resource and a
readable-store resource.

A conceptual shape is:

```ts
type OmeZarrSource =
  | { kind: 'ome-zarr'; id: string; url: string }
  | { kind: 'ome-zarr'; id: string; store: OmeZarrReadableStore }
```

This is illustrative, not a prescribed final public API. Before exposing a
Zarrita type from `public-api.ts`, determine whether doing so would couple
consumers to Zarrita. A narrower method such as
`openLocalOmeZarrDirectory(handle)` may keep the public surface cleaner.

### 2. Implement a lazy browser-directory store

Adapt a granted `FileSystemDirectoryHandle` to the readable-store contract used
by the selected Viv/Zarrita version.

The store should:

- implement the exact verified `get` signature;
- implement `getRange` if the selected store contract and Viv path can use it;
- resolve path segments lazily with `getDirectoryHandle` and `getFileHandle`;
- return the store's specified missing-key value for `NotFoundError`;
- honor `AbortSignal` before and after filesystem reads;
- use `File.slice()` for byte ranges rather than reading the entire file;
- reject `.` and `..`, encoded separators, and paths outside the selected root;
- avoid recursive directory enumeration;
- remain read-only.

CloudScope Web's browser-directory adapter is a useful read-only reference for
path validation, range parsing, abort behavior, and filesystem traversal. Do
not import CloudScope modules at runtime or copy its collection-specific
orchestration into this reusable package.

### 3. Use Viv for both local and remote pyramids

After upgrading Viv:

- URL source: call the verified URL loader;
- local store source: call the verified store loader;
- normalize both results into the existing `LoadedImage` structure;
- keep `OrientedPixelSource` only after its contract is verified against the
  upgraded Viv PixelSource;
- keep the downstream rendering path shared.

Do not build a parallel local-only renderer.

### 4. Resolve the small-plane branch deliberately

The present small-image optimization performs its own metadata requests and
Zarrita reads before Viv loading. Choose one verified design:

- make that optimization consume the same URL-or-store resource abstraction;
  or
- remove/bypass the optimization for OME-Zarr and consistently let Viv create
  PixelSources for both small and large images.

The second option is architecturally simpler and better aligned with the stated
goal of using Viv as the OME-Zarr reader, but its performance and behavior must
be measured before removal. Do not retain an HTTP-only preflight ahead of a
store-backed Viv call.

### 5. Add a user-mediated directory action

Add an explicit "Open local OME-Zarr" action in the appropriate demo/viewer UI.
The call to `showDirectoryPicker()` must occur directly from a user gesture.

Handle:

- user cancellation without showing an error;
- unsupported browsers with a concise fallback message;
- permission loss or denied access;
- selection of a collection root instead of an image group;
- absent or invalid Zarr/OME metadata;
- clean replacement and cancellation of an image already loading.

Validate the store from metadata. A `.ome.zarr` suffix may improve an error
message, but it must not replace metadata validation.

## Implementation phases and gates

### Phase 0: Establish the baseline

1. Read the current `AGENTS.md` and inspect `git status`.
2. Preserve all unrelated user changes.
3. Run the focused image-viewer tests, typecheck, builds, and current demo.
4. Record working remote, Vite-served local sample, synthetic, orientation,
   LUT, contrast, overlay, and Z/C/T behavior.

Do not start the dependency upgrade without a reproducible baseline. Existing
failures must be recorded rather than attributed to the upgrade.

### Phase 1: Upgrade Viv only

1. Select the smallest verified compatible Viv release that exposes
   `loadOmeZarrFromStore` and supports required OME-Zarr versions.
2. Upgrade `@vivjs/extensions`, `@vivjs/layers`, `@vivjs/loaders`, and any
   directly required Viv packages as a coherent set.
3. Inspect the resolved npm tree for duplicate Viv, Deck, Luma, and Zarrita
   packages.
4. Update Vite external/dedupe lists only where the selected package graph
   proves it necessary.
5. Make the minimum compatibility changes required by the upgraded API.
6. Do not implement local-directory loading yet.

Gate: all existing focused tests and builds pass, and live browser inspection
shows the current remote OME-Zarr and synthetic demos render and interact as
before. Specifically inspect tiles, orientation, LUTs, contrast, home/zoom,
overlays, and Z/C/T selection. If this gate fails, isolate the upgrade problem
before proceeding.

### Phase 2: Prove a store-backed Viv load without UI

1. Implement the minimal lazy read-only directory store behind an internal
   interface.
2. Add focused tests with mock directory/file handles for paths, missing keys,
   ranges, aborts, encoded names, and traversal rejection.
3. Feed the store into `loadOmeZarrFromStore` through a narrow engine seam.
4. Load one known local child image group in a controlled browser test.

Gate: Viv lazily reads metadata and chunks from the selected directory and
renders a pyramid without global fetch interception or full-directory
enumeration.

### Phase 3: Unify engine resource handling

1. Extend the OME-Zarr source contract or add a narrow local-directory method.
2. Normalize URL and store loader results through one conversion path.
3. Resolve the small-plane branch so it supports both transports or is removed
   based on verified behavior.
4. Preserve generation-based stale-load protection and abort propagation.
5. Ensure the browser handle is not serialized, reflected to attributes, or
   accidentally bundled into state intended for persistence.

Gate: the same engine instance can switch remote -> local -> remote without
stale tiles, leaked selections, or errors.

### Phase 4: Add the user-facing action

1. Add the directory picker behind a direct button click.
2. Show loading and actionable error states.
3. Treat picker cancellation as a no-op.
4. Provide an HTTP-serving fallback message for unsupported environments.

The localhost HTTP path is a fallback and diagnostic control, not a required
implementation phase and not the primary local-data design.

### Phase 5: Complete verification

Run focused verification first, then the repository-prescribed root check when
practical. Because this changes browser IO and WebGL behavior, unit tests alone
cannot establish completion.

## Verification matrix

At minimum verify:

| Case | Required result |
|---|---|
| Existing remote OME-Zarr URL | Same rendering and controls as the baseline |
| Existing Vite/sirv sample URL | Continues to work; remains a dev path only |
| Local small single-resolution image | Loads without an HTTP-only preflight failure |
| Local large pyramidal image | Tiles are read lazily; no full-store enumeration |
| Supported Zarr v3 image | `zarr.json` metadata and chunks load correctly |
| Supported Zarr v2 image | `.zgroup`/`.zattrs`/`.zarray` work, or scope explicitly documents v3-only support |
| Multichannel image | Channels, colors, LUTs, and contrast remain correct |
| Z/T image | Plane selection requests the correct chunks |
| Orientation-sensitive image | Display transpose and overlays remain aligned |
| Missing metadata/chunk | Clear error or verified missing-key behavior; no SPA HTML parsing |
| Picker cancellation | No error and current image remains stable |
| Load cancellation | Old directory reads cannot overwrite a newer source |
| Spaces and Unicode in names | Safe and correct path resolution |
| Traversal-like key | Rejected without escaping the granted root |
| Unsupported browser | Clear fallback guidance; remote URL loading still works |
| Library build | External dependencies are declared correctly |
| Custom-element build | No duplicate Deck/Luma runtime failure |

Test at least the browsers explicitly supported by the product. Do not claim
Safari or Firefox support from assumption; verify `showDirectoryPicker` and the
chosen fallback in the actual supported versions.

## Expected file areas

Re-inspect before editing. Likely touch points include:

- `packages/image-viewer/package.json`;
- root `package.json` and `package-lock.json`;
- `packages/image-viewer/src/engine/types.ts`;
- `packages/image-viewer/src/engine/viewer-engine.ts`;
- `packages/image-viewer/src/engine/ome-zarr-loader.ts` or its replacement;
- a new framework-independent browser-directory store module;
- `packages/image-viewer/src/engine/index.ts` and/or `src/public-api.ts` only if
  a public API is deliberately added;
- `packages/image-viewer/src/app/App.vue` for the standalone development UI;
- focused unit tests and browser tests;
- Vite configuration only if verified dependency or test needs require it.

Do not edit every listed file automatically. This is a navigation list, not a
mandated diff.

## Rejected primary approaches

### Literal `file://`

Rejected because a browser-hosted application cannot reliably fetch and
traverse an arbitrary local directory through `file://`.

### Mandatory localhost server

Not required for the final feature. Keep HTTP serving as a compatibility
fallback and diagnostic control. The repository's existing Vite/sirv path also
remains useful for deterministic demos.

### Global fetch interception

Rejected because it changes process-wide browser behavior and can mask routing
bugs. Use Viv's store-loading API instead.

### Eager `File[]` map of the entire directory

Avivator has used an enumerated-file approach for older Zarr workflows, but it
scales poorly for chunk-heavy stores. Use lazy directory-handle traversal as the
primary path. Consider enumeration only as an explicitly scoped compatibility
fallback after measuring it.

### Separate local renderer

Rejected because local and remote OME-Zarr should share Viv's PixelSource and
rendering path.

## Definition of done

This roadmap is implemented when:

1. the project no longer uses Viv 0.19 and the chosen coordinated Viv version
   has been verified against the pinned graphics stack;
2. a user can click a control, select a local OME-Zarr image directory, and see
   it rendered by Viv without uploading or starting a data server;
3. large pyramids are accessed lazily through a read-only directory store;
4. remote URL loading and the existing Vite sample path still work;
5. orientation, overlays, contrast, LUTs, navigation, and Z/C/T selection are
   verified in a real browser;
6. all relevant package tests, typechecks, and builds pass;
7. unsupported-browser and malformed-dataset errors are actionable;
8. no unrelated repository changes are included.

If any dependency, browser, or Viv API assumption cannot be verified, stop and
record the exact unresolved question. Do not invent an API or silently broaden
the dependency upgrade.
