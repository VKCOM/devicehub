from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.alert_message_payload_activation import AlertMessagePayloadActivation
from ..models.alert_message_payload_level import AlertMessagePayloadLevel
from ..types import UNSET, Unset

T = TypeVar("T", bound="AlertMessagePayload")


@_attrs_define
class AlertMessagePayload:
    """Payload object for updating the alert message

    Attributes:
        activation (Union[Unset, AlertMessagePayloadActivation]): Enable or disablee the alert message
        data (Union[Unset, str]): Alert message text to display
        level (Union[Unset, AlertMessagePayloadLevel]): Alert message level
    """

    activation: Union[Unset, AlertMessagePayloadActivation] = UNSET
    data: Union[Unset, str] = UNSET
    level: Union[Unset, AlertMessagePayloadLevel] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        activation: Union[Unset, str] = UNSET
        if not isinstance(self.activation, Unset):
            activation = self.activation.value

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
        _activation = d.pop("activation", UNSET)
        activation: Union[Unset, AlertMessagePayloadActivation]
        if isinstance(_activation, Unset):
            activation = UNSET
        else:
            activation = AlertMessagePayloadActivation(_activation)

        data = d.pop("data", UNSET)

        _level = d.pop("level", UNSET)
        level: Union[Unset, AlertMessagePayloadLevel]
        if isinstance(_level, Unset):
            level = UNSET
        else:
            level = AlertMessagePayloadLevel(_level)

        alert_message_payload = cls(
            activation=activation,
            data=data,
            level=level,
        )

        alert_message_payload.additional_properties = d
        return alert_message_payload

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
