import datetime
from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="ConflictDate")


@_attrs_define
class ConflictDate:
    """Timeslot in conflict

    Attributes:
        start (Union[Unset, datetime.datetime]):
        stop (Union[Unset, datetime.datetime]):
    """

    start: Union[Unset, datetime.datetime] = UNSET
    stop: Union[Unset, datetime.datetime] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        start: Union[Unset, str] = UNSET
        if not isinstance(self.start, Unset):
            start = self.start.isoformat()

        stop: Union[Unset, str] = UNSET
        if not isinstance(self.stop, Unset):
            stop = self.stop.isoformat()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if start is not UNSET:
            field_dict["start"] = start
        if stop is not UNSET:
            field_dict["stop"] = stop

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        _start = d.pop("start", UNSET)
        start: Union[Unset, datetime.datetime]
        if isinstance(_start, Unset):
            start = UNSET
        else:
            start = isoparse(_start)

        _stop = d.pop("stop", UNSET)
        stop: Union[Unset, datetime.datetime]
        if isinstance(_stop, Unset):
            stop = UNSET
        else:
            stop = isoparse(_stop)

        conflict_date = cls(
            start=start,
            stop=stop,
        )

        conflict_date.additional_properties = d
        return conflict_date

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
