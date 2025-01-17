import random
import string

import pytest
from pytest_check import equal, is_not_none, is_true, is_false, is_in, greater_equal, greater, is_none

from smartphone_test_farm_client import AuthenticatedClient
from smartphone_test_farm_client.api.devices import get_devices
from smartphone_test_farm_client.api.groups import get_groups

ADMIN_EMAIL = 'administrator@fakedomain.com'
ADMIN_NAME = 'administrator'
ADMIN_PRIVILEGE = 'admin'


def pytest_addoption(parser):
    parser.addoption("--token", action="store")
    parser.addoption("--base-url", action="store")


@pytest.fixture(scope='session')
def token(request):
    token_value = request.config.option.token
    if token_value is None:
        pytest.fail(reason='Missed token')
    return token_value


@pytest.fixture(scope='module')
def base_url(request):
    url = request.config.option.base_url
    if url is None:
        pytest.fail(reason='Missed base_url')
    return f'{url}/api/v1'


@pytest.fixture(scope="module")
def api_client(token, base_url):
    api_client = AuthenticatedClient(base_url=base_url,
                                     token=token)
    return api_client


@pytest.fixture(scope="module")
def api_client_with_bad_token(base_url):
    api_client = AuthenticatedClient(base_url=base_url, token='bad_token')
    return api_client


class User:
    def __init__(self, email, name, privilege):
        self.email = email
        self.name = name
        self.privilege = privilege

    def __str__(self):
        return f"User(email={self.email}, name={self.name}, privilege={self.privilege})"


@pytest.fixture(scope="module")
def admin_user():
    return User(email=ADMIN_EMAIL, name=ADMIN_NAME, privilege=ADMIN_PRIVILEGE)


@pytest.fixture(scope="module")
def random_user(random_str):
    def random_user_func():
        return User(email=f'{random_str()}@test.com', name=random_str(), privilege='user')

    return random_user_func


@pytest.fixture(scope="module")
def random_str():
    def random_str_func(size=10, chars=string.ascii_uppercase + string.ascii_lowercase + string.digits):
        return ''.join(random.choice(chars) for _ in range(size))

    return random_str_func


@pytest.fixture(scope="module")
def random_choice():
    def random_func(list):
        return random.choice(list)

    return random_func


