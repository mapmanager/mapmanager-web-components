from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from nicepool_pyqt5 import dataframe_to_dataset


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
DATA_DIRECTORY = REPOSITORY_ROOT / "examples" / "nicepool" / "data"


def test_luo_csv_and_schema_form_a_complete_nicepool_dataset() -> None:
    """Keep the tracked scientific example synchronized with its schema."""
    frame = pd.read_csv(DATA_DIRECTORY / "luo_et_al.csv")
    schema = json.loads((DATA_DIRECTORY / "luo_et_al.json").read_text())

    assert list(frame.columns) == [column["name"] for column in schema]
    assert len(frame) == 9_382
    assert frame["row_id"].is_unique
    assert frame["row_id"].notna().all()

    dataset = dataframe_to_dataset(
        frame,
        row_id_column="row_id",
        schema=schema,
        pre_filter_columns=["include", "condition", "sweep"],
    )

    assert dataset["rowIdColumn"] == "row_id"
    assert dataset["preFilterColumns"] == ["include", "condition", "sweep"]
    assert len(dataset["rows"]) == len(frame)
