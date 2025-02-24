from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.user_list_response_users_item import UserListResponseUsersItem


T = TypeVar("T", bound="UserListResponse")


@_attrs_define
class UserListResponse:
    """
    Attributes:
        success (bool):
        description (str):
        users (List['UserListResponseUsersItem']):
    """

    success: bool
    description: str
    users: List["UserListResponseUsersItem"]
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        users = []
        for users_item_data in self.users:
            users_item = users_item_data.to_dict()
            users.append(users_item)

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "users": users,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.user_list_response_users_item import UserListResponseUsersItem

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        users = []
        _users = d.pop("users")
        for users_item_data in _users:
            users_item = UserListResponseUsersItem.from_dict(users_item_data)

            users.append(users_item)

        user_list_response = cls(
            success=success,
            description=description,
            users=users,
        )

        user_list_response.additional_properties = d
        return user_list_response

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
