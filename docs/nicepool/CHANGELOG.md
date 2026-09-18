# NicePool changelog

## Unreleased

- Added `replaceData()` to the engine, Vue component, and Custom Element for
  atomic table replacement that preserves compatible plot state and presets.
- Added `nicepool-data-replaced` and selection pruning for state-preserving
  replacements.
- Added PyQt5 `replace_dataframe()` / `replace_records()` methods with
  per-command success and error callbacks and a `data_replaced` signal.
- Added anywidget `replace_data()` with synchronized replacement errors.
- Documented and tested host-owned persistence through the existing complete
  `presets_changed` collection emitted by user Save, overwrite, and Delete.
