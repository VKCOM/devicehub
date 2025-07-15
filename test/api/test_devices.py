from enum import Enum

import pytest
from pytest_check import is_none, is_not_none, equal, is_true

from devicehub_client.api.admin import use_device_by_user
from devicehub_client.api.devices import get_devices, get_device_by_serial
from devicehub_client.models import GetDevicesTarget, UseDeviceByUserBody


class WrongType(str, Enum):
    NONE = None

    def __str__(self) -> str:
        return str(self.value)

# TODO: add param: GetDevicesTarget.STANDARD, when generator of devices will be ready(add device with standard group)
# api/v1/devices - list of devices
@pytest.mark.parametrize("target", [GetDevicesTarget.BOOKABLE, GetDevicesTarget.ORIGIN, None])
def test_get_devices(api_client, target, fake_device_field_check, successful_response_check):
    if target is None:
        response = get_devices.sync_detailed(client=api_client)
    else:
        response = get_devices.sync_detailed(client=api_client, target=target)
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_field_check(device_dict)


@pytest.mark.parametrize("target", [GetDevicesTarget.BOOKABLE, GetDevicesTarget.ORIGIN, None])
def test_get_devices_empty_fields(api_client, target, fake_device_field_check, successful_response_check):
    if target is None:
        response = get_devices.sync_detailed(client=api_client, fields='')
    else:
        response = get_devices.sync_detailed(client=api_client, target=target, fields='')
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_field_check(device_dict)


@pytest.mark.parametrize("target", [GetDevicesTarget.BOOKABLE, GetDevicesTarget.ORIGIN, None])
def test_get_devices_with_fields(api_client, target, successful_response_check, fake_device_certain_field_check):
    if target is None:
        response = get_devices.sync_detailed(
            client=api_client,
            fields='present,present,status,serial,group.owner.name,using,somefields'
        )
    else:
        response = get_devices.sync_detailed(
            client=api_client,
            fields='present,present,status,serial,group.owner.name,using,somefields',
            target=target
        )
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_certain_field_check(device_dict)


@pytest.mark.parametrize("target", [GetDevicesTarget.BOOKABLE, GetDevicesTarget.ORIGIN, None])
def test_get_devices_with_wrong_fields(api_client, target, successful_response_check):
    if target is None:
        response = get_devices.sync_detailed(
            client=api_client,
            fields='wrong,111,!@!$!$, ,'
        )
    else:
        response = get_devices.sync_detailed(
            client=api_client,
            fields='wrong,111,!@!$!$, ,',
            target=target
        )
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        equal(len(device_dict.values()), 1)
        is_not_none(device_dict.get('reverseForwards'))
        equal(device_dict.get('reverseForwards'), [])

def test_get_devices_with_wrong_target(api_client):
    target = WrongType.NONE
    response = get_devices.sync_detailed(
        client=api_client,
        fields='present,',
        target=target
    )
    equal(response.status_code, 400)
    is_none(response.parsed)


# api/v1/devices/{serial} - list of devices
def test_get_device_by_serial(api_client, fake_device_field_check, successful_response_check, first_device_serial):

    response = get_device_by_serial.sync_detailed(client=api_client, serial=first_device_serial)
    successful_response_check(response, description='Device Information')
    is_not_none(response.parsed.device)
    device_dict = response.parsed.device.to_dict()
    fake_device_field_check(device_dict)


def test_get_device_by_serial_empty_fields(
    api_client,
    fake_device_field_check,
    successful_response_check,
    first_device_serial
):

    response = get_device_by_serial.sync_detailed(client=api_client, serial=first_device_serial, fields='')
    successful_response_check(response, description='Device Information')
    is_not_none(response.parsed.device)
    device_dict = response.parsed.device.to_dict()
    fake_device_field_check(device_dict)


def test_get_device_by_serial_with_fields(
    api_client,
    fake_device_field_check,
    successful_response_check,
    first_device_serial,
    fake_device_certain_field_check
):

    response = get_device_by_serial.sync_detailed(
        client=api_client,
        serial=first_device_serial,
        fields='present,present,status,serial,group.owner.name,using,somefields'
    )
    successful_response_check(response, description='Device Information')
    is_not_none(response.parsed.device)
    device_dict = response.parsed.device.to_dict()
    fake_device_certain_field_check(device_dict)


def test_get_device_by_serial_with_wrong_fields(
    api_client,
    fake_device_field_check,
    successful_response_check,
    first_device_serial
):

    response = get_device_by_serial.sync_detailed(
        client=api_client,
        serial=first_device_serial,
        fields='wrong,111,!@!$!$, ,'
    )
    successful_response_check(response, description='Device Information')
    is_not_none(response.parsed.device)
    device_dict = response.parsed.device.to_dict()
    equal(len(device_dict.values()), 1)
    is_not_none(device_dict.get('reverseForwards'))
    equal(device_dict.get('reverseForwards'), [])

def test_use_device_by_user_success(
    api_client,
    first_device_serial,
    admin_user,
    successful_response_check
):
    """Test successful device usage by user"""
    body = UseDeviceByUserBody(
        email=admin_user.email,
        timeout=30000
    )

    response = use_device_by_user.sync_detailed(
        serial=first_device_serial,
        client=api_client,
        body=body
    )

    successful_response_check(response, status_code=200)
    is_not_none(response.parsed)

def test_use_device_by_user_with_invalid_serial(
    api_client,
    admin_user,
    random_str,
    unsuccess_response_check
):
    """Test device usage with invalid serial"""
    invalid_serial = f"invalid-{random_str()}"
    body = UseDeviceByUserBody(
        email=admin_user.email,
        timeout=30000
    )

    response = use_device_by_user.sync_detailed(
        serial=invalid_serial,
        client=api_client,
        body=body
    )

    unsuccess_response_check(response, status_code=404, description="Not Found (device)")

def test_use_device_by_user_with_invalid_email(
    api_client,
    first_device_serial,
    random_str,
    unsuccess_response_check
):
    """Test device usage with invalid user email"""
    invalid_email = f"invalid-{random_str()}@example.com"
    body = UseDeviceByUserBody(
        email=invalid_email,
        timeout=30000
    )

    response = use_device_by_user.sync_detailed(
        serial=first_device_serial,
        client=api_client,
        body=body
    )
      
    unsuccess_response_check(response, status_code=404, description="Not Found (user)")

@pytest.mark.parametrize("timeout", [1000, 30000, 60000])
def test_use_device_by_user_with_different_timeouts(
    api_client,
    first_device_serial,
    admin_user,
    successful_response_check,
    timeout
):
    """Test device usage with different timeout values"""
    body = UseDeviceByUserBody(
        email=admin_user.email,
        timeout=timeout
    )

    response = use_device_by_user.sync_detailed(
        serial=first_device_serial,
        client=api_client,
        body=body
    )

    successful_response_check(response, status_code=200)
    is_not_none(response.parsed)