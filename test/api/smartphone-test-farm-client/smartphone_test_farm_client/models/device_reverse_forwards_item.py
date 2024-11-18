from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceReverseForwardsItem")


@_attrs_define
class DeviceReverseForwardsItem:
    """
    Attributes:
        id (Union[Unset, str]):
        device_port (Union[Unset, int]):
        target_host (Union[Unset, str]):
        target_port (Union[Unset, int]):
    """

    id: Union[Unset, str] = UNSET
    device_port: Union[Unset, int] = UNSET
    target_host: Union[Unset, str] = UNSET
    target_port: Union[Unset, int] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        id = self.id

        device_port = self.device_port

        target_host = self.target_host

        target_port = self.target_port

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if id is not UNSET:
            field_dict["id"] = id
        if device_port is not UNSET:
            field_dict["devicePort"] = device_port
        if target_host is not UNSET:
            field_dict["targetHost"] = target_host
        if target_port is not UNSET:
            field_dict["targetPort"] = target_port

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id", UNSET)

        device_port = d.pop("devicePort", UNSET)

        target_host = d.pop("targetHost", UNSET)

        target_port = d.pop("targetPort", UNSET)

        device_reverse_forwards_item = cls(
            id=id,
            device_port=device_port,
            target_host=target_host,
            target_port=target_port,
        )

        device_reverse_forwards_item.additional_properties = d
        return device_reverse_forwards_item

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
