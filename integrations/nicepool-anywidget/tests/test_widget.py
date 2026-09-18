from nicepool_anywidget import NicePoolAnyWidget


def test_records_and_initial_selection():
    widget = NicePoolAnyWidget(
        [
            {"id": "a", "condition": "control", "value": 1.0},
            {"id": "b", "condition": "treated", "value": 2.0},
        ],
        row_id_column="id",
    )

    assert widget.data["rowIdColumn"] == "id"
    assert widget.data["rows"][1]["value"] == 2.0
    assert widget.selection == {"primaryRowId": None, "selectedRowIds": []}


def test_replace_data_preserves_row_id_column():
    widget = NicePoolAnyWidget([{"id": "a", "value": 1}], row_id_column="id")

    widget.set_data([{"id": "b", "value": 2}])

    assert widget.data == {
        "rowIdColumn": "id",
        "rows": [{"id": "b", "value": 2}],
    }


def test_state_preserving_replace_uses_a_distinct_request():
    widget = NicePoolAnyWidget([{"id": "a", "value": 1}], row_id_column="id")

    widget.replace_data([{"id": "b", "value": 2}])

    assert widget.data["rows"] == [{"id": "a", "value": 1}]
    assert widget._replace_data_request == {
        "revision": 1,
        "data": {"rowIdColumn": "id", "rows": [{"id": "b", "value": 2}]},
    }
