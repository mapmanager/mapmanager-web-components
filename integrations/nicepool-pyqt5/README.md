# NicePool PyQt5 integration

This directory contains the official PyQt5 adapter for the framework-neutral
NicePool Custom Element. NicePool continues to own data validation, filtering,
statistics, plots, state, presets, and selection. The adapter only converts
Python tables, hosts the element in `QWebEngineView`, and translates between
Custom Element events and Qt signals.

Version 0.1 supports Python 3.10 through 3.13 and PyQt5. It does not claim
PySide or Qt 6 support.

## Build the frontend

From the repository root:

```bash
npm ci
npm run build --workspace @mapmanager/nicepool-pyqt5-frontend
```

The generated `nicepool-pyqt5.js` and `nicepool-pyqt5.css` are intentionally
not tracked. Build them before running the example, testing the WebEngine
integration, or building a wheel.

## Run tests and the example

```bash
uv sync --project integrations/nicepool-pyqt5 --group dev
uv run --project integrations/nicepool-pyqt5 --group dev \
  pytest integrations/nicepool-pyqt5/tests
uv run --project integrations/nicepool-pyqt5 python \
  integrations/nicepool-pyqt5/examples/demo.py
```

The WebEngine round-trip test is opt-in because headless systems may not provide
the display or OpenGL context required by Chromium:

```bash
NICEPOOL_RUN_WEBENGINE_TEST=1 \
  uv run --project integrations/nicepool-pyqt5 --group dev \
  pytest integrations/nicepool-pyqt5/tests/test_widget.py
```

## Build a wheel

Build the frontend first, then run:

```bash
uv build --project integrations/nicepool-pyqt5 --wheel
```

The wheel contains `index.html` and the built NicePool JavaScript and CSS
assets. Applications installing the wheel do not need Node.
