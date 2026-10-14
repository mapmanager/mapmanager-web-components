"""Dataset definitions for the standalone NicePool PyQt5 demonstration."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
LUO_DATA_DIRECTORY = REPOSITORY_ROOT / "examples" / "nicepool" / "data"


@dataclass(frozen=True)
class DemoDataset:
    """One complete dataset-specific NicePool initialization payload."""

    dataframe: pd.DataFrame
    row_id_column: str
    schema: Sequence[Mapping[str, Any]]
    pre_filter_columns: Sequence[str]
    preset_definitions: Sequence[Mapping[str, Any]]
    default_preset: str


def _synthetic_dataframe() -> pd.DataFrame:
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


def load_synthetic_dataset() -> DemoDataset:
    """Build the small generated dataset used for quick smoke tests."""
    return DemoDataset(
        dataframe=_synthetic_dataframe(),
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
            {"name": "amplitude", "type": "number", "axis_label": "Amplitude"},
        ],
        pre_filter_columns=["accept", "condition"],
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


def load_luo_dataset() -> DemoDataset:
    """Load the tracked Luo et al. table and its caller-authored schema.

    CSV parsing remains a responsibility of this demonstration host. NicePool
    receives only the resulting DataFrame, complete schema, and explicit list
    of columns that should be exposed as pre-aggregation filters.
    """
    csv_path = LUO_DATA_DIRECTORY / "luo_et_al.csv"
    schema_path = LUO_DATA_DIRECTORY / "luo_et_al.json"
    dataframe = pd.read_csv(csv_path)
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    if not isinstance(schema, list):
        raise ValueError(f"NicePool schema must be a list: {schema_path}")
    return DemoDataset(
        dataframe=dataframe,
        row_id_column="row_id",
        schema=schema,
        pre_filter_columns=["include", "condition", "sweep"],
        preset_definitions=[
            {
                "name": "Peak height by condition",
                "state": {
                    "layout": "1x1",
                    "plots": [
                        {
                            "plotType": "swarm",
                            "preFilters": {"include": "yes"},
                            "xColumn": "thresholdSec",
                            "yColumn": "peakHeight",
                            "groupColumn": "condition",
                            "showRaw": True,
                            "showMean": True,
                            "showErrorBars": True,
                            "errorBarType": "sem",
                        }
                    ],
                },
            }
        ],
        default_preset="Peak height by condition",
    )


DatasetLoader = Callable[[], DemoDataset]
DATASET_LOADERS: Mapping[str, DatasetLoader] = {
    "Synthetic": load_synthetic_dataset,
    "Luo et al. 2024": load_luo_dataset,
}
