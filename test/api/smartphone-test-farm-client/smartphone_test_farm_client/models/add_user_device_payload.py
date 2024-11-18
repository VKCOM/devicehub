from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AddUserDevicePayload")


@_attrs_define
class AddUserDevicePayload:
    """payload object for adding device to user

    Attributes:
        serial (str): Device Serial
        timeout (Union[Unset, int]): Device timeout in ms. If device is kept idle for this period, it will be
            automatically disconnected. Default is provider group timeout
    """

    serial: str
    timeout: Union[Unset, int] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        serial = self.serial

        timeout = self.timeout

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "serial": serial,
            }
        )
        if timeout is not UNSET:
            field_dict["timeout"] = timeout

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        serial = d.pop("serial")

        timeout = d.pop("timeout", UNSET)

        add_user_device_payload = cls(
            serial=serial,
            timeout=timeout,
        )

        add_user_device_payload.additional_properties = d
        return add_user_device_payload

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
