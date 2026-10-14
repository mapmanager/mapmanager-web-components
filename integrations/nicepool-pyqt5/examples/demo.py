"""Run a small standalone NicePool PyQt5 demonstration."""

from __future__ import annotations

import sys

from PyQt5.QtWidgets import (
    QApplication,
    QComboBox,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QVBoxLayout,
    QWidget,
)

from nicepool_pyqt5 import NicePoolWidget
from demo_data import DATASET_LOADERS, DemoDataset


class DemoWindow(QMainWindow):
    """Host NicePool with demonstration-only native Qt controls."""

    def __init__(self) -> None:
        super().__init__()
        self._pool = NicePoolWidget(controls_collapsed=True)
        self._pool.error_occurred.connect(print)
        self._pool.selection_changed.connect(
            lambda selection: print("Selection:", selection)
        )

        self._dataset_selector = QComboBox()
        self._dataset_selector.addItems(DATASET_LOADERS)
        self._dataset_selector.currentTextChanged.connect(self._load_dataset)

        selector_layout = QHBoxLayout()
        selector_layout.addWidget(QLabel("Dataset"))
        selector_layout.addWidget(self._dataset_selector)
        selector_layout.addStretch(1)

        content_layout = QVBoxLayout()
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.addLayout(selector_layout)
        content_layout.addWidget(self._pool, 1)
        content = QWidget()
        content.setLayout(content_layout)
        self.setCentralWidget(content)

        self.resize(1200, 800)
        self.setWindowTitle("NicePool PyQt5")
        self._load_dataset(self._dataset_selector.currentText())

    def _load_dataset(self, label: str) -> None:
        """Load one demo dataset without adding dataset UI to NicePool itself."""
        loader = DATASET_LOADERS.get(label)
        if loader is None:
            raise ValueError(f"Unknown NicePool demo dataset: {label!r}")
        self._initialize_pool(loader())

    def _initialize_pool(self, dataset: DemoDataset) -> None:
        """Send one complete, dataset-aware initialization to NicePool."""
        self._pool.set_dataframe(
            dataset.dataframe,
            row_id_column=dataset.row_id_column,
            schema=dataset.schema,
            pre_filter_columns=dataset.pre_filter_columns,
            preset_definitions=dataset.preset_definitions,
            default_preset=dataset.default_preset,
        )


def main() -> int:
    """Launch the demo window."""
    application = QApplication(sys.argv)
    window = DemoWindow()
    window.show()
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(main())
