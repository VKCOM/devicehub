from typing import Any, Dict, List, Type, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AdbInstallFlagsPayload")


@_attrs_define
class AdbInstallFlagsPayload:
    """List of flags for adb install

    Attributes:
        url (str):
        install_flags (Union[Unset, List[str]]):
    """

    url: str
    install_flags: Union[Unset, List[str]] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        url = self.url

        install_flags: Union[Unset, List[str]] = UNSET
        if not isinstance(self.install_flags, Unset):
            install_flags = self.install_flags

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "url": url,
            }
        )
        if install_flags is not UNSET:
            field_dict["installFlags"] = install_flags

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        url = d.pop("url")

        install_flags = cast(List[str], d.pop("installFlags", UNSET))

        adb_install_flags_payload = cls(
            url=url,
            install_flags=install_flags,
        )

        adb_install_flags_payload.additional_properties = d
        return adb_install_flags_payload

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
