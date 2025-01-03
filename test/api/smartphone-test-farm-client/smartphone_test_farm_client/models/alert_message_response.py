from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.alert_message import AlertMessage


T = TypeVar("T", bound="AlertMessageResponse")


@_attrs_define
class AlertMessageResponse:
    """
    Attributes:
        success (bool):
        description (str):
        alert_message (AlertMessage):
    """

    success: bool
    description: str
    alert_message: "AlertMessage"
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        alert_message = self.alert_message.to_dict()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "alertMessage": alert_message,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.alert_message import AlertMessage

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        alert_message = AlertMessage.from_dict(d.pop("alertMessage"))

        alert_message_response = cls(
            success=success,
            description=description,
            alert_message=alert_message,
        )

        alert_message_response.additional_properties = d
        return alert_message_response

    @property
    def additional_keys(self) -> List[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
