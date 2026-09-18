from __future__ import annotations

import os

import pytest
from PyQt5.QtCore import QPoint, Qt
from PyQt5.QtTest import QSignalSpy
from PyQt5.QtWebEngineWidgets import QWebEngineSettings
from PyQt5.QtWidgets import QApplication

from nicepool_pyqt5 import NicePoolWidget


def test_default_preset_requires_definitions(qtbot) -> None:
    """Reject a default preset when no definitions were supplied."""
    widget = NicePoolWidget()
    qtbot.addWidget(widget)
    with pytest.raises(ValueError, match="requires preset_definitions"):
        widget.set_records(
            [{"id": "a", "x": 1.0}],
            row_id_column="id",
            default_preset="Missing",
        )


@pytest.mark.skipif(
    os.environ.get("NICEPOOL_RUN_WEBENGINE_TEST") != "1",
    reason="set NICEPOOL_RUN_WEBENGINE_TEST=1 on a host with a working display/OpenGL context",
)
def test_webengine_bridge_round_trip_and_no_selection_echo(qtbot) -> None:
    widget = NicePoolWidget(
        theme="light",
        controls_collapsed=True,
        preset_editing_visible=False,
    )
    qtbot.addWidget(widget)
    assert widget.web_view.settings().testAttribute(
        QWebEngineSettings.JavascriptCanAccessClipboard
    )
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

    initial_display: list[object] = []
    widget.web_view.page().runJavaScript(
        """
        (() => {
          const pool = document.querySelector('nice-pool');
          const root = pool?.shadowRoot;
          return {
            theme: pool?.getTheme(),
            controlsCollapsed: pool?.getControlsCollapsed(),
            presetEditingVisible: pool?.getShowPresetEditing(),
            presetVisible: Boolean(root?.querySelector('.nicepool-preset-bar select')),
          };
        })();
        """,
        initial_display.append,
    )
    qtbot.waitUntil(lambda: len(initial_display) == 1, timeout=5_000)
    assert initial_display == [
        {
            "theme": "light",
            "controlsCollapsed": True,
            "presetEditingVisible": False,
            "presetVisible": True,
        }
    ]

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

    widget.web_view.page().runJavaScript(
        """
        (() => {
          const root = document.querySelector('nice-pool')?.shadowRoot;
          const name = root?.querySelector('fieldset input[placeholder="Preset name"]');
          const save = [...(root?.querySelectorAll('fieldset button') ?? [])]
            .find((button) => button.textContent === 'Save');
          if (!name || !save) return false;
          name.value = 'Host saved';
          name.dispatchEvent(new Event('input', {bubbles: true}));
          save.click();
          return true;
        })();
        """
    )
    qtbot.waitUntil(lambda: len(presets) == 1, timeout=5_000)
    assert [preset["name"] for preset in presets[0][0]] == ["Current", "Host saved"]

    widget.web_view.page().runJavaScript(
        """
        (() => {
          const root = document.querySelector('nice-pool')?.shadowRoot;
          const remove = [...(root?.querySelectorAll('fieldset button') ?? [])]
            .find((button) => button.textContent === 'Delete');
          remove?.click();
          return Boolean(remove);
        })();
        """
    )
    qtbot.waitUntil(lambda: len(presets) == 2, timeout=5_000)
    assert [preset["name"] for preset in presets[1][0]] == ["Current"]

    replacement_state = dict(state[0])
    replacement_state["plots"] = [dict(plot) for plot in state[0]["plots"]]
    replacement_state["plots"][0]["pointSize"] = 12
    widget.set_state(replacement_state)
    with qtbot.waitSignal(widget.data_replaced, timeout=20_000):
        widget.replace_records(
            [
                {"id": "a", "x": 10.0, "y": 20.0},
                {"id": "b", "x": 11.0, "y": 21.0},
            ],
            row_id_column="id",
        )
    replaced_state: list[object] = []
    widget.get_state(replaced_state.append)
    qtbot.waitUntil(lambda: len(replaced_state) == 1 or len(errors) > 0, timeout=5_000)
    assert replaced_state[0]["plots"][0]["pointSize"] == 12

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

    widget.web_view.page().runJavaScript(
        """
        (() => {
          const root = document.querySelector('nice-pool')?.shadowRoot;
          const panel = root?.querySelector('.nicepool-summary-panel');
          if (!panel) return false;
          panel.open = true;
          const tab = [...root.querySelectorAll('[role="tab"]')]
            .find((button) => button.textContent.includes('summary'));
          tab?.click();
          return Boolean(tab);
        })();
        """
    )
    qtbot.wait(100)
    button_positions: list[object] = []
    widget.web_view.page().runJavaScript(
        """
        (() => {
          const root = document.querySelector('nice-pool')?.shadowRoot;
          const button = [...(root?.querySelectorAll('button') ?? [])]
            .find((candidate) => candidate.textContent === 'Copy Summary');
          if (!button) return null;
          button.scrollIntoView({block: 'center'});
          const rect = button.getBoundingClientRect();
          return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
        })();
        """,
        button_positions.append,
    )
    qtbot.waitUntil(lambda: len(button_positions) == 1, timeout=5_000)
    position = button_positions[0]
    assert isinstance(position, dict)
    clipboard = QApplication.clipboard()
    previous_clipboard_text = clipboard.text()
    try:
        clipboard.clear()
        click_target = widget.web_view.focusProxy() or widget.web_view
        qtbot.mouseClick(
            click_target,
            Qt.LeftButton,
            pos=QPoint(round(position["x"]), round(position["y"])),
        )
        qtbot.waitUntil(
            lambda: "=== Summary table ===" in clipboard.text(), timeout=5_000
        )
        assert "row_id\tx\ty" in clipboard.text()
    finally:
        clipboard.setText(previous_clipboard_text)
