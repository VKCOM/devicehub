import pytest
from pytest_check import is_not_none, equal, is_none

from devicehub_client.api.groups import get_group_devices


@pytest.mark.smoke
class TestGroupDevicesEndpoint:
    """Test suite for GET /api/v1/groups/{id}/devices endpoint"""

    def test_get_group_devices_basic(self, api_client, fake_device_field_check, common_group_id,
                                     successful_response_check):
        """Test basic group device listing"""
        response = get_group_devices.sync_detailed(client=api_client, id=common_group_id)
        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            fake_device_field_check(device_dict)

    def test_get_group_devices_with_empty_fields(self, api_client, fake_device_field_check, common_group_id,
                                                 successful_response_check):
        """Test group device listing with empty fields parameter"""
        response = get_group_devices.sync_detailed(client=api_client, id=common_group_id, fields='')
        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            fake_device_field_check(device_dict)

    def test_get_group_devices_with_specific_fields(self, api_client, common_group_id, successful_response_check,
                                                    fake_device_certain_field_check):
        """Test group device listing with specific field selection"""
        response = get_group_devices.sync_detailed(
            client=api_client,
            id=common_group_id,
            fields='present,present,status,serial,group.owner.name,using,somefields'
        )
        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            fake_device_certain_field_check(device_dict)


@pytest.mark.regression
class TestGroupDevicesErrorHandling:
    """Test suite for error handling in group device operations"""

    def test_get_group_devices_with_invalid_fields(self, api_client, common_group_id, successful_response_check,
                                                   fake_device_certain_field_check):
        """Test group device listing with invalid field names"""
        response = get_group_devices.sync_detailed(
            client=api_client,
            id=common_group_id,
            fields='wrong,111,!@!$!$, ,'
        )
        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        equal(len(response.parsed.devices), 5)

        for device in response.parsed.devices:
            device_dict = device.to_dict()
            equal(len(device_dict.values()), 1)
            is_not_none(device_dict.get('reverseForwards'))
            equal(device_dict.get('reverseForwards'), [])

    def test_get_nonexistent_group_devices(self, api_client, unsuccess_response_check, random_str):
        """Test accessing devices for non-existent group"""
        random_group = f'group-{random_str()}'
        response = get_group_devices.sync_detailed(id=random_group, client=api_client)
        unsuccess_response_check(response, status_code=404, description='Not Found (group)')
        is_none(response.parsed)
