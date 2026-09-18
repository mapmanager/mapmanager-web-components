"""Persist user-edited NicePool presets in host-owned Qt settings."""

from __future__ import annotations

import json
import sys
from typing import Any

from PyQt5.QtCore import QSettings
from PyQt5.QtWidgets import QApplication, QMainWindow

from nicepool_pyqt5 import NicePoolWidget


class PresetWindow(QMainWindow):
    """Minimal host that owns persistence while NicePool owns preset editing."""

    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("NicePool host-owned presets")
        self.settings = QSettings("MapManager", "NicePoolPresetExample")
        self.pool = NicePoolWidget(self)
        self.setCentralWidget(self.pool)

        self.pool.data_reset.connect(self._restore_presets)
        self.pool.presets_changed.connect(self._save_presets)
        self.pool.error_occurred.connect(print)
        self.pool.set_records(
            [
                {"id": "a", "condition": "control", "value": 1.0},
                {"id": "b", "condition": "treated", "value": 2.0},
            ],
            row_id_column="id",
        )

    def _restore_presets(self) -> None:
        """Restore host data only after NicePool has a dataset for validation."""
        encoded = self.settings.value("presets", "[]", type=str)
        try:
            presets = json.loads(encoded)
        except (TypeError, json.JSONDecodeError) as error:
            print(f"Ignoring invalid saved presets: {error}")
            presets = []
        if not isinstance(presets, list):
            presets = []
        self.pool.set_presets(presets)

    def _save_presets(self, presets: list[dict[str, Any]]) -> None:
        """Persist the complete collection emitted by a user Save or Delete."""
        self.settings.setValue("presets", json.dumps(presets, separators=(",", ":")))
        self.settings.sync()


def main() -> int:
    """Launch the host-owned preset persistence example."""
    app = QApplication(sys.argv)
    window = PresetWindow()
    window.resize(1200, 800)
    window.show()
    return app.exec_()


if __name__ == "__main__":
    raise SystemExit(main())
