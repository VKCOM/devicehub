from enum import Enum


class AlertMessagePayloadLevel(str, Enum):
    CRITICAL = "Critical"
    INFORMATION = "Information"
    WARNING = "Warning"

    def __str__(self) -> str:
        return str(self.value)
