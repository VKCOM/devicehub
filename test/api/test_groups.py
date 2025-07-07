from datetime import datetime, timezone, timedelta
from time import sleep

import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal

from devicehub_client.api.admin import add_origin_group_devices
from devicehub_client.api.devices import get_devices
from devicehub_client.api.groups import get_groups, get_group_device, get_group_devices, create_group, delete_group, \
    add_group_device, add_group_user, add_group_devices, remove_group_device, update_group, remove_group_devices, \
    get_group
from devicehub_client.models import GroupPayload, GroupPayloadClass, DevicesPayload, GroupPayloadState, GroupState

def test_get_groups(api_client, successful_response_check):
    response = get_groups.sync_detailed(client=api_client)
    successful_response_check(response, description='Groups Information')
    greater(len(response.parsed.groups), 0)


# api/v1/groups/{id}/devices - list of devices for certain group
def test_get_groups_devices(api_client, fake_device_field_check, common_group_id, successful_response_check):
    response = get_group_devices.sync_detailed(client=api_client, id=common_group_id)
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_field_check(device_dict)


def test_get_groups_devices_empty_fields(
    api_client,
    fake_device_field_check,
    common_group_id,
    successful_response_check
):
    response = get_group_devices.sync_detailed(client=api_client, id=common_group_id, fields='')
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_field_check(device_dict)


def test_get_groups_devices_with_fields(
    api_client,
    common_group_id,
    successful_response_check,
    fake_device_certain_field_check
):
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


def test_get_groups_devices_with_wrong_fields(
    api_client,
    common_group_id,
    successful_response_check,
    fake_device_certain_field_check
):
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


def test_get_unexisting_group_devices(
    api_client,
    fake_device_field_check,
    common_group_id,
        unsuccess_response_check,
    random_str,
    first_device_serial
):
    random_group = f'group-{random_str()}'
    response = get_group_devices.sync_detailed(id=random_group, client=api_client)
    unsuccess_response_check(response, status_code=404, description='Not Found (group)')
    is_none(response.parsed)


def test_periodic_group_lifetime_and_device_assignment(
    api_client,
    api_client_custom_token,
    service_user_creating,
    common_group_id,
    devices_serial,
    group_creating,
    successful_response_check,
    devices_in_group_check,
    random_str
):
    service_user = service_user_creating()
    user_api_client = api_client_custom_token(token=service_user.token)

    # Calculate start and end dates according to requirements
    now = datetime.now(timezone.utc)
    start_date = now - timedelta(hours=1, minutes=1)
    end_date = now + timedelta(seconds=5) - timedelta(hours=1)

    hourly_group = group_creating(
        group_class=GroupPayloadClass.HOURLY,
        state=GroupPayloadState.PENDING,
        start_time=start_date,
        stop_time=end_date,
        repetitions=2
    )

    # Add all devices to the group
    response = add_group_devices.sync_detailed(
        id=hourly_group.id,
        client=api_client,
        body=DevicesPayload(serials=','.join(devices_serial))
    )
    successful_response_check(response, description='Added (group devices)')

    # Confirm the group by changing state to READY
    response = update_group.sync_detailed(
        id=hourly_group.id,
        client=api_client,
        body=GroupPayload(
            state=GroupPayloadState.READY
        )
    )
    successful_response_check(response, description='Updated (group)')

    # Wait 1 second and check all devices have the new group ID
    sleep(1)
    devices_in_group_check(serials=devices_serial, group_id=hourly_group.id, group_name=hourly_group.name)

    # Check that regular user cannot access devices (should get empty list)
    user_devices_response = get_devices.sync_detailed(client=user_api_client)
    successful_response_check(user_devices_response, description='Devices Information')
    equal(len(user_devices_response.parsed.devices), 0)

    # Check that admin still has access to all devices
    admin_devices_response = get_devices.sync_detailed(client=api_client)
    successful_response_check(admin_devices_response, description='Devices Information')
    equal(len(admin_devices_response.parsed.devices), 5)

    # Wait total 5 seconds and check all devices return to Common group
    sleep(4)
    devices_in_group_check(serials=devices_serial, group_id=common_group_id, group_name='Common')

    # Check that the group is deleted and no longer in the list
    response = get_groups.sync_detailed(client=api_client)
    successful_response_check(response, description='Groups Information')
    group_ids = [group.id for group in response.parsed.groups]
    is_not_in(hourly_group.id, group_ids)

    # Check that regular user has access devices
    user_devices_response = get_devices.sync_detailed(client=user_api_client)
    successful_response_check(user_devices_response, description='Devices Information')
    equal(len(user_devices_response.parsed.devices), 5)
