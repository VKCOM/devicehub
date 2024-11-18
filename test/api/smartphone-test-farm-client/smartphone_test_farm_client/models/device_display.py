from typing import Any, Dict, List, Type, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="DeviceDisplay")


@_attrs_define
class DeviceDisplay:
    """
    Attributes:
        id (Union[Unset, int]):
        width (Union[Unset, int]):
        height (Union[Unset, int]):
        rotation (Union[Unset, int]):
        xdpi (Union[Unset, float]):
        ydpi (Union[Unset, float]):
        fps (Union[Unset, float]):
        density (Union[Unset, float]):
        secure (Union[Unset, bool]):
        url (Union[Unset, str]):
        size (Union[Unset, float]):
    """

    id: Union[Unset, int] = UNSET
    width: Union[Unset, int] = UNSET
    height: Union[Unset, int] = UNSET
    rotation: Union[Unset, int] = UNSET
    xdpi: Union[Unset, float] = UNSET
    ydpi: Union[Unset, float] = UNSET
    fps: Union[Unset, float] = UNSET
    density: Union[Unset, float] = UNSET
    secure: Union[Unset, bool] = UNSET
    url: Union[Unset, str] = UNSET
    size: Union[Unset, float] = UNSET
    additional_properties: Dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        id = self.id

        width = self.width

        height = self.height

        rotation = self.rotation

        xdpi = self.xdpi

        ydpi = self.ydpi

        fps = self.fps

        density = self.density

        secure = self.secure

        url = self.url

        size = self.size

        field_dict: Dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if id is not UNSET:
            field_dict["id"] = id
        if width is not UNSET:
            field_dict["width"] = width
        if height is not UNSET:
            field_dict["height"] = height
        if rotation is not UNSET:
            field_dict["rotation"] = rotation
        if xdpi is not UNSET:
            field_dict["xdpi"] = xdpi
        if ydpi is not UNSET:
            field_dict["ydpi"] = ydpi
        if fps is not UNSET:
            field_dict["fps"] = fps
        if density is not UNSET:
            field_dict["density"] = density
        if secure is not UNSET:
            field_dict["secure"] = secure
        if url is not UNSET:
            field_dict["url"] = url
        if size is not UNSET:
            field_dict["size"] = size

        return field_dict

    @classmethod
    def from_dict(cls: Type[T], src_dict: Dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id", UNSET)

        width = d.pop("width", UNSET)

        height = d.pop("height", UNSET)

        rotation = d.pop("rotation", UNSET)

        xdpi = d.pop("xdpi", UNSET)

        ydpi = d.pop("ydpi", UNSET)

        fps = d.pop("fps", UNSET)

        density = d.pop("density", UNSET)

        secure = d.pop("secure", UNSET)

        url = d.pop("url", UNSET)

        size = d.pop("size", UNSET)

        device_display = cls(
            id=id,
            width=width,
            height=height,
            rotation=rotation,
            xdpi=xdpi,
            ydpi=ydpi,
            fps=fps,
            density=density,
            secure=secure,
            url=url,
            size=size,
        )

        device_display.additional_properties = d
        return device_display

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
