# Saved workspace persistence

NicePool presets are JSON objects containing a name and one serializable
`NicePoolState`. The reusable engine and Custom Element expose preset get/set
APIs; the host application decides where those objects are stored.

## Pure web development demo

The standalone Vite demo stores presets in browser `localStorage` under this
key:

```text
nicepool-web-demo-presets-v4
```

The key is supplied by `src/app/App.vue`. The load, validation, save, and delete
behavior is implemented by `src/vue/NicePoolWidget.vue`.

A normal reload or a hard reload does not clear `localStorage`. During early
development, the key is advanced when the state contract changes so obsolete
presets are ignored instead of migrated. Delete a current preset
with the Saved workspace controls, clear the site's browser storage, or remove
the key explicitly when a clean demo state is required.

Browser storage is isolated by origin. For example, the Vite development
server at `localhost:5173` and a NiceGUI server at `localhost:8080` cannot see
each other's saved presets even if they use the same storage key.

## Embedded clients

The Custom Element does not choose persistent storage. An embedding client can
load presets with `setNicePoolPresets()`, read them with
`getNicePoolPresets()`, and observe `nicepool-presets-change`. This keeps
NicePool reusable:

- a browser SPA may use `localStorage` or a server API;
- a Python/NiceGUI host may use a JSON file, application settings, or a server;
- another thin client can use the same versioned preset JSON contract.

`setData()` remains a full dataset-dependent reset. A host should validate and
reload only the presets that are compatible with the replacement dataset.
`replaceData()` instead retains the in-memory preset list and selected preset
name and does not read or write browser storage. A retained preset that is not
compatible with the new dataset will still fail atomically if later applied.

## Host-owned persistence

Embedded NicePool does not select a filesystem path or application-settings
backend. When a user clicks **Save** or **Delete**, the Custom Element emits
`nicepool-presets-change` with the complete ordered preset collection. Persist
that complete value rather than trying to reconstruct an individual mutation.

At startup, first install a dataset and then restore the collection with
`setNicePoolPresets()`. Presets are dataset-aware, so loading them before data
or against an incompatible schema fails validation.

The PyQt5 adapter exposes the same boundary as:

```python
pool.data_reset.connect(load_presets)
pool.presets_changed.connect(save_complete_preset_list)

def load_presets() -> None:
    pool.set_presets(application_settings.load_nicepool_presets())

def save_complete_preset_list(presets: list[dict]) -> None:
    application_settings.save_nicepool_presets(presets)
```

`set_presets()` is a host command and does not echo through
`presets_changed`. User Save, overwrite, and Delete operations do emit it.
The adapter remains storage-agnostic: file locking, atomic disk writes,
settings namespaces, and recovery from storage errors belong to the host.

See
[`integrations/nicepool-pyqt5/examples/preset_persistence.py`](https://github.com/mapmanager/mapmanager-web-components/blob/main/integrations/nicepool-pyqt5/examples/preset_persistence.py)
for a complete `QSettings` example.
