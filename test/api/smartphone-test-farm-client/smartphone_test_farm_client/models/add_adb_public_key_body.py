from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AddAdbPublicKeyBody")


@_attrs_define
class AddAdbPublicKeyBody:
    """
    Attributes:
        publickey (str): adb public key (~/.android/id_rsa.pub)
        title (Union[Unset, str]): By default will be extracted from public key
    """

    publickey: str
    title: Union[Unset, str] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        publickey = self.publickey

        title = self.title

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "publickey": publickey,
            }
        )
        if title is not UNSET:
            field_dict["title"] = title

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        publickey = d.pop("publickey")

        title = d.pop("title", UNSET)

        add_adb_public_key_body = cls(
            publickey=publickey,
            title=title,
        )

        add_adb_public_key_body.additional_properties = d
        return add_adb_public_key_body

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
