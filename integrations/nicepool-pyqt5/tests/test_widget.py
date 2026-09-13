from __future__ import annotations

import json
import os

import pytest
from PyQt5.QtTest import QSignalSpy

from nicepool_pyqt5 import NicePoolWidget


@pytest.mark.skipif(
    os.environ.get("NICEPOOL_RUN_WEBENGINE_TEST") != "1",
    reason="set NICEPOOL_RUN_WEBENGINE_TEST=1 on a host with a working display/OpenGL context",
)
def test_webengine_bridge_round_trip_and_no_selection_echo(qtbot) -> None:
    widget = NicePoolWidget()
    qtbot.addWidget(widget)
    errors = QSignalSpy(widget.error_occurred)
    selections = QSignalSpy(widget.selection_changed)
    states = QSignalSpy(widget.state_changed)
    presets = QSignalSpy(widget.presets_changed)
    themes = QSignalSpy(widget.theme_changed)

    with qtbot.waitSignal(widget.ready_changed, timeout=20_000):
        widget.show()

    with qtbot.waitSignal(widget.data_reset, timeout=20_000):
        widget.set_records(
            [{"id": "a", "value": 1.0}, {"id": "b", "value": 2.0}],
            row_id_column="id",
        )

    qtbot.wait(250)
    widget.set_primary_selection("a")
    state: list[object] = []
    widget.get_state(state.append)
    qtbot.waitUntil(lambda: len(state) == 1 or len(errors) > 0, timeout=5_000)
    assert len(errors) == 0, [entry[0] for entry in errors]
    widget.set_state(state[0])
    widget.set_presets([{"schemaVersion": 1, "name": "Current", "state": state[0]}])
    widget.set_theme("light")
    qtbot.wait(250)
    assert len(selections) == 0
    assert len(states) == 0
    assert len(presets) == 0
    assert len(themes) == 0

    selection = {"primaryRowId": "b", "selectedRowIds": ["b"]}
    script = f"""
      document.querySelector('nice-pool').dispatchEvent(
        new CustomEvent('nicepool-selection-change', {{detail: {json.dumps(selection)}}})
      );
    """
    widget.web_view.page().runJavaScript(script)
    qtbot.waitUntil(lambda: len(selections) == 1, timeout=5_000)

    received: list[object] = []
    widget.get_selection(received.append)
    qtbot.waitUntil(lambda: len(received) == 1, timeout=5_000)

    assert selections[0][0] == selection
    assert received == [{"primaryRowId": "a", "selectedRowIds": ["a"]}]
    assert len(errors) == 0
