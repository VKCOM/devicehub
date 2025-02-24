from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.user_response_user_settings_alert_message_level import UserResponseUserSettingsAlertMessageLevel
from ..types import UNSET, Unset

T = TypeVar("T", bound="UserResponseUserSettingsAlertMessage")


@_attrs_define
class UserResponseUserSettingsAlertMessage:
    """
    Attributes:
        activation (Union[Unset, str]):
        data (Union[Unset, str]):
        level (Union[Unset, UserResponseUserSettingsAlertMessageLevel]):
    """

    activation: Union[Unset, str] = UNSET
    data: Union[Unset, str] = UNSET
    level: Union[Unset, UserResponseUserSettingsAlertMessageLevel] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        activation = self.activation

        data = self.data

        level: Union[Unset, str] = UNSET
        if not isinstance(self.level, Unset):
            level = self.level.value

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if activation is not UNSET:
            field_dict["activation"] = activation
        if data is not UNSET:
            field_dict["data"] = data
        if level is not UNSET:
            field_dict["level"] = level

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        activation = d.pop("activation", UNSET)

        data = d.pop("data", UNSET)

        _level = d.pop("level", UNSET)
        level: Union[Unset, UserResponseUserSettingsAlertMessageLevel]
        if isinstance(_level, Unset):
            level = UNSET
        else:
            level = UserResponseUserSettingsAlertMessageLevel(_level)

        user_response_user_settings_alert_message = cls(
            activation=activation,
            data=data,
            level=level,
        )

        user_response_user_settings_alert_message.additional_properties = d
        return user_response_user_settings_alert_message

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
