from typing import Any, Dict, List, Type, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DevicePhone")


@_attrs_define
class DevicePhone:
    """
    Attributes:
        imei (Union[Unset, str]):
        imsi (Union[None, Unset, str]):
        phone_number (Union[None, Unset, str]):
        iccid (Union[None, Unset, str]):
        network (Union[None, Unset, str]):
    """

    imei: Union[Unset, str] = UNSET
    imsi: Union[None, Unset, str] = UNSET
    phone_number: Union[None, Unset, str] = UNSET
    iccid: Union[None, Unset, str] = UNSET
    network: Union[None, Unset, str] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        imei = self.imei

        imsi: Union[None, Unset, str]
        if isinstance(self.imsi, Unset):
            imsi = UNSET
        else:
            imsi = self.imsi

        phone_number: Union[None, Unset, str]
        if isinstance(self.phone_number, Unset):
            phone_number = UNSET
        else:
            phone_number = self.phone_number

        iccid: Union[None, Unset, str]
        if isinstance(self.iccid, Unset):
            iccid = UNSET
        else:
            iccid = self.iccid

        network: Union[None, Unset, str]
        if isinstance(self.network, Unset):
            network = UNSET
        else:
            network = self.network

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if imei is not UNSET:
            field_dict["imei"] = imei
        if imsi is not UNSET:
            field_dict["imsi"] = imsi
        if phone_number is not UNSET:
            field_dict["phoneNumber"] = phone_number
        if iccid is not UNSET:
            field_dict["iccid"] = iccid
        if network is not UNSET:
            field_dict["network"] = network

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        imei = d.pop("imei", UNSET)

        def _parse_imsi(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        imsi = _parse_imsi(d.pop("imsi", UNSET))

        def _parse_phone_number(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        phone_number = _parse_phone_number(d.pop("phoneNumber", UNSET))

        def _parse_iccid(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        iccid = _parse_iccid(d.pop("iccid", UNSET))

        def _parse_network(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        network = _parse_network(d.pop("network", UNSET))

        device_phone = cls(
            imei=imei,
            imsi=imsi,
            phone_number=phone_number,
            iccid=iccid,
            network=network,
        )

        device_phone.additional_properties = d
        return device_phone

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
