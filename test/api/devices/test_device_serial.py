import pytest
from pytest_check import equal, is_not_none

from devicehub_client.api.devices import get_device_by_serial


@pytest.mark.smoke
class TestDeviceBySerialEndpoint:
    """Test suite for GET /api/v1/devices/{serial} endpoint"""

    def test_get_device_by_serial_basic(self, api_client, fake_device_field_check, successful_response_check,
                                        first_device_serial):
        """Test basic device retrieval by serial number"""
        response = get_device_by_serial.sync_detailed(client=api_client, serial=first_device_serial)
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)

        device_dict = response.parsed.device.to_dict()
        fake_device_field_check(device_dict)

    def test_get_device_by_serial_with_empty_fields(self, api_client, fake_device_field_check,
                                                    successful_response_check, first_device_serial):
        """Test device retrieval with empty fields parameter"""
        response = get_device_by_serial.sync_detailed(
            client=api_client,
            serial=first_device_serial,
            fields=''
        )
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)

        device_dict = response.parsed.device.to_dict()
        fake_device_field_check(device_dict)

    def test_get_device_by_serial_with_specific_fields(self, api_client, fake_device_field_check,
                                                       successful_response_check, first_device_serial,
                                                       fake_device_certain_field_check):
        """Test device retrieval with specific field selection"""
        fields = 'present,present,status,serial,group.owner.name,using,somefields'

        response = get_device_by_serial.sync_detailed(
            client=api_client,
            serial=first_device_serial,
            fields=fields
        )
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)

        device_dict = response.parsed.device.to_dict()
        fake_device_certain_field_check(device_dict)


@pytest.mark.regression
class TestDeviceBySerialErrorHandling:
    """Test suite for error handling in device retrieval by serial"""

    def test_get_device_by_serial_with_invalid_fields(self, api_client, fake_device_field_check,
                                                      successful_response_check, first_device_serial):
        """Test device retrieval with invalid field names"""
        invalid_fields = 'wrong,111,!@!$!$, ,'

        response = get_device_by_serial.sync_detailed(
            client=api_client,
            serial=first_device_serial,
            fields=invalid_fields
        )
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)

        device_dict = response.parsed.device.to_dict()
        equal(len(device_dict.values()), 1)
        is_not_none(device_dict.get('reverseForwards'))
        equal(device_dict.get('reverseForwards'), [])
