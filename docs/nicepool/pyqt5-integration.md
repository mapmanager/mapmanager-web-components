# PyQt5 integration

`nicepool-pyqt5` embeds the framework-neutral `<nice-pool>` Custom Element in a
`QWebEngineView`. It converts pandas DataFrames or Python records to NicePool's
public dataset contract and translates between NicePool events and Qt signals.
NicePool remains responsible for validation, filtering, statistics, plots,
workspace state, presets, and selection.

Version 0.1 supports Python 3.10 through 3.13 and PyQt5. It does not claim
PySide or Qt 6 support.

## Local installation

Build the self-contained frontend from the `mapmanager-web-components` root:

```bash
npm ci
npm run build --workspace @mapmanager/nicepool-pyqt5-frontend
```

Install the adapter from a sibling application:

```bash
uv add --editable ../mapmanager-web-components/integrations/nicepool-pyqt5
```

The later release wheel will contain the built browser assets; applications
installing that wheel will not need Node.

## Create and populate the widget

```python
import pandas as pd
from PyQt5.QtWidgets import QMainWindow

from nicepool_pyqt5 import NicePoolWidget


class PoolWindow(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.pool = NicePoolWidget(self)
        self.setCentralWidget(self.pool)

        self.pool.selection_changed.connect(self._selection_changed)
        self.pool.error_occurred.connect(self._browser_error)

        frame = pd.DataFrame(
            [
                {"pool_row_id": "row-1", "condition": "control", "value": 1.5},
                {"pool_row_id": "row-2", "condition": "treated", "value": 2.0},
            ]
        )
        self.pool.set_dataframe(frame, row_id_column="pool_row_id")

    def _selection_changed(self, selection: dict) -> None:
        print(selection["primaryRowId"], selection["selectedRowIds"])

    def _browser_error(self, message: str) -> None:
        print(message)
```

Calls made before `ready_changed(True)` are queued in order, so callers may set
the initial data immediately after constructing the widget.

## Atomic dataset replacement

`set_dataframe()` and `set_records()` each convert and send one complete
dataset through NicePool's existing atomic `setData()` API. Every call replaces
the authoritative dataset and clears dataset-dependent selection, filters, plot
state, and prepared results. Separate calls are not related.

There is no incremental update, chunking, dataframe comparison, row patching,
or automatic restoration of state from the previous dataset. The adapter does
not impose a row or column limit.

After an initial `set_dataframe()` or `set_records()`, callers may use
`replace_dataframe()` or `replace_records()` to preserve the current valid
plot workspace and presets. Missing selection IDs are pruned and the distinct
`data_replaced` signal is emitted after success; `data_reset` is not emitted.
If the current workspace is incompatible, the old table remains active.

Replacement commands accept optional per-call callbacks so a host can choose
its own fallback without parsing the shared error signal:

```python
self.pool.replace_dataframe(
    next_frame,
    row_id_column="pool_row_id",
    callback=lambda _result: self._replacement_finished(),
    error_callback=lambda message: self._reset_after_failed_replacement(message),
)
```

Failures also continue to emit `error_occurred(str)`.

The row-ID column must be explicit, unique, and nonempty. The adapter never uses
the pandas index or generates IDs. Table cells must resolve to strings, finite
numbers, booleans, or missing values. pandas and NumPy missing values become
JSON `null`; unsupported cells reject the complete replacement with row and
column context. The caller's DataFrame is not modified.

An optional complete NicePool column schema and prefilter list can be supplied:

```python
self.pool.set_dataframe(
    frame,
    row_id_column="pool_row_id",
    schema=[
        {"name": "pool_row_id", "type": "string", "axis_label": "Row"},
        {"name": "condition", "type": "string", "axis_label": "Condition"},
        {"name": "value", "type": "number", "axis_label": "Value"},
    ],
    pre_filter_columns=["condition"],
)
```

Pass `pre_filter_columns=[]` to disable prefilters. Omitting it preserves
NicePool's conventional automatic filters.

## Selection and feedback loops

Browser/user changes emit Qt signals:

- `selection_changed(object)`
- `state_changed(object)`
- `presets_changed(object)`
- `theme_changed(str)`
- `data_replaced()`

Python setters do not echo through their corresponding change signal. This is
the adapter's feedback-loop boundary:

```python
self.pool.set_selection("row-2", ["row-2"])
# selection_changed is not emitted by this call.
```

`data_reset` is a lifecycle notification emitted after NicePool accepts a new
dataset; it is not a user-change signal.

`presets_changed` carries the complete preset collection after a user saves,
overwrites, or deletes a workspace. Connect it to host-owned persistence and
restore that collection with `set_presets()` after `data_reset`. See
[Saved workspace persistence](preset-persistence.md#host-owned-persistence).

## Setters

The adapter mirrors the Custom Element API with Python names:

```python
pool.set_selection(primary_row_id, selected_row_ids)
pool.set_primary_selection(row_id)
pool.clear_selection()
pool.set_state(state)
pool.set_presets(presets)
pool.apply_preset(name)
pool.set_theme("dark")
pool.set_controls_collapsed(True)
pool.set_preset_editing_visible(False)
```

State and preset payloads use the same JSON-compatible structures documented
in [State and presets](state-and-presets.md).

## Asynchronous getters

Qt WebEngine communication is asynchronous. Getters accept a callback that is
called on the Qt GUI thread instead of blocking the event loop:

```python
self.pool.get_state(self._received_state)
self.pool.get_selection(self._received_selection)
self.pool.get_presets(self._received_presets)
self.pool.get_plot_summary(self._received_summary)
self.pool.get_theme(self._received_theme)
```

Callbacks receive the browser result. Browser command failures are reported by
`error_occurred(str)` and do not invoke the success callback.

## Threading and lifetime

Construct the widget and call its methods on the Qt GUI thread. Keep normal Qt
ownership of the widget; destroying it also destroys its `QWebEngineView`, Web
Channel, and pending callbacks.

## Packaging applications

The Python wheel includes `index.html`, `nicepool-pyqt5.js`, and
`nicepool-pyqt5.css`. PyInstaller must also collect the Qt WebEngine subprocess,
resources, and locales supplied by PyQtWebEngine. Validate the packaged
application on every supported platform; a successful source-tree run does not
verify a PyInstaller bundle.

The first compatibility baseline is PyQt5 5.15.11 with PyQtWebEngine 5.15.7.
The frontend is built for the Chromium 80 baseline used by Qt WebEngine 5.15.
