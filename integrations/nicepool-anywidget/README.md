# NicePool anywidget integration

This directory contains a thin Python/Jupyter adapter around the existing
NicePool custom element. Python synchronizes data and state; the existing
TypeScript component continues to own analysis, plotting, controls, and
selection behavior.

From the repository root, install JavaScript dependencies and generate the
self-contained anywidget frontend:

```bash
npm ci
npm run build --workspace @mapmanager/nicepool-anywidget-frontend
```

Launch JupyterLab in an isolated environment containing the adapter and its
notebook dependencies:

```bash
uv run --project integrations/nicepool-anywidget --extra demo \
  jupyter lab examples/jupyter/nicepool-anywidget.ipynb
```

Run its Python tests:

```bash
uv run --project integrations/nicepool-anywidget --extra dev pytest
```

The generated `src/nicepool_anywidget/static/widget.js` is ignored by Git. It
must be built before installing a wheel or launching the example notebook.
