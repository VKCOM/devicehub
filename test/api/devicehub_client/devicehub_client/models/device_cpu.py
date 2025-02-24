from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceCpu")


@_attrs_define
class DeviceCpu:
    """
    Attributes:
        cores (Union[Unset, int]):
        freq (Union[Unset, int]):
        name (Union[Unset, str]):
    """

    cores: Union[Unset, int] = UNSET
    freq: Union[Unset, int] = UNSET
    name: Union[Unset, str] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        cores = self.cores

        freq = self.freq

        name = self.name

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if cores is not UNSET:
            field_dict["cores"] = cores
        if freq is not UNSET:
            field_dict["freq"] = freq
        if name is not UNSET:
            field_dict["name"] = name

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        cores = d.pop("cores", UNSET)

        freq = d.pop("freq", UNSET)

        name = d.pop("name", UNSET)

        device_cpu = cls(
            cores=cores,
            freq=freq,
            name=name,
        )

        device_cpu.additional_properties = d
        return device_cpu

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
