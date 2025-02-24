from typing import Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="RemoteConnectUserDeviceResponse")


@_attrs_define
class RemoteConnectUserDeviceResponse:
    """
    Attributes:
        success (bool):
        description (str):
        remote_connect_url (str):
    """

    success: bool
    description: str
    remote_connect_url: str
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        remote_connect_url = self.remote_connect_url

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "remoteConnectUrl": remote_connect_url,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        remote_connect_url = d.pop("remoteConnectUrl")

        remote_connect_user_device_response = cls(
            success=success,
            description=description,
            remote_connect_url=remote_connect_url,
        )

        remote_connect_user_device_response.additional_properties = d
        return remote_connect_user_device_response

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
