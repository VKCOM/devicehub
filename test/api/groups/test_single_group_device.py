import pytest
from pytest_check import is_not_none, equal, is_none

from devicehub_client.api.groups import get_group_device


@pytest.mark.smoke
class TestSingleGroupDeviceEndpoint:
    """Test suite for GET /api/v1/groups/{groupId}/devices/{deviceId} endpoint"""

    def test_get_group_device_basic(self, api_client, fake_device_field_check, common_group_id,
                                    successful_response_check, devices_serial):
        """Test basic single device retrieval from group"""
        for serial in devices_serial:
            response = get_group_device.sync_detailed(id=common_group_id, serial=serial, client=api_client)
            successful_response_check(response, description='Device Information')
            is_not_none(response.parsed.device)
            device_dict = response.parsed.device.to_dict()
            equal(device_dict.get('serial'), serial)
            fake_device_field_check(device_dict)


@pytest.mark.regression
class TestSingleGroupDeviceErrorHandling:
    """Test suite for error handling in single group device operations"""

    def test_get_group_nonexistent_device(self, api_client, common_group_id, unsuccess_response_check, random_str):
        """Test accessing non-existent device in group"""
        random_serial = f'serial-{random_str()}'
        response = get_group_device.sync_detailed(id=common_group_id, serial=random_serial, client=api_client)
        unsuccess_response_check(response, status_code=404, description='Not Found (device)')
        is_none(response.parsed)

    def test_get_nonexistent_group_device(self, api_client, unsuccess_response_check, random_str, first_device_serial):
        """Test accessing device from non-existent group"""
        random_group = f'group-{random_str()}'
        response = get_group_device.sync_detailed(id=random_group, serial=first_device_serial, client=api_client)
        unsuccess_response_check(response, status_code=404, description='Not Found (group)')
        is_none(response.parsed)
