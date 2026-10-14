# NicePool demonstration data

`data/luo_et_al.csv` is the tracked source table for the **Luo et al. 2024**
dataset option in the standalone PyQt5 example. `data/luo_et_al.json` is its
complete caller-authored NicePool column schema; column names and order must
match the CSV exactly.

The Python demo owns CSV parsing and passes the resulting pandas DataFrame,
schema, row-ID column, filter columns, and presets through the public
`NicePoolWidget.set_dataframe()` API. NicePool itself intentionally does not
read CSV files or attach meaning to the `row_id` format.

The Luo demo uses `row_id` as stable source-row identity and exposes `include`,
`condition`, and `sweep` as filter controls. Future aggregate-table support
will receive `file_number` explicitly as its grouping column; NicePool will not
derive that grouping from `row_id`.
