# NicePool

`@mapmanager/nicepool` is a browser-native statistical exploration component.
It owns dataset validation, filtering, linked selection, plot preparation,
summaries, four persistent plot slots, and saved single-plot presets.

It provides a Vue component and a framework-neutral `<nice-pool>` Custom
Element. [CloudScope Web](https://mapmanager.github.io/cloudscope-web/) is the
primary client example.
A hosted package demo is at
[mapmanager.github.io/mapmanager-web-components/demos/nicepool](https://mapmanager.github.io/mapmanager-web-components/demos/nicepool/).

## Guides

- [Architecture](architecture.md)
- [Data and selection API](data-and-selection-api.md)
- [Plot and summary semantics](plot-and-summary-semantics.md)
- [State and presets](state-and-presets.md)
- [Saved preset persistence](preset-persistence.md)

NicePool is actively developed and currently pre-1.0. Its explicit state and
schema contracts are intended to make necessary API evolution reviewable.
