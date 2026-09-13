from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from nicepool_pyqt5 import dataframe_to_dataset, records_to_dataset


def test_dataframe_conversion_normalizes_scalars_and_missing_values() -> None:
    frame = pd.DataFrame(
        {
            "id": [np.int64(1), np.int64(2)],
            "value": [np.float64(2.5), np.nan],
            "accept": [True, pd.NA],
        }
    )

    dataset = dataframe_to_dataset(frame, row_id_column="id")

    assert dataset == {
        "rowIdColumn": "id",
        "rows": [
            {"id": "1", "value": 2.5, "accept": True},
            {"id": "2", "value": None, "accept": None},
        ],
    }
    assert math.isnan(frame.loc[1, "value"])


def test_records_must_be_rectangular() -> None:
    with pytest.raises(ValueError, match="not rectangular"):
        records_to_dataset([{"id": "a", "value": 1}, {"id": "b"}], row_id_column="id")


def test_rows_must_be_mappings_with_string_columns() -> None:
    with pytest.raises(TypeError, match="Row 0 must be a mapping"):
        records_to_dataset([1], row_id_column="id")  # type: ignore[list-item]
    with pytest.raises(ValueError, match="column names must be nonempty strings"):
        records_to_dataset([{1: "a"}], row_id_column="id")  # type: ignore[dict-item]


def test_normalized_row_ids_must_be_unique() -> None:
    with pytest.raises(ValueError, match="Duplicate row ID"):
        records_to_dataset([{"id": 1}, {"id": "1"}], row_id_column="id")


@pytest.mark.parametrize("value", [float("inf"), float("-inf"), [1, 2], {"nested": True}])
def test_unsupported_values_are_rejected(value: object) -> None:
    with pytest.raises(ValueError, match="non-finite|unsupported"):
        records_to_dataset([{"id": "a", "value": value}], row_id_column="id")


def test_conversion_has_no_artificial_row_limit() -> None:
    records = [{"id": index, "value": index / 10} for index in range(1_205)]

    dataset = records_to_dataset(records, row_id_column="id")

    assert len(dataset["rows"]) == 1_205


def test_empty_dataframe_is_rejected() -> None:
    frame = pd.DataFrame(columns=["id", "value"])

    with pytest.raises(ValueError, match="at least one data row"):
        dataframe_to_dataset(frame, row_id_column="id")
