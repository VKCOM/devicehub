from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.device import Device


T = TypeVar("T", bound="DeviceResponse")


@_attrs_define
class DeviceResponse:
    """
    Attributes:
        success (bool):
        description (str):
        device (Device):
    """

    success: bool
    description: str
    device: "Device"
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        device = self.device.to_dict()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "device": device,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.device import Device

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        device = Device.from_dict(d.pop("device"))

        device_response = cls(
            success=success,
            description=description,
            device=device,
        )

        device_response.additional_properties = d
        return device_response

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
