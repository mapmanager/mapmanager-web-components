# NicePool

`@mapmanager/nicepool` is a browser-native rewrite of the Python/NiceGUI
NicePool widget.
The first usable slice supports authoritative dataset replacement, stable row
identity, filtering, scatter, swarm, box, violin, histogram, and cumulative
histogram preparation, plot-specific summaries,
linked selection, four persistent plot slots, saved single-plot presets, a Vue
component, and a framework-neutral Custom Element.

Scatter supports numeric or categorical X columns, numeric Y columns, and an
optional categorical **Color by** column. Swarm uses **Group** for categorical
X-axis positions and **Color by** to subdivide each group by color and offset.
Box and violin reuse the same grouped observations and add quartile summaries.
Histogram variants use a user-controlled bin count (default 50) and
NicePool-owned, globally aligned bin edges shared by rendering and summaries.

The widget defaults to a dark theme for both controls and Plotly. Its active
plot has a collapsible Display options panel for legend visibility/position,
Plotly toolbar visibility, combined axis chrome, and independent horizontal and
vertical grid lines. Theme is workspace presentation; display options are part
of each serializable plot state.

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

The build emits three artifacts: the standalone SPA (`dist/`), an ESM library
with Vue and Plotly externalized (`dist-lib/`), and a self-contained registered
Custom Element module (`dist-element/`). `element-demo.html` is the plain-HTML
development host. The ESM library includes generated TypeScript declarations.

The standalone development host generates deterministic demonstration data.
Its velocity column intentionally contains negative values, extreme values, and
explicit missing values for exercising plot controls. `public/sample.csv` is a
small human-readable integration fixture; CSV adapters must convert blank cells
to JSON `null` before calling `setData`.

## Python and NiceGUI

Python clients should use `NicePoolWebView` from the `nicewidgets` Python
package. It accepts pandas DataFrames and hides browser asset loading, data
conversion, JavaScript calls, and event decoding. Its runnable example is:

```bash
cd /path/to/nicewidgets
uv run python examples/nicepool_web_view/demo_app.py
```

See the NiceWidgets `NicePoolWebView` guide for DataFrame requirements, typed
state, selection callbacks, and integration notes. All plotting and
authoritative selection behavior remains in this package.

## Package boundaries

- `src/core/`: framework- and DOM-independent data, state, statistics, and selection.
- `src/plots/`: prepared plot data, summaries, and the isolated Plotly adapter.
- `src/vue/`: thin Vue presentation components.
- `src/element/`: the `<nice-pool>` host boundary for plain HTML and NiceGUI.
- `src/app/`: standalone development application.

See the repository's [NicePool documentation](../../docs/nicepool/index.md) for
architecture, data and selection contracts, plot semantics, state, and preset
persistence.
