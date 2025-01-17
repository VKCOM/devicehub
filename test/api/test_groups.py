import pytest
from pytest_check import greater, equal, is_not_none, is_

from smartphone_test_farm_client.api.groups import get_groups, get_group_devices, create_group, delete_group
from smartphone_test_farm_client.models import GroupPayload


def test_get_groups(api_client, successful_response_check):
    response = get_groups.sync_detailed(client=api_client)
    successful_response_check(response, description='Groups Information')
    greater(len(response.parsed.groups), 0)


# api/v1/groups/{id}/devices - list of devices for certain group
def test_get_groups_devices(api_client, fake_device_field_check, get_common_group_id, successful_response_check):
    common_group_id = get_common_group_id(api_client)
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
    get_common_group_id,
    successful_response_check
):
    common_group_id = get_common_group_id(api_client)

    response = get_group_devices.sync_detailed(client=api_client, id=common_group_id, fields='')
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    equal(len(response.parsed.devices), 5)
    for device in response.parsed.devices:
        device_dict = device.to_dict()
        fake_device_field_check(device_dict)


def test_get_groups_devices_with_fields(
    api_client,
    get_common_group_id,
    successful_response_check,
    fake_device_certain_field_check
):
    common_group_id = get_common_group_id(api_client)

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
    get_common_group_id,
    successful_response_check,
    fake_device_certain_field_check
):
    common_group_id = get_common_group_id(api_client)

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


def test_create_and_delete_once_group(api_client, random_str, successful_response_check):
    name = f'Test-run-{random_str()}'
    new_group = GroupPayload(
        name=name,
    )
    response = create_group.sync_detailed(client=api_client, body=new_group)
    equal(response.status_code, 201)
    is_(response.parsed.success, True)
    equal(response.parsed.description, 'Created')
    is_not_none(response.parsed.group)
    equal(response.parsed.group.additional_properties.get('name'), name)
    equal(response.parsed.group.additional_properties.get('class'), 'once')

    group_id = response.parsed.group.additional_properties.get('id')
    response = delete_group.sync_detailed(client=api_client, id=group_id)
    successful_response_check(response, description='Deleted (groups)')
