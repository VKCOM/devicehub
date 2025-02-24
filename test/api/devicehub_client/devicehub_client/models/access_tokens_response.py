from typing import Any, Dict, List, Type, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AccessTokensResponse")


@_attrs_define
class AccessTokensResponse:
    """
    Attributes:
        success (bool):
        titles (Union[Unset, List[str]]):
    """

    success: bool
    titles: Union[Unset, List[str]] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        titles: Union[Unset, List[str]] = UNSET
        if not isinstance(self.titles, Unset):
            titles = self.titles

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
            }
        )
        if titles is not UNSET:
            field_dict["titles"] = titles

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        success = d.pop("success")

        titles = cast(List[str], d.pop("titles", UNSET))

        access_tokens_response = cls(
            success=success,
            titles=titles,
        )

        access_tokens_response.additional_properties = d
        return access_tokens_response

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
