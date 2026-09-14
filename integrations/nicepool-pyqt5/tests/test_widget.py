from __future__ import annotations

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
            [
                {"id": "a", "x": 1.0, "y": 2.0},
                {"id": "b", "x": 2.0, "y": 3.0},
            ],
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

    rendered: list[object] = []
    inspect_script = """
      (() => {
        const plot = document.querySelector('nice-pool')?.shadowRoot?.querySelector('.nicepool-plot');
        const traceType = plot?.data?.[0]?.type ?? null;
        if (!traceType) return null;
        return {
          traceType,
          hasPlotDom: Boolean(plot.querySelector('.plot-container')),
          hasWebGlWarning: plot.innerText.includes('WebGL is not supported'),
        };
      })();
    """
    for _ in range(50):
        widget.web_view.page().runJavaScript(inspect_script, rendered.append)
        qtbot.wait(100)
        if any(result is not None for result in rendered):
            break
    render_result = next(result for result in rendered if result is not None)
    assert render_result == {
        "traceType": "scatter",
        "hasPlotDom": True,
        "hasWebGlWarning": False,
    }

    click_results: list[object] = []
    click_script = """
      (() => {
        const plot = document.querySelector('nice-pool')?.shadowRoot?.querySelector('.nicepool-plot');
        if (!plot?.emit) return false;
        plot.emit('plotly_click', {points: [{customdata: ['b']}]});
        return true;
      })();
    """
    widget.web_view.page().runJavaScript(click_script, click_results.append)
    qtbot.waitUntil(lambda: click_results == [True], timeout=5_000)
    qtbot.waitUntil(lambda: len(selections) == 1, timeout=5_000)

    received: list[object] = []
    widget.get_selection(received.append)
    qtbot.waitUntil(lambda: len(received) == 1, timeout=5_000)

    assert selections[0][0] == {"primaryRowId": "b", "selectedRowIds": ["b"]}
    assert received == [{"primaryRowId": "b", "selectedRowIds": ["b"]}]
    assert len(errors) == 0
