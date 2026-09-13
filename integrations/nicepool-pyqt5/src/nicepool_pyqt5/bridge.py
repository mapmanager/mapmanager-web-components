"""Private Qt WebChannel transport for NicePool."""

from __future__ import annotations

import json
from typing import Any

from PyQt5.QtCore import QObject, pyqtSignal, pyqtSlot


class WebChannelBridge(QObject):
    """Exchange JSON messages with the browser host page."""

    command = pyqtSignal(str)
    message_received = pyqtSignal(object)
    invalid_message = pyqtSignal(str)

    @pyqtSlot(str)
    def receive(self, message: str) -> None:
        """Receive and decode one message emitted by the browser."""
        try:
            decoded: Any = json.loads(message)
        except (TypeError, json.JSONDecodeError) as exc:
            self.invalid_message.emit(f"Invalid NicePool browser message: {exc}")
            return
        if not isinstance(decoded, dict):
            self.invalid_message.emit("Invalid NicePool browser message: expected a JSON object")
            return
        self.message_received.emit(decoded)

    def send(self, message: dict[str, Any]) -> None:
        """Encode and send one command to the browser."""
        self.command.emit(json.dumps(message, allow_nan=False, separators=(",", ":")))

