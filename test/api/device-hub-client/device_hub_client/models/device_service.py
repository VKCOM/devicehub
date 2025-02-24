from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceService")


@_attrs_define
class DeviceService:
    """
    Attributes:
        has_hms (Union[Unset, bool]):
        has_gms (Union[Unset, bool]):
    """

    has_hms: Union[Unset, bool] = UNSET
    has_gms: Union[Unset, bool] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        has_hms = self.has_hms

        has_gms = self.has_gms

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if has_hms is not UNSET:
            field_dict["hasHMS"] = has_hms
        if has_gms is not UNSET:
            field_dict["hasGMS"] = has_gms

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        has_hms = d.pop("hasHMS", UNSET)

        has_gms = d.pop("hasGMS", UNSET)

        device_service = cls(
            has_hms=has_hms,
            has_gms=has_gms,
        )

        device_service.additional_properties = d
        return device_service

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
