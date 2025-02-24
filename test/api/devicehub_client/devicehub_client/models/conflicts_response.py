from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.conflict import Conflict


T = TypeVar("T", bound="ConflictsResponse")


@_attrs_define
class ConflictsResponse:
    """
    Attributes:
        success (bool):
        description (str):
        conflicts (List['Conflict']): List of conflicts with the current group operation:
             * adding a device into the group
             * updating the schedule of the group
    """

    success: bool
    description: str
    conflicts: List["Conflict"]
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        conflicts = []
        for conflicts_item_data in self.conflicts:
            conflicts_item = conflicts_item_data.to_dict()
            conflicts.append(conflicts_item)

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "conflicts": conflicts,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.conflict import Conflict

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        conflicts = []
        _conflicts = d.pop("conflicts")
        for conflicts_item_data in _conflicts:
            conflicts_item = Conflict.from_dict(conflicts_item_data)

            conflicts.append(conflicts_item)

        conflicts_response = cls(
            success=success,
            description=description,
            conflicts=conflicts,
        )

        conflicts_response.additional_properties = d
        return conflicts_response

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
