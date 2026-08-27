# Getting started

The repository is an npm workspace containing two independent packages.

## Install and verify

```bash
git clone https://github.com/mapmanager/mapmanager-web-components.git
cd mapmanager-web-components
npm ci
npm run check
```

`npm run check` runs package tests, type checking, builds, and repository browser
tests.

## Run a component

```bash
npm run dev --workspace @mapmanager/image-viewer
```

or:

```bash
npm run dev --workspace @mapmanager/nicepool
```

Each command starts that package's standalone Vite development application.
Applications in neighboring repositories currently consume these private
packages with npm `file:` dependencies.
