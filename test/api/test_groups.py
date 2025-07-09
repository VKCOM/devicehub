from datetime import datetime, timezone, timedelta
from time import sleep

import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal

from devicehub_client.api.admin import add_origin_group_devices
from devicehub_client.api.devices import get_devices
from devicehub_client.api.groups import get_groups, get_group_device, get_group_devices, create_group, delete_group, \
    add_group_device, add_group_user, add_group_devices, remove_group_device, update_group, remove_group_devices, \
    get_group, delete_groups
from devicehub_client.models import GroupPayload, GroupsPayload, GroupPayloadClass, DevicesPayload, GroupPayloadState, GroupState

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


# api/v1/groups/{groupId}/devices/{deviceId} - certain device for certain group
def test_get_groups_device(
    api_client,
    fake_device_field_check,
    common_group_id,
    successful_response_check,
    devices_serial
):
    for serial in devices_serial:
        response = get_group_device.sync_detailed(id=common_group_id, serial=serial, client=api_client)
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)
        device_dict = response.parsed.device.to_dict()
        equal(device_dict.get('serial'), serial)
        fake_device_field_check(device_dict)


def test_get_groups_unexisting_device(
    api_client,
    fake_device_field_check,
    common_group_id,
        unsuccess_response_check,
    random_str
):
    random_serial = f'serial-{random_str()}'
    response = get_group_device.sync_detailed(id=common_group_id, serial=random_serial, client=api_client)
    unsuccess_response_check(response, status_code=404, description='Not Found (device)')
    is_none(response.parsed)


def test_get_unexisting_group_device(
    api_client,
    fake_device_field_check,
    common_group_id,
        unsuccess_response_check,
    random_str,
    first_device_serial
):
    random_group = f'group-{random_str()}'
    response = get_group_device.sync_detailed(id=random_group, serial=first_device_serial, client=api_client)
    unsuccess_response_check(response, status_code=404, description='Not Found (group)')
    is_none(response.parsed)


def test_create_and_delete_once_group(api_client, random_str, successful_response_check):
    name = f'Test-run-{random_str()}'
    new_group = GroupPayload(
        name=name,
    )
    response = create_group.sync_detailed(client=api_client, body=new_group)
    successful_response_check(response, status_code=201, description='Created')
    is_not_none(response.parsed.group)
    group_dict = response.parsed.group.to_dict()
    equal(group_dict.get('name'), name)
    equal(group_dict.get('class'), 'once')
    group_id = group_dict.get('id')
    response = delete_group.sync_detailed(client=api_client, id=group_id)
    successful_response_check(response, description='Deleted (groups)')


def test_return_device_to_origin_group(
    api_client,
    api_client_custom_token,
    common_group_id,
    device_in_group_check,
    first_device_serial,
    group_creating,
    random_str,
    random_user,
    service_user_creating,
    successful_response_check,
    unsuccess_response_check,
):
    # create bookable group by admin
    bookable_group = group_creating(group_class=GroupPayloadClass.BOOKABLE)

    # add device to admin bookable group
    response = add_origin_group_devices.sync_detailed(
        id=bookable_group.id,
        client=api_client,
        body=DevicesPayload(serials=first_device_serial)
    )
    successful_response_check(response, description='Updated (devices)')

    # create and add user to admin bookable group
    service_user = service_user_creating()
    response = add_group_user.sync_detailed(id=bookable_group.id, email=service_user.email, client=api_client)
    successful_response_check(response, description='Added (group users)')

    # create once group by user
    user_api_client = api_client_custom_token(token=service_user.token)
    once_group = group_creating(custom_api_client=user_api_client)

    # add device to once group by user
    response = add_group_device.sync_detailed(
        id=once_group.id,
        client=api_client,
        serial=first_device_serial
    )
    successful_response_check(response, description='Added (group devices)')

    # try to delete bookable group by admin
    response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
    unsuccess_response_check(response, status_code=403, description='Forbidden (groups)')

    # delete once group by user
    response = delete_group.sync_detailed(id=once_group.id, client=user_api_client)
    successful_response_check(response, description='Deleted (groups)')

    # check device move to bookable group
    device_in_group_check(serial=first_device_serial, group_id=bookable_group.id, group_name=bookable_group.name)

    # delete bookable group
    response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
    successful_response_check(response, description='Deleted (groups)')
    sleep(1)

    # check device return to common group
    device_in_group_check(serial=first_device_serial, group_id=common_group_id, group_name='Common')


