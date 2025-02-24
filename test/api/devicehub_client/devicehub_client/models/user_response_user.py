import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.user_response_user_adb_keys_item import UserResponseUserAdbKeysItem
    from ..models.user_response_user_groups import UserResponseUserGroups
    from ..models.user_response_user_settings import UserResponseUserSettings


T = TypeVar("T", bound="UserResponseUser")


@_attrs_define
class UserResponseUser:
    """
    Attributes:
        field_id (Union[Unset, str]):
        email (Union[Unset, str]):
        name (Union[Unset, str]):
        ip (Union[Unset, str]):
        group (Union[Unset, str]):
        last_logged_in_at (Union[Unset, datetime.datetime]):
        created_at (Union[Unset, datetime.datetime]):
        forwards (Union[Unset, List[Any]]):
        adb_keys (Union[Unset, List['UserResponseUserAdbKeysItem']]):
        settings (Union[Unset, UserResponseUserSettings]):
        accepted_policy (Union[Unset, bool]):
        privilege (Union[Unset, str]):
        groups (Union[Unset, UserResponseUserGroups]):
    """

    field_id: Union[Unset, str] = UNSET
    email: Union[Unset, str] = UNSET
    name: Union[Unset, str] = UNSET
    ip: Union[Unset, str] = UNSET
    group: Union[Unset, str] = UNSET
    last_logged_in_at: Union[Unset, datetime.datetime] = UNSET
    created_at: Union[Unset, datetime.datetime] = UNSET
    forwards: Union[Unset, List[Any]] = UNSET
    adb_keys: Union[Unset, List["UserResponseUserAdbKeysItem"]] = UNSET
    settings: Union[Unset, "UserResponseUserSettings"] = UNSET
    accepted_policy: Union[Unset, bool] = UNSET
    privilege: Union[Unset, str] = UNSET
    groups: Union[Unset, "UserResponseUserGroups"] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        field_id = self.field_id

        email = self.email

        name = self.name

        ip = self.ip

        group = self.group

        last_logged_in_at: Union[Unset, str] = UNSET
        if not isinstance(self.last_logged_in_at, Unset):
            last_logged_in_at = self.last_logged_in_at.isoformat()

        created_at: Union[Unset, str] = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        forwards: Union[Unset, List[Any]] = UNSET
        if not isinstance(self.forwards, Unset):
            forwards = self.forwards

        adb_keys: Union[Unset, List[Dict[str, Any]]] = UNSET
        if not isinstance(self.adb_keys, Unset):
            adb_keys = []
            for adb_keys_item_data in self.adb_keys:
                adb_keys_item = adb_keys_item_data.to_dict()
                adb_keys.append(adb_keys_item)

        settings: Union[Unset, Dict[str, Any]] = UNSET
        if not isinstance(self.settings, Unset):
            settings = self.settings.to_dict()

        accepted_policy = self.accepted_policy

        privilege = self.privilege

        groups: Union[Unset, Dict[str, Any]] = UNSET
        if not isinstance(self.groups, Unset):
            groups = self.groups.to_dict()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if field_id is not UNSET:
            field_dict["_id"] = field_id
        if email is not UNSET:
            field_dict["email"] = email
        if name is not UNSET:
            field_dict["name"] = name
        if ip is not UNSET:
            field_dict["ip"] = ip
        if group is not UNSET:
            field_dict["group"] = group
        if last_logged_in_at is not UNSET:
            field_dict["lastLoggedInAt"] = last_logged_in_at
        if created_at is not UNSET:
            field_dict["createdAt"] = created_at
        if forwards is not UNSET:
            field_dict["forwards"] = forwards
        if adb_keys is not UNSET:
            field_dict["adbKeys"] = adb_keys
        if settings is not UNSET:
            field_dict["settings"] = settings
        if accepted_policy is not UNSET:
            field_dict["acceptedPolicy"] = accepted_policy
        if privilege is not UNSET:
            field_dict["privilege"] = privilege
        if groups is not UNSET:
            field_dict["groups"] = groups

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.user_response_user_adb_keys_item import UserResponseUserAdbKeysItem
        from ..models.user_response_user_groups import UserResponseUserGroups
        from ..models.user_response_user_settings import UserResponseUserSettings

        d = src_dict.copy()
        field_id = d.pop("_id", UNSET)

        email = d.pop("email", UNSET)

        name = d.pop("name", UNSET)

        ip = d.pop("ip", UNSET)

        group = d.pop("group", UNSET)

        _last_logged_in_at = d.pop("lastLoggedInAt", UNSET)
        last_logged_in_at: Union[Unset, datetime.datetime]
        if isinstance(_last_logged_in_at, Unset):
            last_logged_in_at = UNSET
        else:
            last_logged_in_at = isoparse(_last_logged_in_at)

        _created_at = d.pop("createdAt", UNSET)
        created_at: Union[Unset, datetime.datetime]
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        forwards = cast(List[Any], d.pop("forwards", UNSET))

        adb_keys = []
        _adb_keys = d.pop("adbKeys", UNSET)
        for adb_keys_item_data in _adb_keys or []:
            adb_keys_item = UserResponseUserAdbKeysItem.from_dict(adb_keys_item_data)

            adb_keys.append(adb_keys_item)

        _settings = d.pop("settings", UNSET)
        settings: Union[Unset, UserResponseUserSettings]
        if isinstance(_settings, Unset):
            settings = UNSET
        else:
            settings = UserResponseUserSettings.from_dict(_settings)

        accepted_policy = d.pop("acceptedPolicy", UNSET)

        privilege = d.pop("privilege", UNSET)

        _groups = d.pop("groups", UNSET)
        groups: Union[Unset, UserResponseUserGroups]
        if isinstance(_groups, Unset):
            groups = UNSET
        else:
            groups = UserResponseUserGroups.from_dict(_groups)

        user_response_user = cls(
            field_id=field_id,
            email=email,
            name=name,
            ip=ip,
            group=group,
            last_logged_in_at=last_logged_in_at,
            created_at=created_at,
            forwards=forwards,
            adb_keys=adb_keys,
            settings=settings,
            accepted_policy=accepted_policy,
            privilege=privilege,
            groups=groups,
        )

        user_response_user.additional_properties = d
        return user_response_user

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
