# MapManager Web Components

Reusable browser components shared by MapManager web and Python/NiceGUI clients.

## Packages

- [`@mapmanager/nicepool`](packages/nicepool/) — linked statistical plots,
  selection, summaries, a Vue component, and a framework-neutral Custom Element.
- `@mapmanager/image-viewer` — planned shared scientific image viewer.

## Development

The repository uses standard npm workspaces and requires no workspace framework.

```bash
npm ci
npm run check
```

Run the NicePool standalone application with:

```bash
npm run dev --workspace @mapmanager/nicepool
```

The repository is licensed under GPL-3.0-only.
