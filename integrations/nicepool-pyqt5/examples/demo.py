"""Run a small standalone NicePool PyQt5 demonstration."""

from __future__ import annotations

import sys

import pandas as pd
from PyQt5.QtWidgets import QApplication, QMainWindow

from nicepool_pyqt5 import NicePoolWidget


def sample_dataframe() -> pd.DataFrame:
    """Return deterministic data for exercising the adapter."""
    return pd.DataFrame(
        [
            {
                "pool_row_id": f"row-{index:03d}",
                "condition": ("control", "treated")[index % 2],
                "accept": "no" if index % 11 == 0 else "yes",
                "time": index / 10,
                "amplitude": 5 + (index % 13) / 3,
            }
            for index in range(100)
        ]
    )


def main() -> int:
    """Launch the demo window."""
    application = QApplication(sys.argv)
    window = QMainWindow()
    pool = NicePoolWidget(controls_collapsed=True)
    pool.error_occurred.connect(print)
    pool.selection_changed.connect(lambda selection: print("Selection:", selection))
    pool.set_dataframe(
        sample_dataframe(),
        row_id_column="pool_row_id",
        schema=[
            {"name": "pool_row_id", "type": "string", "axis_label": "Row"},
            {
                "name": "condition",
                "type": "string",
                "axis_label": "Condition",
                "categorical": True,
            },
            {
                "name": "accept",
                "type": "string",
                "axis_label": "Accepted",
                "categorical": True,
            },
            {"name": "time", "type": "number", "axis_label": "Time"},
            {
                "name": "amplitude",
                "type": "number",
                "axis_label": "Amplitude",
            },
        ],
        preset_definitions=[
            {
                "name": "Amplitude over time",
                "state": {
                    "layout": "1x1",
                    "plots": [
                        {
                            "plotType": "scatter",
                            "xColumn": "time",
                            "yColumn": "amplitude",
                            "colorColumn": "condition",
                        }
                    ],
                },
            },
            {
                "name": "Amplitude by condition",
                "state": {
                    "layout": "1x1",
                    "plots": [
                        {
                            "plotType": "swarm",
                            "xColumn": "time",
                            "yColumn": "amplitude",
                            "groupColumn": "condition",
                        }
                    ],
                },
            },
        ],
        default_preset="Amplitude over time",
    )
    window.setCentralWidget(pool)
    window.resize(1200, 800)
    window.setWindowTitle("NicePool PyQt5")
    window.show()
    return application.exec()


if __name__ == "__main__":
    raise SystemExit(main())
