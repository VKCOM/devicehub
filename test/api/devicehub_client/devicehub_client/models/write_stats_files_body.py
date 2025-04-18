from typing import Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WriteStatsFilesBody")


@_attrs_define
class WriteStatsFilesBody:
    """
    Attributes:
        serial (str): serial of device, which used in action
        action (str): action which happened
    """

    serial: str
    action: str
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        serial = self.serial

        action = self.action

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "serial": serial,
                "action": action,
            }
        )

        return field_dict

    def to_multipart(self) -> Dict[str, Any]:
        serial = (None, str(self.serial).encode(), "text/plain")

        action = (None, str(self.action).encode(), "text/plain")

        field_dict: Dict[str, Any] = {}
        for prop_name, prop in self.additional_properties.items():
            field_dict[prop_name] = (None, str(prop).encode(), "text/plain")

        field_dict.update(
            {
                "serial": serial,
                "action": action,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        serial = d.pop("serial")

        action = d.pop("action")

        write_stats_files_body = cls(
            serial=serial,
            action=action,
        )

        write_stats_files_body.additional_properties = d
        return write_stats_files_body

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
