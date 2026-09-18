# Getting started

The repository is an npm workspace containing independent component and
integration packages.

## Install and verify

```bash
git clone https://github.com/mapmanager/mapmanager-web-components.git
cd mapmanager-web-components
npm ci
npm run check
```

`npm run check` runs package tests, type checking, builds, and repository browser
tests.

## Hosted demos

GitHub Pages publishes the same standalone demo applications:

- [Image Viewer](https://mapmanager.github.io/mapmanager-web-components/demos/image-viewer/)
- [NicePool](https://mapmanager.github.io/mapmanager-web-components/demos/nicepool/)
- [Signal Viewer](https://mapmanager.github.io/mapmanager-web-components/demos/signal-viewer/)

## Run a component locally

```bash
npm run dev --workspace @mapmanager/image-viewer
```

or:

```bash
npm run dev --workspace @mapmanager/nicepool
```

or:

```bash
npm run dev --workspace @mapmanager/signal-viewer
```

Each command starts that package's standalone Vite development application.
Applications in neighboring repositories currently consume these private
packages with npm `file:` dependencies.
