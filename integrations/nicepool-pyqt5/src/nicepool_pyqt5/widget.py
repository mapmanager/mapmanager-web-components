"""Reusable PyQt5 widget hosting the NicePool Custom Element."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path
from typing import Any

import pandas as pd
from PyQt5.QtCore import QUrl, pyqtSignal
from PyQt5.QtWebChannel import QWebChannel
from PyQt5.QtWebEngineWidgets import QWebEngineView
from PyQt5.QtWidgets import QVBoxLayout, QWidget

from .bridge import WebChannelBridge
from .data import dataframe_to_dataset, records_to_dataset

ResultCallback = Callable[[Any], None]


class NicePoolWidget(QWidget):
    """Host NicePool in a QWebEngineView with a Python and Qt API."""

    ready_changed = pyqtSignal(bool)
    selection_changed = pyqtSignal(object)
    state_changed = pyqtSignal(object)
    presets_changed = pyqtSignal(object)
    theme_changed = pyqtSignal(str)
    data_reset = pyqtSignal()
    error_occurred = pyqtSignal(str)

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        static_directory = Path(__file__).resolve().parent / "static"
        html_path = static_directory / "index.html"
        script_path = static_directory / "nicepool-pyqt5.js"
        style_path = static_directory / "nicepool-pyqt5.css"
        if not all(path.is_file() for path in (html_path, script_path, style_path)):
            raise RuntimeError(
                "NicePool PyQt5 web assets are missing; run the "
                "@mapmanager/nicepool-pyqt5-frontend build first"
            )

        self._ready = False
        self._next_request_id = 1
        self._queued_messages: list[dict[str, Any]] = []
        self._in_flight_request_id: int | None = None
        self._pending: dict[int, tuple[str, ResultCallback | None]] = {}

        self.web_view = QWebEngineView(self)
        self._bridge = WebChannelBridge(self)
        self._channel = QWebChannel(self.web_view.page())
        self._channel.registerObject("nicePoolBridge", self._bridge)
        self.web_view.page().setWebChannel(self._channel)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        self._bridge.message_received.connect(self._receive_browser_message)
        self._bridge.invalid_message.connect(self.error_occurred)
        self.web_view.loadFinished.connect(self._load_finished)
        self.web_view.load(QUrl.fromLocalFile(str(html_path)))

    @property
    def is_ready(self) -> bool:
        """Whether the browser bridge is ready to accept commands."""
        return self._ready

    def _load_finished(self, success: bool) -> None:
        if not success:
            self.error_occurred.emit("NicePool host page failed to load")

    def _send(self, name: str, payload: Any = None, callback: ResultCallback | None = None) -> None:
        request_id = self._next_request_id
        self._next_request_id += 1
        message = {"id": request_id, "name": name, "payload": payload}
        json.dumps(message, allow_nan=False)
        self._pending[request_id] = (name, callback)
        self._queued_messages.append(message)
        self._dispatch_next()

    def _dispatch_next(self) -> None:
        """Send the next command after the previous response has arrived."""
        if not self._ready or self._in_flight_request_id is not None or not self._queued_messages:
            return
        message = self._queued_messages.pop(0)
        self._in_flight_request_id = message["id"]
        self._bridge.send(message)

    def _receive_browser_message(self, message: dict[str, Any]) -> None:
        kind = message.get("kind")
        if kind == "ready":
            if self._ready:
                return
            self._ready = True
            self.ready_changed.emit(True)
            self._dispatch_next()
            return
        if kind == "response":
            self._receive_response(message)
            return
        if kind == "event":
            self._receive_event(message)
            return
        self.error_occurred.emit(f"Unknown NicePool browser message kind: {kind!r}")

    def _receive_response(self, message: dict[str, Any]) -> None:
        request_id = message.get("id")
        if not isinstance(request_id, int) or request_id not in self._pending:
            self.error_occurred.emit(f"Unexpected NicePool response ID: {request_id!r}")
            return
        if request_id != self._in_flight_request_id:
            self.error_occurred.emit(f"Out-of-order NicePool response ID: {request_id!r}")
            return
        name, callback = self._pending.pop(request_id)
        self._in_flight_request_id = None
        if message.get("ok") is not True:
            self.error_occurred.emit(f"NicePool command {name!r} failed: {message.get('error', 'unknown error')}")
            self._dispatch_next()
            return
        if callback is not None:
            callback(message.get("result"))
        self._dispatch_next()

    def _receive_event(self, message: dict[str, Any]) -> None:
        name = message.get("name")
        detail = message.get("detail")
        if name == "selectionChanged":
            self.selection_changed.emit(detail)
        elif name == "stateChanged":
            self.state_changed.emit(detail)
        elif name == "presetsChanged":
            self.presets_changed.emit(detail)
        elif name == "themeChanged":
            self.theme_changed.emit(str(detail))
        elif name == "dataReset":
            self.data_reset.emit()
        else:
            self.error_occurred.emit(f"Unknown NicePool browser event: {name!r}")

    def set_dataframe(
        self,
        dataframe: pd.DataFrame,
        *,
        row_id_column: str,
        schema: Sequence[Mapping[str, Any]] | None = None,
        pre_filter_columns: Sequence[str] | None = None,
    ) -> None:
        """Atomically replace NicePool data from a pandas DataFrame."""
        self._send(
            "setData",
            dataframe_to_dataset(
                dataframe,
                row_id_column=row_id_column,
                schema=schema,
                pre_filter_columns=pre_filter_columns,
            ),
        )

    def set_records(
        self,
        records: Sequence[Mapping[str, Any]],
        *,
        row_id_column: str,
        schema: Sequence[Mapping[str, Any]] | None = None,
        pre_filter_columns: Sequence[str] | None = None,
    ) -> None:
        """Atomically replace NicePool data from rectangular records."""
        self._send(
            "setData",
            records_to_dataset(
                records,
                row_id_column=row_id_column,
                schema=schema,
                pre_filter_columns=pre_filter_columns,
            ),
        )

    def set_selection(self, primary_row_id: str | None, selected_row_ids: Sequence[str]) -> None:
        """Set selection without emitting ``selection_changed``."""
        self._send("setSelection", {"primaryRowId": primary_row_id, "selectedRowIds": list(selected_row_ids)})

    def set_primary_selection(self, row_id: str | None) -> None:
        """Select one row without emitting ``selection_changed``."""
        self._send("setPrimarySelection", row_id)

    def clear_selection(self) -> None:
        """Clear selection without emitting ``selection_changed``."""
        self._send("clearSelection")

    def set_state(self, state: Mapping[str, Any]) -> None:
        """Set complete workspace state without emitting ``state_changed``."""
        self._send("setState", dict(state))

    def set_presets(self, presets: Sequence[Mapping[str, Any]]) -> None:
        """Replace presets without emitting ``presets_changed``."""
        self._send("setPresets", [dict(preset) for preset in presets])

    def apply_preset(self, name: str) -> None:
        """Apply one named preset without emitting ``state_changed``."""
        self._send("applyPreset", name)

    def set_theme(self, theme: str) -> None:
        """Set ``dark`` or ``light`` theme without emitting ``theme_changed``."""
        if theme not in {"dark", "light"}:
            raise ValueError("theme must be 'dark' or 'light'")
        self._send("setTheme", theme)

    def set_controls_collapsed(self, collapsed: bool) -> None:
        """Set the controls-panel collapsed state."""
        self._send("setControlsCollapsed", bool(collapsed))

    def set_preset_editing_visible(self, visible: bool) -> None:
        """Show or hide the preset editing controls."""
        self._send("setPresetEditingVisible", bool(visible))

    def get_state(self, callback: ResultCallback) -> None:
        """Asynchronously pass complete workspace state to ``callback``."""
        self._send("getState", callback=callback)

    def get_selection(self, callback: ResultCallback) -> None:
        """Asynchronously pass current selection to ``callback``."""
        self._send("getSelection", callback=callback)

    def get_presets(self, callback: ResultCallback) -> None:
        """Asynchronously pass current presets to ``callback``."""
        self._send("getPresets", callback=callback)

    def get_plot_summary(self, callback: ResultCallback) -> None:
        """Asynchronously pass the active plot summary to ``callback``."""
        self._send("getPlotSummary", callback=callback)

    def get_theme(self, callback: ResultCallback) -> None:
        """Asynchronously pass the current theme to ``callback``."""
        self._send("getTheme", callback=callback)

    def get_controls_collapsed(self, callback: ResultCallback) -> None:
        """Asynchronously pass the controls-panel state to ``callback``."""
        self._send("getControlsCollapsed", callback=callback)

    def get_preset_editing_visible(self, callback: ResultCallback) -> None:
        """Asynchronously pass preset editing visibility to ``callback``."""
        self._send("getPresetEditingVisible", callback=callback)
