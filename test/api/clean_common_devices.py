import asyncio
import os
import uuid
from time import sleep

import pytest
import websockets
from pytest_check import is_not_none, equal

from devicehub_client.api.devices import get_devices
from devicehub_client.api.user import get_access_token


def get_bool_res(response):
    first_pos = response.find('success') + 9
    last_pos = response.find(',', first_pos)
    return True if response[first_pos:last_pos] == 'true' else False

async def get_result_from_ws(ws, tx_id):
    try:
        async with asyncio.timeout(5):
            async for resp in ws:
                if str(tx_id) in resp:
                    print(resp)
                    res = get_bool_res(resp)
                    return res
            return False
    except asyncio.TimeoutError:
        print(f'Timeout occurred while waiting for the response with tx_uuid: {tx_id}\n{'-' * 50}')
        return None

def collect_stat(qa_common_devices, file_path="common_devices_stat.txt"):
    devices_stat = {}
    if os.path.exists(file_path):
        with open(file_path, "r") as file:
            for line in file:
                serial, count = line.split(' ')
                devices_stat[serial] = int(count)
    for new_serial in qa_common_devices:
        if new_serial in devices_stat.keys():
            devices_stat[new_serial] = devices_stat[new_serial] + 1
        else:
            devices_stat[new_serial] = 1
    with open(file_path, "w") as file:
        for serial in sorted(devices_stat.keys()):
            file.write(f'{serial} {devices_stat[serial]}\n')

@pytest.mark.asyncio
@pytest.mark.skipif(
    os.environ.get("RUN_CLEAN_TEST") != "true",
    reason="It's service test for clean QA common device on production stand. Run only manually."
)
async def test_clean_common_devices(api_client, successful_response_check, base_ws_uri, token_from_params, admin_user):
    ## Firstly get list of QA common devices through api
    response = get_devices.sync_detailed(client=api_client)
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    qa_common_devices = []
    for device in response.parsed.devices:
        if (device.owner and (device.owner.name == 'Core QA' or device.owner.name == admin_user.name) and
                device.group.name == 'Common' and device.status == 3):
            qa_common_devices.append((device.serial, device.channel))
    count_qa_common_devices = len(qa_common_devices)
    released_devices = 0
    print(f'\n{'='*50}\nFind {{{count_qa_common_devices}}} QA Common Devices.\n{'='*50}\n')
    # Collect statistic data
    if count_qa_common_devices > 0:
        collect_stat([device[0] for device in qa_common_devices])

    if len(token_from_params) > 100:
        jwt = token_from_params
    else:
        response = get_access_token.sync_detailed(client=api_client, id=token_from_params)
        successful_response_check(response, description='Access Token Information')
        jwt = response.parsed.token.jwt

    ## Then try release devices through websocket
    async with websockets.connect(base_ws_uri) as websocket:
        message = f'40{{"token":"{jwt}"}}'
        await websocket.send(message)

        for serial, channel in qa_common_devices:
            tx_uuid = uuid.uuid4()
            print(f'Device:{serial} - #1 - just send group kick(uuid:{tx_uuid})')
            sleep(1)

            await websocket.send(f'42["group.kick","{channel}","tx.{tx_uuid}",{{"requirements":{{"serial":{{"value":"{serial}","match":"exact"}}}}}}]')
            result = await get_result_from_ws(websocket, tx_uuid)

            if result:
                released_devices += 1
                print(f'Device:{serial} - #2 - was released\n{'-'*50}')
                continue
            else:
                tx_uuid = uuid.uuid4()
                print(f'Device:{serial} - #2 - try invite de kick device(uuid:{tx_uuid})')
                await websocket.send(f'42["group.invite","{channel}","tx.{tx_uuid}",{{"requirements":{{"serial":{{"value":"{serial}","match":"exact"}}}},"timeout": 900000}}]')
                result = await get_result_from_ws(websocket, tx_uuid)

                if result:
                    tx_uuid = uuid.uuid4()
                    print(f'Device:{serial} - #3 - added to channel:{channel}. Now try to kick(3 attempts).')
                    ## Make three attempt to kick device, it should be enough.
                    for _ in range(3):
                        await websocket.send(f'42["group.kick","{channel}","tx.{tx_uuid}",{{"requirements":{{"serial":{{"value":"{serial}","match":"exact"}}}}}}]')
                        result = await get_result_from_ws(websocket, tx_uuid)

                        if result:
                            released_devices += 1
                            print(f'Device:{serial} - #4 - was released\n{'-'*50}')
                            break

        print(f'\n{'='*50}\n{{{released_devices}(from {count_qa_common_devices})}} QA Common Devices was released.\n{'='*50}')
        equal(released_devices, count_qa_common_devices, 'Not all QA Common Devices were released.')