# @pytest.mark.focus
def test_return_devices_after_delete_bookable_group(
    api_client,
    common_group_id,
    devices_in_group_check,
    devices_serial,
    group_creating,
    successful_response_check,
):
    # create bookable group by admin
    bookable_group = group_creating(group_class=GroupPayloadClass.BOOKABLE)

    # add devices to admin bookable group
    response = add_origin_group_devices.sync_detailed(
        id=bookable_group.id,
        client=api_client,
        body=DevicesPayload(serials=','.join(devices_serial))
    )
    successful_response_check(response, description='Updated (devices)')
    # delete bookable group
    response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
    successful_response_check(response, description='Deleted (groups)')
    sleep(1)
    # check device return to common group
    devices_in_group_check(serials=devices_serial, group_id=common_group_id, group_name='Common')


def test_remove_device_by_one_from_once_group(
    api_client_custom_token,
    device_in_group_check,
    devices_serial,
    group_creating,
    service_user_creating,
    successful_response_check,
):
    # create once group by user
    service_user = service_user_creating()
    user_api_client = api_client_custom_token(token=service_user.token)
    once_group = group_creating(custom_api_client=user_api_client)

    # add device to once group by user by one
    group_devices = []
    for serial in devices_serial:
        response = add_group_device.sync_detailed(
            id=once_group.id,
            client=user_api_client,
            serial=serial
        )
        successful_response_check(response, description='Added (group devices)')
        group_devices.append(serial)
        equal(sorted(group_devices), sorted(response.parsed.group.to_dict()['devices']))
        device_in_group_check(serial=serial, group_id=once_group.id, group_name=once_group.name)
    # try to delete devices by one by user
    for serial in devices_serial:
        response = remove_group_device.sync_detailed(id=once_group.id, serial=serial, client=user_api_client)
        successful_response_check(response, description='Removed (group devices)')
        is_not_in(serial, response.parsed.group.to_dict()['devices'])
    # delete once group by user
    response = delete_group.sync_detailed(id=once_group.id, client=user_api_client)
    successful_response_check(response, description='Deleted (groups)')


def test_remove_devices_from_once_group(
    api_client_custom_token,
    devices_in_group_check,
    devices_serial,
    group_creating,
    service_user_creating,
    successful_response_check,
):
    # create once group by user
    service_user = service_user_creating()
    user_api_client = api_client_custom_token(token=service_user.token)
    once_group = group_creating(custom_api_client=user_api_client)

    # add device to once group by user
    response = add_group_devices.sync_detailed(
        id=once_group.id,
        client=user_api_client,
        body=DevicesPayload(serials=','.join(devices_serial))
    )
    successful_response_check(response, description='Added (group devices)')
    equal(sorted(devices_serial), sorted(response.parsed.group.to_dict()['devices']))
    devices_in_group_check(serials=devices_serial, group_id=once_group.id, group_name=once_group.name)
    # try to delete devices by user
    response = remove_group_devices.sync_detailed(id=once_group.id, client=user_api_client, body=DevicesPayload())
    successful_response_check(response, description='Removed (group devices)')
    equal(response.parsed.group.devices, [])
    # delete once group by user
    response = delete_group.sync_detailed(id=once_group.id, client=user_api_client)
    successful_response_check(response, description='Deleted (groups)')

