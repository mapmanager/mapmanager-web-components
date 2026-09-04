from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import anywidget
import traitlets


_STATIC = Path(__file__).parent / "static"


def _records(data: Sequence[Mapping[str, Any]] | Any) -> list[dict[str, Any]]:
    """Convert records or a pandas-like dataframe to row dictionaries."""
    if hasattr(data, "to_dict"):
        records = data.to_dict(orient="records")
    else:
        records = data
    return [dict(row) for row in records]


class NicePoolAnyWidget(anywidget.AnyWidget):
    """Thin Jupyter adapter around the existing NicePool custom element.

    NicePool's TypeScript implementation owns filtering, statistics, plotting,
    state, and selection semantics. This class only synchronizes its public data
    and state contracts with Python.
    """

    _esm = _STATIC / "widget.js"

    data = traitlets.Dict().tag(sync=True)
    state = traitlets.Dict().tag(sync=True)
    selection = traitlets.Dict().tag(sync=True)
    plot_presets = traitlets.List().tag(sync=True)
    theme = traitlets.Enum(["dark", "light"], default_value="dark").tag(sync=True)
    height = traitlets.Int(default_value=720, min=240).tag(sync=True)

    @traitlets.default("state")
    def _default_state(self) -> dict[str, Any]:
        return {}

    @traitlets.default("selection")
    def _default_selection(self) -> dict[str, Any]:
        return {"primaryRowId": None, "selectedRowIds": []}

    @traitlets.default("plot_presets")
    def _default_plot_presets(self) -> list[dict[str, Any]]:
        return []

    def __init__(
        self,
        rows: Sequence[Mapping[str, Any]] | Any,
        *,
        row_id_column: str,
        schema: Sequence[Mapping[str, Any]] | None = None,
        **kwargs: Any,
    ) -> None:
        payload: dict[str, Any] = {
            "rows": _records(rows),
            "rowIdColumn": row_id_column,
        }
        if schema is not None:
            payload["schema"] = [dict(column) for column in schema]
        super().__init__(data=payload, **kwargs)

    def set_data(
        self,
        rows: Sequence[Mapping[str, Any]] | Any,
        *,
        row_id_column: str | None = None,
        schema: Sequence[Mapping[str, Any]] | None = None,
    ) -> None:
        """Replace the complete dataset using NicePool's public data contract."""
        payload: dict[str, Any] = {
            "rows": _records(rows),
            "rowIdColumn": row_id_column or self.data["rowIdColumn"],
        }
        if schema is not None:
            payload["schema"] = [dict(column) for column in schema]
        self.data = payload
