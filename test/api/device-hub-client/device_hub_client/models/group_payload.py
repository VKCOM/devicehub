import datetime
from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.group_payload_class import GroupPayloadClass
from ..models.group_payload_state import GroupPayloadState
from ..types import UNSET, Unset

T = TypeVar("T", bound="GroupPayload")


@_attrs_define
class GroupPayload:
    """Payload object for creating/updating a group

    Attributes:
        name (Union[Unset, str]): Group Name; default value => generated at runtime
        start_time (Union[Unset, datetime.datetime]): Group starting time (in UTC, conforming to RFC 3339 section 5.6);
            default value => group creation time
        stop_time (Union[Unset, datetime.datetime]): Group expiration time (in UTC, conforming to RFC 3339 section 5.6);
            default value => startTime + 1 hour
        class_ (Union[Unset, GroupPayloadClass]): Group class; privileged value => debug, bookable, standard
        repetitions (Union[Unset, int]): Group repetitions; default value => 0
        state (Union[Unset, GroupPayloadState]): Group state; default value => pending or ready for bookable/standard
            classes
    """

    name: Union[Unset, str] = UNSET
    start_time: Union[Unset, datetime.datetime] = UNSET
    stop_time: Union[Unset, datetime.datetime] = UNSET
    class_: Union[Unset, GroupPayloadClass] = UNSET
    repetitions: Union[Unset, int] = UNSET
    state: Union[Unset, GroupPayloadState] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        name = self.name

        start_time: Union[Unset, str] = UNSET
        if not isinstance(self.start_time, Unset):
            start_time = self.start_time.isoformat()

        stop_time: Union[Unset, str] = UNSET
        if not isinstance(self.stop_time, Unset):
            stop_time = self.stop_time.isoformat()

        class_: Union[Unset, str] = UNSET
        if not isinstance(self.class_, Unset):
            class_ = self.class_.value

        repetitions = self.repetitions

        state: Union[Unset, str] = UNSET
        if not isinstance(self.state, Unset):
            state = self.state.value

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if start_time is not UNSET:
            field_dict["startTime"] = start_time
        if stop_time is not UNSET:
            field_dict["stopTime"] = stop_time
        if class_ is not UNSET:
            field_dict["class"] = class_
        if repetitions is not UNSET:
            field_dict["repetitions"] = repetitions
        if state is not UNSET:
            field_dict["state"] = state

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name", UNSET)

        _start_time = d.pop("startTime", UNSET)
        start_time: Union[Unset, datetime.datetime]
        if isinstance(_start_time, Unset):
            start_time = UNSET
        else:
            start_time = isoparse(_start_time)

        _stop_time = d.pop("stopTime", UNSET)
        stop_time: Union[Unset, datetime.datetime]
        if isinstance(_stop_time, Unset):
            stop_time = UNSET
        else:
            stop_time = isoparse(_stop_time)

        _class_ = d.pop("class", UNSET)
        class_: Union[Unset, GroupPayloadClass]
        if isinstance(_class_, Unset):
            class_ = UNSET
        else:
            class_ = GroupPayloadClass(_class_)

        repetitions = d.pop("repetitions", UNSET)

        _state = d.pop("state", UNSET)
        state: Union[Unset, GroupPayloadState]
        if isinstance(_state, Unset):
            state = UNSET
        else:
            state = GroupPayloadState(_state)

        group_payload = cls(
            name=name,
            start_time=start_time,
            stop_time=stop_time,
            class_=class_,
            repetitions=repetitions,
            state=state,
        )

        group_payload.additional_properties = d
        return group_payload

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
