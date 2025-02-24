from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.conflict_date import ConflictDate
    from ..models.conflict_owner import ConflictOwner


T = TypeVar("T", bound="Conflict")


@_attrs_define
class Conflict:
    """
    Attributes:
        devices (Union[Unset, List[str]]): Devices in conflict
        date (Union[Unset, ConflictDate]): Timeslot in conflict
        group (Union[Unset, str]): Name of the group in conflict
        owner (Union[Unset, ConflictOwner]): Owner of the group in conflict
    """

    devices: Union[Unset, List[str]] = UNSET
    date: Union[Unset, "ConflictDate"] = UNSET
    group: Union[Unset, str] = UNSET
    owner: Union[Unset, "ConflictOwner"] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        devices: Union[Unset, List[str]] = UNSET
        if not isinstance(self.devices, Unset):
            devices = self.devices

        date: Union[Unset, Dict[str, Any]] = UNSET
        if not isinstance(self.date, Unset):
            date = self.date.to_dict()

        group = self.group

        owner: Union[Unset, Dict[str, Any]] = UNSET
        if not isinstance(self.owner, Unset):
            owner = self.owner.to_dict()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if devices is not UNSET:
            field_dict["devices"] = devices
        if date is not UNSET:
            field_dict["date"] = date
        if group is not UNSET:
            field_dict["group"] = group
        if owner is not UNSET:
            field_dict["owner"] = owner

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.conflict_date import ConflictDate
        from ..models.conflict_owner import ConflictOwner

        d = src_dict.copy()
        devices = cast(List[str], d.pop("devices", UNSET))

        _date = d.pop("date", UNSET)
        date: Union[Unset, ConflictDate]
        if isinstance(_date, Unset):
            date = UNSET
        else:
            date = ConflictDate.from_dict(_date)

        group = d.pop("group", UNSET)

        _owner = d.pop("owner", UNSET)
        owner: Union[Unset, ConflictOwner]
        if isinstance(_owner, Unset):
            owner = UNSET
        else:
            owner = ConflictOwner.from_dict(_owner)

        conflict = cls(
            devices=devices,
            date=date,
            group=group,
            owner=owner,
        )

        conflict.additional_properties = d
        return conflict

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