def test_scheduler_update_bookable_group_lifetime(
        api_client,
        common_group_id,
        devices_in_group_check,
        devices_serial,
        group_creating,
        successful_response_check,
):
    # create group
    group = group_creating(state=GroupPayloadState.PENDING)

    # update group to bookable with passed lifetime
    response = update_group.sync_detailed(
        id=group.id,
        client=api_client,
        body=GroupPayload(
            class_=GroupPayloadClass.BOOKABLE,
            start_time= datetime.now(timezone.utc) - timedelta(minutes=15),
            stop_time= datetime.now(timezone.utc) - timedelta(minutes=5),
        )
    )
    successful_response_check(response, description='Updated (group)')

    # add devices to bookable group
    response = add_origin_group_devices.sync_detailed(
        id=group.id,
        client=api_client,
        body=DevicesPayload(serials=','.join(devices_serial))
    )
    successful_response_check(response, description='Updated (devices)')

    # waiting for the scheduler has worked
    sleep(3)

    # check that scheduler update group lifetime
    response = get_group.sync_detailed(client=api_client, id=group.id)
    successful_response_check(response, description='Group Information')
    group_dict = response.parsed.group.to_dict()
    date_now = datetime.now(timezone.utc)
    date_now_plus_10 = date_now + timedelta(minutes=10)
    delta = timedelta(seconds=4)
    group_start_time = datetime.fromisoformat(group_dict.get('dates')[0].get('start').replace("Z", "+00:00"))
    group_stop_time = datetime.fromisoformat(group_dict.get('dates')[0].get('stop').replace("Z", "+00:00"))
    between_equal(group_start_time, date_now - delta, date_now + delta)
    between_equal(group_stop_time, date_now_plus_10 - delta, date_now_plus_10 + delta)

    # delete group
    response = delete_group.sync_detailed(id=group.id, client=api_client)
    successful_response_check(response, description='Deleted (groups)')

    # check device return to common group
    devices_in_group_check(serials=devices_serial, group_id=common_group_id, group_name='Common')

def test_scheduler_del_expired_once_group(
        api_client,
        devices_in_group_check,
        group_creating,
        successful_response_check,
        unsuccess_response_check,
):
    # create group
    group = group_creating(state=GroupPayloadState.PENDING)

    # update group to passed lifetime
    response = update_group.sync_detailed(
        id=group.id,
        client=api_client,
        body=GroupPayload(
            state=GroupPayloadState.READY,
            start_time= datetime.now(timezone.utc) - timedelta(minutes=15),
            stop_time= datetime.now(timezone.utc) - timedelta(minutes=5),
        )
    )
    successful_response_check(response, description='Updated (group)')

    # waiting for the scheduler has worked
    sleep(3)

    # check that scheduler del group
    response = get_group.sync_detailed(client=api_client, id=group.id)
    unsuccess_response_check(response, status_code=404, description='Not Found (group)')

