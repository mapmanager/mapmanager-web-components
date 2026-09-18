# Development

## Repository checks

Install exact locked dependencies and run all checks:

```bash
npm ci
npm run check
```

For a focused component cycle:

```bash
npm test --workspace @mapmanager/image-viewer
npm run typecheck --workspace @mapmanager/image-viewer
npm run build --workspace @mapmanager/image-viewer
```

Replace the workspace name with `@mapmanager/nicepool` for NicePool or
`@mapmanager/signal-viewer` for Signal Viewer.

## NicePool browser tests

Install Chromium for Playwright once after cloning the repository:

```bash
npx playwright install chromium
```

Run one NicePool browser test while developing:

```bash
npx playwright test packages/nicepool/e2e/nicepool.spec.ts -g "organizes controls"
```

Run all repository browser tests with:

```bash
npm run test:e2e
```

Playwright starts the NicePool Vite server at <http://127.0.0.1:4173/>
automatically. Before pushing, run the same complete gate used by CI:

```bash
npm run check
```

## Documentation

The public documentation source is the repository-level `docs/` tree.
Install [uv](https://docs.astral.sh/uv/) once, then use the repository's npm
commands:

```bash
npm run docs:serve
npm run docs:build
```

`docs:serve` starts the live-reloading site at <http://127.0.0.1:8000/>.
`docs:build` performs the strict build used to catch documentation errors. Both
commands use `uv run --isolated --with-requirements requirements-docs.txt`, so
uv manages the environment without inheriting unrelated Python packages and no
activation step is required.

GitHub Pages deliberately installs the same pinned `requirements-docs.txt`
with pip. This keeps the publishing workflow compatible with GitHub's standard
Python runner while local development retains the faster npm-and-uv workflow.

The Pages workflow also builds each public component's Vite demo (`build:app`)
and copies the output under `site/demos/` after MkDocs runs, so a clean
documentation build cannot wipe the demos. MkDocs `docs:serve` is documentation
only; preview
the combined artifact by building the demos, running `docs:build`, copying
`packages/image-viewer/dist` to `site/demos/image-viewer` and
`packages/nicepool/dist` to `site/demos/nicepool`, and copying
`packages/signal-viewer/dist` to `site/demos/signal-viewer`, then serving
`site/`.

Package READMEs are concise entry points and should link to the canonical
pages here. Do not duplicate detailed guides under package directories.

The separate `docs-dev/` tree contains historical implementation notes. It is
not public documentation and is not a source of truth for current behavior.
