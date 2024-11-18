import itertools
import os
import time

import pytest
import asyncio
import random

from pytest_check import equal, is_, is_not_none, is_none

from smartphone_test_farm_client.api.autotests import capture_devices, free_devices, use_and_connect_device
from smartphone_test_farm_client.api.user import remote_disconnect_user_device_by_serial, delete_user_device_by_serial
from smartphone_test_farm_client.models import UseAndConnectDeviceBody
from smartphone_test_farm_client.types import UNSET


def raise_multiple(errors):
    if not errors:  # list emptied, recursion ends
        return
    try:
        raise errors.pop()  # pop removes list entries
    finally:
        raise_multiple(errors)  # recursion


pytest_plugins = ('pytest_asyncio',)


@pytest.mark.asyncio
@pytest.mark.xfail
async def test_get_groups(api_client):
    async def load_work(worker_number: int):
        async def shielded_load_work(test_num: int):
            test_name = f"test_worker_{worker_number}.{test_num}"
            print(f"Starting {test_name}")
            devices = await capture_devices.asyncio_detailed(client=api_client, amount=2, run=test_name)
            assert devices.status_code in range(200, 300), devices.content
            assert devices.parsed
            assert devices.parsed.group
            group_id = devices.parsed.group.additional_properties["id"]
            await asyncio.sleep(random.uniform(0.2, 0.5))
            freed = await free_devices.asyncio_detailed(client=api_client, group=group_id)
            assert freed.status_code in range(200, 300), devices.content

        for test_num in itertools.count():
            await asyncio.shield(shielded_load_work(test_num))
            if test_num > 5:
                break

    tasks = [asyncio.create_task(load_work(i)) for i in range(2)]
    done, pending = await asyncio.wait(tasks, timeout=None, return_when=asyncio.FIRST_EXCEPTION)
    exceptions = []
    for coro in done:
        if exception := coro.exception():
            exceptions.append(exception)
    for coro in pending:
        coro.cancel()
    raise_multiple(exceptions)


def test_create_connect_delete_autotest_group(api_client, random_str, base_host):
    # Create autotests group
    devices_amount = 2
    device_abi = 'x86_64'
    autotests_group_name = f'Test-run-{random_str()}'
    response = capture_devices.sync_detailed(
        client=api_client,
        timeout=600,
        amount=devices_amount,
        need_amount=True,
        abi=device_abi,
        run=autotests_group_name,
        sdk=UNSET, model=UNSET,
        type=UNSET,
        version=UNSET
    )
    equal(response.status_code, 200)
    is_not_none(response.parsed)
    is_(response.parsed.success, True)
    equal(response.parsed.description, 'Added (group devices)')
    is_not_none(response.parsed.group)
    equal(len(response.parsed.group.devices), devices_amount)
    autotests_group_id = response.parsed.group.additional_properties['id']

    for device in response.parsed.group.devices:
        is_(device.additional_properties['present'], True)
        is_none(device.additional_properties['owner'])
        equal(device.additional_properties['status'], 3)
        is_(device.additional_properties['ready'], True)
        is_(device.additional_properties['remoteConnect'], False)
        is_not_none(device.additional_properties['group'])
        equal(device.additional_properties['group']['id'], autotests_group_id)
        equal(device.additional_properties['group']['name'], autotests_group_name)
        equal(device.additional_properties['abi'], device_abi)

    # connect devices
    for device in response.parsed.group.devices:
        device_response = use_and_connect_device.sync_detailed(
            client=api_client,
            body=UseAndConnectDeviceBody(serial=device.additional_properties['serial'])
        )
        equal(device_response.status_code, 200)
        is_(device_response.parsed.success, True)
        equal(device_response.parsed.description, 'Device is in use and remote connection is enabled')
        equal(device_response.parsed.remote_connect_url.split(':')[0], base_host)

    # waiting
    time.sleep(1)

    # device remote disconnect and stopUse
    for device in response.parsed.group.devices:
        serial = device.additional_properties['serial']
        default_response = remote_disconnect_user_device_by_serial.sync_detailed(
            client=api_client,
            serial=serial
        )
        equal(default_response.status_code, 200)
        is_(default_response.parsed.success, True)
        equal(default_response.parsed.description, 'Device remote disconnected successfully')

        default_response = delete_user_device_by_serial.sync_detailed(
            client=api_client,
            serial=serial
        )
        equal(default_response.status_code, 200)
        is_(default_response.parsed.success, True)
        equal(default_response.parsed.description, 'Device successfully removed')

    # remove autotests group
    response = free_devices.sync_detailed(client=api_client, group=autotests_group_id)
    equal(response.status_code, 200)
    is_(response.parsed.success, True)
    equal(response.parsed.description, 'Deleted (groups)')
