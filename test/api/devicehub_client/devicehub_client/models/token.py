from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="Token")


@_attrs_define
class Token:
    """
    Attributes:
        email (Union[Unset, str]):
        id (Union[Unset, str]):
        title (Union[Unset, str]):
        jwt (Union[Unset, str]):
    """

    email: Union[Unset, str] = UNSET
    id: Union[Unset, str] = UNSET
    title: Union[Unset, str] = UNSET
    jwt: Union[Unset, str] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        email = self.email

        id = self.id

        title = self.title

        jwt = self.jwt

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if email is not UNSET:
            field_dict["email"] = email
        if id is not UNSET:
            field_dict["id"] = id
        if title is not UNSET:
            field_dict["title"] = title
        if jwt is not UNSET:
            field_dict["jwt"] = jwt

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email", UNSET)

        id = d.pop("id", UNSET)

        title = d.pop("title", UNSET)

        jwt = d.pop("jwt", UNSET)

        token = cls(
            email=email,
            id=id,
            title=title,
            jwt=jwt,
        )

        token.additional_properties = d
        return token

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
