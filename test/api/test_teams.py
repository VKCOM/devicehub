from time import sleep

import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal, is_in

from devicehub_client.api.groups import add_group_devices
from devicehub_client.api.teams import get_teams, create_team, delete_team, update_team, remove_user_from_team
from devicehub_client.api.devices import get_devices
from devicehub_client.models import TeamPayload, GroupPayloadClass, DevicesPayload


def test_create_and_delete_team(api_client, successful_response_check, random_str):
    response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'team-{random_str()}'))
    created_team_id = response.parsed.team.id
    successful_response_check(response, description='Team info (created)')

    response = delete_team.sync_detailed(client=api_client, id=created_team_id)
    successful_response_check(response, description='Team deleted')


def test_get_teams(api_client, successful_response_check, random_str):
    response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'group-{random_str()}'))
    successful_response_check(response, description='Team info (created)')

    response = get_teams.sync_detailed(client=api_client)
    successful_response_check(response, description='Teams Information')
    greater(len(response.parsed.teams), 0)


def test_add_and_remove_user_to_team(api_client,
                          api_client_custom_token,
                          successful_response_check,
                          random_str, group_creating,
                          service_user_creating,
                          first_device_serial):
    # Create new team
    response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'team-{random_str()}'))
    created_team_id = response.parsed.team.id
    successful_response_check(response, description='Team info (created)')

    # Create service user
    service_user = service_user_creating()
    user_api_client = api_client_custom_token(token=service_user.token)

    # check that service user can access device
    devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
    devices = [device.serial for device in devices]
    is_in(first_device_serial, devices)

    # creating group and add device to bookable group
    bookable_group = group_creating(group_class=GroupPayloadClass.ONCE)
    response = add_group_devices.sync_detailed(
        id=bookable_group.id,
        client=api_client,
        body=DevicesPayload(serials=first_device_serial)
    )
    successful_response_check(response, description='Added (group devices)')

    #check that service user cant access device
    devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
    devices = [device.serial for device in devices]
    is_not_in(first_device_serial, devices)

    #add group to team
    group_add = update_team.sync_detailed(client=api_client, id=created_team_id, body=TeamPayload(groups=[bookable_group.id]))
    successful_response_check(group_add)

    # check that service user cant access device
    devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
    devices = [device.serial for device in devices]
    is_not_in(first_device_serial, devices)

    #add user to team
    user_add = update_team.sync_detailed(client=api_client, id=created_team_id, body=TeamPayload(users=[service_user.email]))
    successful_response_check(user_add)
    #check that user can access device
    devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
    devices = [device.serial for device in devices]
    is_in(first_device_serial, devices)

    #remove user from team
    remove_user_from_team.sync_detailed(client=api_client, id=created_team_id, email=service_user.email)

    #check that user cant see device
    devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
    devices = [device.serial for device in devices]
    is_not_in(first_device_serial, devices)

    response = delete_team.sync_detailed(client=api_client, id=created_team_id)
    successful_response_check(response, description='Team deleted')