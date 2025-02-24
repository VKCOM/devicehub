from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceBrowserAppsItem")


@_attrs_define
class DeviceBrowserAppsItem:
    """
    Attributes:
        id (Union[Unset, str]):
        type (Union[Unset, str]):
        name (Union[Unset, str]):
        selected (Union[Unset, bool]):
        system (Union[Unset, bool]):
    """

    id: Union[Unset, str] = UNSET
    type: Union[Unset, str] = UNSET
    name: Union[Unset, str] = UNSET
    selected: Union[Unset, bool] = UNSET
    system: Union[Unset, bool] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        id = self.id

        type = self.type

        name = self.name

        selected = self.selected

        system = self.system

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if id is not UNSET:
            field_dict["id"] = id
        if type is not UNSET:
            field_dict["type"] = type
        if name is not UNSET:
            field_dict["name"] = name
        if selected is not UNSET:
            field_dict["selected"] = selected
        if system is not UNSET:
            field_dict["system"] = system

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id", UNSET)

        type = d.pop("type", UNSET)

        name = d.pop("name", UNSET)

        selected = d.pop("selected", UNSET)

        system = d.pop("system", UNSET)

        device_browser_apps_item = cls(
            id=id,
            type=type,
            name=name,
            selected=selected,
            system=system,
        )

        device_browser_apps_item.additional_properties = d
        return device_browser_apps_item

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