def test_conflict_group_response(
        api_client,
        api_client_custom_token,
        devices_serial,
        group_creating,
        service_user_creating,
        successful_response_check,
        unsuccess_response_check
):

    test_start_time = datetime.now(timezone.utc).replace(microsecond=0)
    test_start_time_plus_five = test_start_time + timedelta(minutes=5)
    test_start_time_plus_ten = test_start_time + timedelta(minutes=10)
    test_start_time_plus_fifteen = test_start_time + timedelta(minutes=15)

    # create once group(0-10minutes) by admin and add two device to it
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

    # create once group(10-20minutes) by service user and add two device to it
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

    # create pending once group with different time period and add devices to it as well
    conflict_group = group_creating(
        state=GroupState.PENDING,
        start_time=test_start_time+ timedelta(minutes=21),
        stop_time=test_start_time + timedelta(minutes=31)
    )
    response = add_group_devices.sync_detailed(
        id=conflict_group.id,
        client=api_client,
        body=DevicesPayload(serials=','.join(devices_serial))
    )
    successful_response_check(response, description='Added (group devices)')

    # try to change pending group time period to get conflicts error with both ready groups
    response = update_group.sync_detailed(
        id=conflict_group.id,
        client=api_client,
        body=GroupPayload(
            start_time=test_start_time_plus_five,
            stop_time=test_start_time_plus_fifteen
        )
    )
    unsuccess_response_check(response, status_code=409, description='Conflicts Information')
    first_conflict = response.parsed.conflicts[0]
    equal(sorted(devices_serial[:2]), sorted(first_conflict.devices))
    equal(test_start_time_plus_five, first_conflict.date.start)
    equal(test_start_time_plus_ten, first_conflict.date.stop)
    equal(first_group.name, first_conflict.group)
    equal(first_group.owner.email, first_conflict.owner.email)
    second_conflict = response.parsed.conflicts[1]
    equal(sorted(devices_serial[2:]), sorted(second_conflict.devices))
    equal(test_start_time_plus_ten, second_conflict.date.start)
    equal(test_start_time_plus_fifteen, second_conflict.date.stop)
    equal(second_group.name, second_conflict.group)
    equal(second_group.owner.email, second_conflict.owner.email)

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

def test_device_flow_by_schedule_in_once(
    api_client,
    api_client_custom_token,
    devices_serial,
    group_creating,
    service_user_creating,
    successful_response_check,
    unsuccess_response_check,
    random_user
):
      now = datetime.now(timezone.utc)

      bookable = group_creating(
          group_class=GroupPayloadClass.BOOKABLE,
          state=GroupPayloadState.READY
      )

      response = add_origin_group_devices.sync_detailed(
          id=bookable.id,
          client=api_client,
          body=DevicesPayload(serials=','.join(devices_serial))
      )
      successful_response_check(response, description='Updated (devices)')

      user_a = api_client_custom_token(token=service_user_creating(random_user()).token)
      user_b = api_client_custom_token(token=service_user_creating(random_user()).token)

      once_a = group_creating(
          custom_api_client=user_a,
          group_class=GroupPayloadClass.ONCE,
          state=GroupPayloadState.READY,
          start_time=now,
          stop_time=now + timedelta(seconds=5),
          repetitions=0
      )

      once_b = group_creating(
         custom_api_client=user_b,
         group_class=GroupPayloadClass.ONCE,
         state=GroupPayloadState.READY,
         start_time=now + timedelta(seconds=7),
         stop_time=now + timedelta(seconds=17),
         repetitions=0
      )

      response = add_group_devices.sync_detailed(
          id=once_a.id,
          client=api_client,
          body=DevicesPayload(serials=','.join(devices_serial))
      )
      successful_response_check(response, description='Added (group devices)')

      response = add_group_devices.sync_detailed(
          id=once_b.id,
          client=api_client,
          body=DevicesPayload(serials=','.join(devices_serial))
      )
      successful_response_check(response, description='Added (group devices)')

      sleep(1)

      # User A has devices
      user_a_devices_response = get_devices.sync_detailed(client=user_a)
      successful_response_check(user_a_devices_response, description='Devices Information')
      equal(len(user_a_devices_response.parsed.devices), 5)

      # User B has no devices
      user_b_devices_response = get_devices.sync_detailed(client=user_b)
      successful_response_check(user_b_devices_response, description='Devices Information')
      equal(len(user_b_devices_response.parsed.devices), 0)

      sleep(6)

      # User B has devices
      user_b_devices_response = get_devices.sync_detailed(client=user_b)
      successful_response_check(user_b_devices_response, description='Devices Information')
      equal(len(user_b_devices_response.parsed.devices), 5)

      # User A has no devices
      user_a_devices_response = get_devices.sync_detailed(client=user_a)
      successful_response_check(user_a_devices_response, description='Devices Information')
      equal(len(user_a_devices_response.parsed.devices), 0)
