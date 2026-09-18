# NicePool

`@mapmanager/nicepool` is a browser-native statistical exploration component.
It owns dataset validation, filtering, linked selection, plot preparation,
summaries, four persistent plot slots, and saved workspace presets.
Plotting is provided by [Plotly JavaScript](https://plotly.com/javascript/).

It provides a Vue component and a framework-neutral `<nice-pool>` Custom
Element. It is used by
[CloudScope Web](https://mapmanager.github.io/cloudscope-web/) and
[SanPy Web](https://mapmanager.github.io/sanpy-web/).
A hosted package demo is at
[mapmanager.github.io/mapmanager-web-components/demos/nicepool](https://mapmanager.github.io/mapmanager-web-components/demos/nicepool/).

## Guides

- [Architecture](architecture.md)
- [Data and selection API](data-and-selection-api.md)
- [Plot and summary semantics](plot-and-summary-semantics.md)
- [State and presets](state-and-presets.md)
- [Saved preset persistence](preset-persistence.md)
- [PyQt5 integration](pyqt5-integration.md)

NicePool is actively developed and currently pre-1.0. Its explicit state and
schema contracts are intended to make necessary API evolution reviewable.
