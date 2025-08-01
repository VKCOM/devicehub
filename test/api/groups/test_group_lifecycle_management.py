from datetime import datetime, timezone, timedelta
from time import sleep

import pytest
from pytest_check import is_not_none, equal

from devicehub_client.api.groups import create_group, delete_group, update_group, get_group, add_group_devices
from devicehub_client.models import GroupPayload, GroupPayloadState, DevicesPayload, GroupState


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
