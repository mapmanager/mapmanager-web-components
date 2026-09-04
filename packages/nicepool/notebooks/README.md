# NicePool Deno notebook

`01-nicepool-engine.ipynb` exercises the framework-independent NicePool
TypeScript engine from a Deno Jupyter kernel. It does not contain a separate
implementation of the analysis.

From the repository root, generate the notebook's local ESM import:

```bash
npm run build:nicepool-notebook
```

Install and start the Deno Jupyter kernel if it is not already available:

```bash
deno jupyter --install
jupyter lab
```

Open `packages/nicepool/notebooks/01-nicepool-engine.ipynb` and select the
**Deno** kernel. The generated `nicepool-core.js` is intentionally ignored by
Git and contains no Vue, Plotly, or DOM code.
