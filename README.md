# MapManager Web Components

Reusable browser components shared by MapManager web and Python/NiceGUI clients.

## Packages

- [`@mapmanager/image-viewer`](packages/image-viewer/) — a Deck.gl/Viv
  scientific image viewer for in-memory planes, lazy planes, and OME-Zarr.
  It is used by [AcqView](https://github.com/mapmanager/acqview).
- [`@mapmanager/nicepool`](packages/nicepool/) — linked statistical plots,
  selection, summaries, a Vue component, and a framework-neutral Custom Element.
  It is used by [CloudScope Web](https://github.com/mapmanager/cloudscope-web).

Both packages are actively developed and pre-1.0. Their APIs may change when
that improves the design; user-visible changes belong in the changelog.

## Documentation

The complete documentation is published at
[mapmanager.github.io/mapmanager-web-components](https://mapmanager.github.io/mapmanager-web-components/).
The Markdown source is in [`docs/`](docs/).

## Development

```bash
npm ci
npm run check
npm run dev --workspace @mapmanager/image-viewer
npm run dev --workspace @mapmanager/nicepool
```

See the [development guide](docs/development.md) for focused commands and the
documentation workflow. The repository is licensed under GPL-3.0-only.

## Documentation site

Install [uv](https://docs.astral.sh/uv/) once, then run the local documentation
site through npm:

```bash
npm run docs:serve
```

Open <http://127.0.0.1:8000/>. MkDocs rebuilds the site as its Markdown source
changes; stop the server with `Ctrl+C`.

Validate the production documentation build with:

```bash
npm run docs:build
```

The npm commands ask uv to create an isolated environment from
`requirements-docs.txt`; there is no repository virtual environment to activate
or commit.
