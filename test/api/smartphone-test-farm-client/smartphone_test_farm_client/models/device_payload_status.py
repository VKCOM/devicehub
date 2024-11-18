from enum import Enum


class DevicePayloadStatus(str, Enum):
    DISCONNECTED = "Disconnected"

    def __str__(self) -> str:
        return str(self.value)
