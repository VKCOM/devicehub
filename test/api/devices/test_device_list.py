from enum import Enum

import pytest
from pytest_check import is_not_none, equal, is_none

from devicehub_client.api.devices import get_devices
from devicehub_client.models import GetDevicesTarget


class WrongType(str, Enum):
    NONE = None

    def __str__(self) -> str:
        return str(self.value)


@pytest.mark.smoke
class TestDeviceListEndpoint:
    """Test suite for GET /api/v1/devices endpoint"""

    @pytest.mark.parametrize("target", [
        GetDevicesTarget.BOOKABLE,
        GetDevicesTarget.ORIGIN,
        None
    ])
    def test_get_devices_basic(self, api_client, target, fake_device_field_check, successful_response_check):
        """Test basic device listing functionality with different targets"""
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

    @pytest.mark.parametrize("target", [
        GetDevicesTarget.BOOKABLE,
        GetDevicesTarget.ORIGIN,
        None
    ])
    def test_get_devices_with_empty_fields(self, api_client, target, fake_device_field_check,
                                           successful_response_check):
        """Test device listing with empty fields parameter"""
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

    @pytest.mark.parametrize("target", [
        GetDevicesTarget.BOOKABLE,
        GetDevicesTarget.ORIGIN,
        None
    ])
    def test_get_devices_with_specific_fields(self, api_client, target, successful_response_check,
                                              fake_device_certain_field_check):
        """Test device listing with specific field selection"""
        fields = 'present,present,status,serial,group.owner.name,using,somefields'

        if target is None:
            response = get_devices.sync_detailed(client=api_client, fields=fields)
        else:
            response = get_devices.sync_detailed(client=api_client, fields=fields, target=target)

        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            fake_device_certain_field_check(device_dict)


@pytest.mark.regression
class TestDeviceListErrorHandling:
    """Test suite for error handling in device listing"""

    @pytest.mark.parametrize("target", [
        GetDevicesTarget.BOOKABLE,
        GetDevicesTarget.ORIGIN,
        None
    ])
    def test_get_devices_with_invalid_fields(self, api_client, target, successful_response_check):
        """Test device listing with invalid field names"""
        invalid_fields = 'wrong,111,!@!$!$, ,'

        if target is None:
            response = get_devices.sync_detailed(client=api_client, fields=invalid_fields)
        else:
            response = get_devices.sync_detailed(client=api_client, fields=invalid_fields, target=target)

        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            equal(len(device_dict.values()), 1)
            is_not_none(device_dict.get('reverseForwards'))
            equal(device_dict.get('reverseForwards'), [])

    def test_get_devices_with_invalid_target(self, api_client):
        """Test device listing with invalid target parameter"""
        target = WrongType.NONE
        response = get_devices.sync_detailed(
            client=api_client,
            fields='present,',
            target=target
        )
        equal(response.status_code, 400)
        is_none(response.parsed)
