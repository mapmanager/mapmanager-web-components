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

Replace the workspace name with `@mapmanager/nicepool` for NicePool.

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

Package READMEs are concise entry points and should link to the canonical
pages here. Do not duplicate detailed guides under package directories.

The separate `docs-dev/` tree contains historical implementation notes. It is
not public documentation and is not a source of truth for current behavior.
