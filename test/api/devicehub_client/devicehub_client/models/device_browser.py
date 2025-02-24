from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.device_browser_apps_item import DeviceBrowserAppsItem


T = TypeVar("T", bound="DeviceBrowser")


@_attrs_define
class DeviceBrowser:
    """
    Attributes:
        selected (Union[Unset, bool]):
        apps (Union[Unset, List['DeviceBrowserAppsItem']]):
    """

    selected: Union[Unset, bool] = UNSET
    apps: Union[Unset, List["DeviceBrowserAppsItem"]] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        selected = self.selected

        apps: Union[Unset, List[Dict[str, Any]]] = UNSET
        if not isinstance(self.apps, Unset):
            apps = []
            for apps_item_data in self.apps:
                apps_item = apps_item_data.to_dict()
                apps.append(apps_item)

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if selected is not UNSET:
            field_dict["selected"] = selected
        if apps is not UNSET:
            field_dict["apps"] = apps

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.device_browser_apps_item import DeviceBrowserAppsItem

        d = src_dict.copy()
        selected = d.pop("selected", UNSET)

        apps = []
        _apps = d.pop("apps", UNSET)
        for apps_item_data in _apps or []:
            apps_item = DeviceBrowserAppsItem.from_dict(apps_item_data)

            apps.append(apps_item)

        device_browser = cls(
            selected=selected,
            apps=apps,
        )

        device_browser.additional_properties = d
        return device_browser

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
