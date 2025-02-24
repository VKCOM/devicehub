from typing import TYPE_CHECKING, Any, Dict, List, Type, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.service_user_response_service_user_info import ServiceUserResponseServiceUserInfo


T = TypeVar("T", bound="ServiceUserResponse")


@_attrs_define
class ServiceUserResponse:
    """
    Attributes:
        success (bool):
        description (str):
        service_user_info (ServiceUserResponseServiceUserInfo):
    """

    success: bool
    description: str
    service_user_info: "ServiceUserResponseServiceUserInfo"
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        success = self.success

        description = self.description

        service_user_info = self.service_user_info.to_dict()

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "description": description,
                "serviceUserInfo": service_user_info,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        from ..models.service_user_response_service_user_info import ServiceUserResponseServiceUserInfo

        d = src_dict.copy()
        success = d.pop("success")

        description = d.pop("description")

        service_user_info = ServiceUserResponseServiceUserInfo.from_dict(d.pop("serviceUserInfo"))

        service_user_response = cls(
            success=success,
            description=description,
            service_user_info=service_user_info,
        )

        service_user_response.additional_properties = d
        return service_user_response

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
