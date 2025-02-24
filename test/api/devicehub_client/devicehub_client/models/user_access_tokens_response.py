from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.token import Token


T = TypeVar("T", bound="UserAccessTokensResponse")


@_attrs_define
class UserAccessTokensResponse:
    """
    Attributes:
        success (bool):
        description (str):
        tokens (List['Token']):
    """

    success: bool
    description: str
    tokens: List["Token"]
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        tokens = []
        for tokens_item_data in self.tokens:
            tokens_item = tokens_item_data.to_dict()
            tokens.append(tokens_item)

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "tokens": tokens,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.token import Token

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        tokens = []
        _tokens = d.pop("tokens")
        for tokens_item_data in _tokens:
            tokens_item = Token.from_dict(tokens_item_data)

            tokens.append(tokens_item)

        user_access_tokens_response = cls(
            success=success,
            description=description,
            tokens=tokens,
        )

        user_access_tokens_response.additional_properties = d
        return user_access_tokens_response

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
