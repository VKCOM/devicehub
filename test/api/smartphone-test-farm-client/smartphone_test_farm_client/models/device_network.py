from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceNetwork")


@_attrs_define
class DeviceNetwork:
    """
    Attributes:
        connected (Union[Unset, bool]):
        type (Union[Unset, str]):
        subtype (Union[Unset, str]):
        failover (Union[Unset, bool]):
        roaming (Union[Unset, bool]):
    """

    connected: Union[Unset, bool] = UNSET
    type: Union[Unset, str] = UNSET
    subtype: Union[Unset, str] = UNSET
    failover: Union[Unset, bool] = UNSET
    roaming: Union[Unset, bool] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        connected = self.connected

        type = self.type

        subtype = self.subtype

        failover = self.failover

        roaming = self.roaming

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if connected is not UNSET:
            field_dict["connected"] = connected
        if type is not UNSET:
            field_dict["type"] = type
        if subtype is not UNSET:
            field_dict["subtype"] = subtype
        if failover is not UNSET:
            field_dict["failover"] = failover
        if roaming is not UNSET:
            field_dict["roaming"] = roaming

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        connected = d.pop("connected", UNSET)

        type = d.pop("type", UNSET)

        subtype = d.pop("subtype", UNSET)

        failover = d.pop("failover", UNSET)

        roaming = d.pop("roaming", UNSET)

        device_network = cls(
            connected=connected,
            type=type,
            subtype=subtype,
            failover=failover,
            roaming=roaming,
        )

        device_network.additional_properties = d
        return device_network

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