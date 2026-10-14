# NicePool

`@mapmanager/nicepool` is a browser-native rewrite of the Python/NiceGUI
NicePool widget.
The first usable slice supports authoritative dataset replacement, stable row
identity, filtering, scatter, swarm, box, violin, histogram, and cumulative
histogram preparation, plot-specific summaries,
linked selection, four persistent plot slots, saved workspace presets, a Vue
component, and a framework-neutral Custom Element.

Scatter supports numeric or categorical X columns, numeric Y columns, and an
optional categorical **Color by** column. Swarm uses **Group** for categorical
X-axis positions and **Color by** to subdivide each group by color and offset.
Box and violin reuse the same grouped observations and add quartile summaries.
Histogram variants use a user-controlled bin count (default 50) and
NicePool-owned, globally aligned bin edges shared by rendering and summaries.

## Plot-specific aggregation

Datasets may opt into aggregation with an explicit, scientifically safe recipe:

```ts
const dataset = {
  rows,
  rowIdColumn: 'row_id',
  schema,
  aggregation: {
    groupByColumn: 'file_number',
    preserveColumns: ['condition', 'animal_id'],
  },
}
```

`groupByColumn` is required only when the host wants to offer the
**Aggregated groups** data level; NicePool never parses a row ID to infer it.
Each declared preserved column must be constant within every filtered group or
aggregation fails with a contextual error. Source prefilters run before the
table is derived. For the current plot's selected Y column, NicePool calculates
count, min, max, mean, median, sample SD, SEM, and CV while ignoring missing
numeric values. SD, SEM, and CV remain missing for groups with fewer than two
valid observations.

The UI supports aggregation for scatter, swarm, box, and violin plots. Each
plot selects one already-generated aggregate column: mean, median, SD, SE, min,
max, CV, or count. The axis label identifies that statistic, for example
`<Y label> (mean)`. Aggregate scatter X choices are limited to the configured
grouping column and preserved columns; the grouping column is the fallback when
the source-level X column is unavailable in the derived table. Histogram and
cumulative-histogram aggregation are intentionally deferred. Aggregate rows have their own
stable identities and retain separate source-row membership metadata; changing
data level clears selection rather than implicitly linking identities. The
Data table always remains the complete authoritative source table. The
Aggregate and Selection tabs show the active plot's current derived identity
space, and **Copy Table** copies every in-memory row and column, not only the
visible pagination page.

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

The standalone development host offers generated **Synthetic** data and the
tracked **Luo et al. 2024** CSV/schema pair under `examples/nicepool/data/`.
Dataset selection, fetching, and CSV parsing remain demo-host responsibilities;
the reusable component receives validated records through `initializeData()`.
The synthetic velocity column intentionally contains negative values, extreme
values, and explicit missing values for exercising plot controls.
`public/sample.csv` remains a small human-readable integration fixture; CSV
adapters must convert blank cells to JSON `null` before calling `setData`.

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
