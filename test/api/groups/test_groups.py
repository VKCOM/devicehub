from datetime import datetime, timezone, timedelta
from time import sleep

import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal

from devicehub_client.api.admin import add_origin_group_devices
from devicehub_client.api.devices import get_devices
from devicehub_client.api.groups import (
    get_groups, get_group_device, get_group_devices, create_group, delete_group,
    add_group_device, add_group_user, add_group_devices, remove_group_device,
    update_group, remove_group_devices, get_group, delete_groups
)
from devicehub_client.models import (
    GroupPayload, GroupsPayload, GroupPayloadClass, DevicesPayload,
    GroupPayloadState, GroupState
)


@pytest.mark.smoke
class TestGroupListEndpoint:
    """Test suite for GET /api/v1/groups endpoint"""

    def test_get_groups_basic(self, api_client, successful_response_check):
        """Test basic group listing functionality"""
        response = get_groups.sync_detailed(client=api_client)
        successful_response_check(response, description='Groups Information')
        greater(len(response.parsed.groups), 0)


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


@pytest.mark.integration
class TestGroupLifecycleManagement:
    """Test suite for group creation, modification, and deletion"""

    def test_create_and_delete_once_group(self, api_client, random_str, successful_response_check):
        """Test complete lifecycle of once group creation and deletion"""
        name = f'Test-run-{random_str()}'
        new_group = GroupPayload(name=name)

        response = create_group.sync_detailed(client=api_client, body=new_group)
        successful_response_check(response, status_code=201, description='Created')
        is_not_none(response.parsed.group)

        group_dict = response.parsed.group.to_dict()
        equal(group_dict.get('name'), name)
        equal(group_dict.get('class'), 'once')

        group_id = group_dict.get('id')
        response = delete_group.sync_detailed(client=api_client, id=group_id)
        successful_response_check(response, description='Deleted (groups)')


@pytest.mark.integration
class TestGroupDeviceManagement:
    """Test suite for adding and removing devices from groups"""

    def test_device_return_to_origin_group(self, api_client, api_client_custom_token, common_group_id,
                                           device_in_group_check, first_device_serial, group_creating,
                                           service_user_creating, successful_response_check, unsuccess_response_check):
        """Test device flow when groups are deleted - devices return to origin"""
        # Create bookable group by admin
        bookable_group = group_creating(group_class=GroupPayloadClass.BOOKABLE)

        # Add device to admin bookable group
        response = add_origin_group_devices.sync_detailed(
            id=bookable_group.id,
            client=api_client,
            body=DevicesPayload(serials=first_device_serial)
        )
        successful_response_check(response, description='Updated (devices)')

        # Create and add user to admin bookable group
        service_user = service_user_creating()
        response = add_group_user.sync_detailed(id=bookable_group.id, email=service_user.email, client=api_client)
        successful_response_check(response, description='Added (group users)')

        # Create once group by user
        user_api_client = api_client_custom_token(token=service_user.token)
        once_group = group_creating(custom_api_client=user_api_client)

        # Add device to once group by user
        response = add_group_device.sync_detailed(
            id=once_group.id,
            client=api_client,
            serial=first_device_serial
        )
        successful_response_check(response, description='Added (group devices)')

        # Try to delete bookable group by admin (should fail)
        response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
        unsuccess_response_check(response, status_code=403, description='Forbidden (groups)')

        # Delete once group by user
        response = delete_group.sync_detailed(id=once_group.id, client=user_api_client)
        successful_response_check(response, description='Deleted (groups)')

        # Check device moved to bookable group
        device_in_group_check(serial=first_device_serial, group_id=bookable_group.id, group_name=bookable_group.name)

        # Delete bookable group
        response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
        successful_response_check(response, description='Deleted (groups)')
        sleep(1)

        # Check device returned to common group
        device_in_group_check(serial=first_device_serial, group_id=common_group_id, group_name='Common')


@pytest.mark.integration
class TestGroupSchedulingAndConflicts:
    """Test suite for group scheduling, conflicts, and time-based operations"""

    def test_scheduler_delete_expired_once_group(self, api_client, group_creating, successful_response_check,
                                                 unsuccess_response_check):
        """Test automatic deletion of expired groups by scheduler"""
        # Create group with pending state
        group = group_creating(state=GroupPayloadState.PENDING)

        # Update group to passed lifetime
        response = update_group.sync_detailed(
            id=group.id,
            client=api_client,
            body=GroupPayload(
                state=GroupPayloadState.READY,
                start_time=datetime.now(timezone.utc) - timedelta(minutes=15),
                stop_time=datetime.now(timezone.utc) - timedelta(minutes=5),
            )
        )
        successful_response_check(response, description='Updated (group)')

        # Wait for scheduler to work
        sleep(3)

        # Check that scheduler deleted group
        response = get_group.sync_detailed(client=api_client, id=group.id)
        unsuccess_response_check(response, status_code=404, description='Not Found (group)')

    def test_group_time_conflict_detection(self, api_client, api_client_custom_token, devices_serial, group_creating,
                                           service_user_creating, successful_response_check, unsuccess_response_check):
        """Test conflict detection when group time periods overlap"""
        test_start_time = datetime.now(timezone.utc).replace(microsecond=0)
        test_start_time_plus_five = test_start_time + timedelta(minutes=5)
        test_start_time_plus_ten = test_start_time + timedelta(minutes=10)
        test_start_time_plus_fifteen = test_start_time + timedelta(minutes=15)

        # Create first once group (0-10 minutes) by admin
        first_group = group_creating(
            start_time=test_start_time,
            stop_time=test_start_time_plus_ten
        )
        response = add_group_devices.sync_detailed(
            id=first_group.id,
            client=api_client,
            body=DevicesPayload(serials=','.join(devices_serial[:2]))
        )
        successful_response_check(response, description='Added (group devices)')

        # Create second once group (10-20 minutes) by service user
        service_user = service_user_creating()
        user_api_client = api_client_custom_token(token=service_user.token)
        second_group = group_creating(
            custom_api_client=user_api_client,
            start_time=test_start_time_plus_ten,
            stop_time=test_start_time + timedelta(minutes=20)
        )
        response = add_group_devices.sync_detailed(
            id=second_group.id,
            client=api_client,
            body=DevicesPayload(serials=','.join(devices_serial[2:]))
        )
        successful_response_check(response, description='Added (group devices)')

        # Create pending conflict group
        conflict_group = group_creating(
            state=GroupState.PENDING,
            start_time=test_start_time + timedelta(minutes=21),
            stop_time=test_start_time + timedelta(minutes=31)
        )
        response = add_group_devices.sync_detailed(
            id=conflict_group.id,
            client=api_client,
            body=DevicesPayload(serials=','.join(devices_serial))
        )
        successful_response_check(response, description='Added (group devices)')

        # Try to change pending group time to create conflicts
        response = update_group.sync_detailed(
            id=conflict_group.id,
            client=api_client,
            body=GroupPayload(
                start_time=test_start_time_plus_five,
                stop_time=test_start_time_plus_fifteen
            )
        )
        unsuccess_response_check(response, status_code=409, description='Conflicts Information')

        # Verify conflict details
        first_conflict = response.parsed.conflicts[0]
        equal(sorted(devices_serial[:2]), sorted(first_conflict.devices))