@pytest.fixture(scope="module")
def fake_device_field_check():
    def fake_device_field_check_func(device_dict):
        equal(len(device_dict.values()), 33)
        equal(len(device_dict.get('provider').values()), 2)
        # for local run pass need add runUrl to device.group
        greater_equal(len(device_dict.get('group').values()), 9, device_dict.get('group').keys())
        equal(len(device_dict.get('display').values()), 10)
        equal(len(device_dict.get('phone').values()), 5)
        is_not_none(device_dict.get('_id'))
        is_true(device_dict.get('present'))
        is_not_none(device_dict.get('presenceChangedAt'))
        equal(device_dict.get('provider').get('name'), 'FAKE/1')
        equal(device_dict.get('provider').get('channel'), '*fake')
        equal(device_dict.get('owner'), None)
        equal(device_dict.get('status'), 3)
        is_not_none(device_dict.get('statusChangedAt'))
        equal(device_dict.get('bookedBefore'), 0)
        is_true(device_dict.get('ready'))
        equal(device_dict.get('reverseForwards'), [])
        is_false(device_dict.get('remoteConnect'))
        equal(device_dict.get('remoteConnectUrl'), None)
        equal(device_dict.get('usage'), None)
        is_false(device_dict.get('logs_enabled'))
        is_in('fake-', device_dict.get('serial'))
        is_not_none(device_dict.get('createdAt'))
        is_not_none(device_dict.get('group'))
        is_not_none(device_dict.get('group').get('id'))
        equal(device_dict.get('group').get('name'), 'Common')
        is_not_none(device_dict.get('group').get('lifeTime').get('start'))
        is_not_none(device_dict.get('group').get('lifeTime').get('stop'))
        equal(device_dict.get('group').get('owner').get('email'), 'administrator@fakedomain.com')
        equal(device_dict.get('group').get('owner').get('name'), 'administrator')
        equal(device_dict.get('group').get('origin'), device_dict.get('group').get('id'))
        equal(device_dict.get('group').get('class'), 'bookable')
        equal(device_dict.get('group').get('repetitions'), 0)
        equal(device_dict.get('group').get('originName'), device_dict.get('group').get('name'))
        is_false(device_dict.get('group').get('lock'))
        equal(device_dict.get('abi'), 'armeabi-v7a')
        equal(device_dict.get('cpuPlatform'), 'msm8996')
        is_not_none(device_dict.get('display'))
        equal(device_dict.get('display').get('density'), 3)
        equal(device_dict.get('display').get('fps'), 60)
        equal(device_dict.get('display').get('height'), 1920)
        equal(device_dict.get('display').get('id'), 0)
        equal(device_dict.get('display').get('rotation'), 0)
        is_true(device_dict.get('display').get('secure'))
        equal(device_dict.get('display').get('url'), '/404.jpg')
        equal(device_dict.get('display').get('width'), 1080)
        equal(device_dict.get('display').get('xdpi'), 442)
        equal(device_dict.get('display').get('ydpi'), 439)
        equal(device_dict.get('macAddress'), '123abc')
        equal(device_dict.get('manufacturer'), 'Foo Electronics')
        equal(device_dict.get('marketName'), 'Bar F9+')
        equal(device_dict.get('model'), 'fake-device-type')
        equal(device_dict.get('openGLESVersion'), '3.1')
        equal(device_dict.get('operator'), 'Loss Networks')
        is_not_none(device_dict.get('phone'))
        equal(device_dict.get('phone').get('iccid'), '1234567890123456789')
        equal(device_dict.get('phone').get('imei'), '123456789012345')
        equal(device_dict.get('phone').get('imsi'), '123456789012345')
        equal(device_dict.get('phone').get('network'), 'LTE')
        equal(device_dict.get('phone').get('phoneNumber'), '0000000000')
        equal(device_dict.get('platform'), 'Android')
        equal(device_dict.get('product'), 'fake-device-type')
        equal(device_dict.get('ram'), 0)
        is_not_none(device_dict.get('sdk'))
        equal(device_dict.get('version'), '4.1.2')
        is_false(device_dict.get('using'))

    return fake_device_field_check_func

# This checking for request with param fields='present,present,status,serial,group.owner.name,using,somefields'
@pytest.fixture(scope="module")
def fake_device_certain_field_check():
    def fake_device_certain_field_check_func(device_dict):
        equal(len(device_dict.values()), 6)
        is_true(device_dict.get('present'))
        equal(device_dict.get('status'), 3)
        is_in('fake-', device_dict.get('serial'))
        equal(device_dict.get('group').get('owner').get('name'), 'administrator')
        is_false(device_dict.get('using'))
        is_not_none(device_dict.get('reverseForwards'))
        equal(device_dict.get('reverseForwards'), [])
        is_none(device_dict.get('remoteConnect'))
        is_none(device_dict.get('remoteConnectUrl'))

    return fake_device_certain_field_check_func


@pytest.fixture(scope="module")
def get_common_group_id():
    def get_common_group_id_func(api_client):
        response = get_groups.sync_detailed(client=api_client)
        equal(response.status_code, 200)
        is_true(response.parsed.success)
        equal(len(response.parsed.groups), 1)
        common_group = response.parsed.groups[0]
        equal(common_group['name'], 'Common')
        return response.parsed.groups[0]['id']

    return get_common_group_id_func


@pytest.fixture(scope="module")
def get_first_device_id(successful_response_check):
    def get_first_device_id_func(api_client):
        response = get_devices.sync_detailed(client=api_client)
        successful_response_check(response, description='Devices Information')
        is_not_none(response.parsed.devices)
        greater(len(response.parsed.devices), 0)
        return response.parsed.devices[0].serial

    return get_first_device_id_func


@pytest.fixture(scope="module")
def successful_response_check():
    def successful_response_check_func(response, description=None):
        equal(response.status_code, 200)
        is_true(response.parsed.success)
        if description is not None:
            equal(response.parsed.description, description)

    return successful_response_check_func
