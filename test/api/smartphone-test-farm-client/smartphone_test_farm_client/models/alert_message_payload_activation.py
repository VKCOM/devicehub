from enum import Enum


class AlertMessagePayloadActivation(str, Enum):
    FALSE = "False"
    TRUE = "True"

    def __str__(self) -> str:
        return str(self.value)
