"""Convert Python records and pandas DataFrames to NicePool datasets."""

from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd


def _normalize_value(value: Any, *, row_index: int, column: str) -> str | int | float | bool | None:
    """Return one NicePool-compatible scalar or raise a contextual error."""
    missing = pd.isna(value)
    if isinstance(missing, (bool, np.bool_)) and bool(missing):
        return None
    if isinstance(value, np.generic):
        value = value.item()
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if math.isfinite(value):
            return value
        raise ValueError(f"Row {row_index} column {column!r} contains a non-finite number")
    raise ValueError(
        f"Row {row_index} column {column!r} has unsupported value type "
        f"{type(value).__name__}; expected string, finite number, boolean, or missing"
    )


def records_to_dataset(
    records: Sequence[Mapping[str, Any]],
    *,
    row_id_column: str,
    schema: Sequence[Mapping[str, Any]] | None = None,
    pre_filter_columns: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Create one complete NicePool dataset from rectangular records."""
    if not row_id_column:
        raise ValueError("row_id_column must not be empty")
    rows = list(records)
    if not rows:
        raise ValueError("NicePool requires at least one data row")

    if not isinstance(rows[0], Mapping):
        raise TypeError("Row 0 must be a mapping")
    first_columns = list(rows[0])
    if not first_columns or any(not isinstance(column, str) for column in first_columns):
        raise ValueError("NicePool column names must be nonempty strings")
    if any(not column for column in first_columns):
        raise ValueError("NicePool column names must be nonempty strings")
    if row_id_column not in first_columns:
        raise ValueError(f"Dataset is missing row-ID column {row_id_column!r}")

    expected_columns = set(first_columns)
    normalized_rows: list[dict[str, Any]] = []
    row_ids: set[str] = set()
    for row_index, source in enumerate(rows):
        if not isinstance(source, Mapping):
            raise TypeError(f"Row {row_index} must be a mapping")
        source_columns = list(source)
        if any(not isinstance(column, str) or not column for column in source_columns):
            raise ValueError(f"Row {row_index} column names must be nonempty strings")
        if set(source_columns) != expected_columns:
            missing = sorted(expected_columns - set(source_columns))
            extra = sorted(set(source_columns) - expected_columns)
            raise ValueError(f"Row {row_index} is not rectangular; missing={missing!r}, extra={extra!r}")
        normalized = {
            column: _normalize_value(source[column], row_index=row_index, column=column)
            for column in first_columns
        }
        row_id_value = normalized[row_id_column]
        if row_id_value is None or isinstance(row_id_value, bool) or str(row_id_value) == "":
            raise ValueError(f"Row {row_index} has an empty or invalid row ID in {row_id_column!r}")
        row_id = str(row_id_value)
        if row_id in row_ids:
            raise ValueError(f"Duplicate row ID {row_id!r}")
        row_ids.add(row_id)
        normalized[row_id_column] = row_id
        normalized_rows.append(normalized)

    dataset: dict[str, Any] = {"rowIdColumn": row_id_column, "rows": normalized_rows}
    if schema is not None:
        dataset["schema"] = [dict(column) for column in schema]
    if pre_filter_columns is not None:
        dataset["preFilterColumns"] = list(pre_filter_columns)
    return dataset


def dataframe_to_dataset(
    dataframe: pd.DataFrame,
    *,
    row_id_column: str,
    schema: Sequence[Mapping[str, Any]] | None = None,
    pre_filter_columns: Sequence[str] | None = None,
) -> dict[str, Any]:
    """Create one complete NicePool dataset without modifying the DataFrame."""
    if dataframe.columns.has_duplicates:
        raise ValueError("NicePool DataFrame columns must be unique")
    if any(not isinstance(column, str) or not column for column in dataframe.columns):
        raise ValueError("NicePool DataFrame column names must be nonempty strings")
    return records_to_dataset(
        dataframe.to_dict(orient="records"),
        row_id_column=row_id_column,
        schema=schema,
        pre_filter_columns=pre_filter_columns,
    )
