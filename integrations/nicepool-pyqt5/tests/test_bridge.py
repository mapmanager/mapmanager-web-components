from __future__ import annotations

import json

from PyQt5.QtTest import QSignalSpy

from nicepool_pyqt5.bridge import WebChannelBridge


def test_bridge_decodes_object_messages() -> None:
    bridge = WebChannelBridge()
    messages = QSignalSpy(bridge.message_received)

    bridge.receive('{"kind":"ready"}')

    assert len(messages) == 1
    assert messages[0][0] == {"kind": "ready"}


def test_bridge_rejects_invalid_messages() -> None:
    bridge = WebChannelBridge()
    errors = QSignalSpy(bridge.invalid_message)

    bridge.receive("[]")

    assert len(errors) == 1
    assert "expected a JSON object" in errors[0][0]


def test_bridge_encodes_commands() -> None:
    bridge = WebChannelBridge()
    commands = QSignalSpy(bridge.command)

    bridge.send({"id": 1, "name": "getTheme", "payload": None})

    assert len(commands) == 1
    assert json.loads(commands[0][0]) == {"id": 1, "name": "getTheme", "payload": None}

