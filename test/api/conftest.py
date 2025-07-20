import json
import random
import string
import time
from http.cookiejar import debug

import pytest
from devicehub_client.models import GroupPayload, GroupPayloadState, GroupPayloadClass, GroupState
from devicehub_client.types import Unset, UNSET
from pytest_check import equal, is_not_none, is_true, is_false, is_in, greater_equal, greater, is_none

from devicehub_client import AuthenticatedClient
from devicehub_client.api.admin import create_service_user, delete_user, create_user
from devicehub_client.api.devices import get_devices, get_device_by_serial
from devicehub_client.api.groups import get_groups, get_group, create_group, delete_group

ADMIN_EMAIL = 'administrator@fakedomain.com'
ADMIN_NAME = 'administrator'

ADMIN_PRIVILEGE = 'admin'
USER_PRIVILEGE = 'user'

STF_SECRET = 'kute kittykat'


def pytest_addoption(parser):
    parser.addoption("--token", action="store")
    parser.addoption("--base-url", action="store")


@pytest.fixture(scope='session')
def token_from_params(request):
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


@pytest.fixture()
def api_client(token_from_params, base_url):
    api_client = AuthenticatedClient(
        base_url=base_url,
        token=token_from_params
    )
    return api_client


# method return api client for make request from custom user(no admin user passed through run parameters)
@pytest.fixture()
def api_client_custom_token(base_url):
    def api_client_by_token_func(token):
        api_client = AuthenticatedClient(base_url=base_url, token=token)
        return api_client

    return api_client_by_token_func


class Keeper():
    def __init__(self):
        self.ls = []

    def size(self):
        return len(self.ls)

    def add_obj(self, obj):
        self.ls.append(obj)

    def pop_obj(self):
        return self.ls.pop()


# method create service user and return User and remove one after test
@pytest.fixture()
def service_user_creating(request, api_client, stf_secret, random_user, successful_response_check):
    request.param = Keeper()
    def service_user_creating_func(user=random_user()):
        request.param.add_obj(user)
        response = create_service_user.sync_detailed(
            client=api_client,
            email=user.email,
            name=user.name,
            admin=user.privilege == ADMIN_PRIVILEGE,
            secret=stf_secret
        )
        successful_response_check(
            response=response,
            status_code=201,
            description='Created (service user)'
        )
        service_user_dict = response.parsed.service_user_info.to_dict()
        is_not_none(service_user_dict)
        token = service_user_dict.get('token')
        is_not_none(token)
        email = service_user_dict.get('email')
        equal(email, user.email)
        user.token = token
        return user

    yield service_user_creating_func
    # remove service user auto tests
    while request.param.size() != 0:
        response = delete_user.sync_detailed(client=api_client, email=request.param.pop_obj().email)
        successful_response_check(response, description='Deleted (users)')


# method create regular user and return User and remove one after test
@pytest.fixture()
def regular_user(request, api_client, stf_secret, random_user, successful_response_check):
    request.param = Keeper()
    def regular_user_func(user=random_user()):
        request.param.add_obj(user)
        response = create_user.sync_detailed(
            client=api_client,
            email=user.email,
            name=user.name
        )
        successful_response_check(
            response=response,
            status_code=201,
            description='Created (user)'
        )
        user_dict = response.parsed.user.to_dict()
        is_not_none(user_dict)
        email = user_dict.get('email')
        name = user_dict.get('name')
        privilege = user_dict.get('privilege')
        equal(email, user.email)
        equal(name, user.name)
        equal(privilege, user.privilege)
        return user

    yield regular_user_func
    # remove regular user auto tests
    while request.param.size() != 0:
        response = delete_user.sync_detailed(client=api_client, email=request.param.pop_obj().email)
        successful_response_check(response, description='Deleted (users)')

@pytest.fixture()
def api_client_with_bad_token(base_url):
    api_client = AuthenticatedClient(base_url=base_url, token='bad_token')
    return api_client


class User:
    def __init__(self, email, name, privilege, token=None):
        self.email = email
        self.name = name
        self.privilege = privilege
        self.token = token

    def __str__(self):
        return f"User(email={self.email}, name={self.name}, privilege={self.privilege}, *token={self.token})"


@pytest.fixture()
def admin_user():
    return User(email=ADMIN_EMAIL, name=ADMIN_NAME, privilege=ADMIN_PRIVILEGE)


@pytest.fixture()
def stf_secret():
    return STF_SECRET


@pytest.fixture()
def random_user(random_str):
    def random_user_func(privilege=USER_PRIVILEGE):
        return User(email=f'{random_str()}@test.com', name=random_str(), privilege=privilege)

    return random_user_func


@pytest.fixture()
def random_str():
    def random_str_func(size=10, chars=string.ascii_uppercase + string.ascii_lowercase + string.digits):
        return ''.join(random.choice(chars) for _ in range(size))

    return random_str_func

@pytest.fixture()
def random_num():
    def random_num_func(size=10):
        return random.randint(0, 10**size)
    return random_num_func

@pytest.fixture()
def random_choice():
    def random_func(list):
        return random.choice(list)
    return random_func


@pytest.fixture()
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
@pytest.fixture()
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


@pytest.fixture()
def __device_has_group_check(api_client, successful_response_check):
    def device_has_group_check_func(serial, group_id, group_name=None):
        response = get_device_by_serial.sync_detailed(serial=serial, client=api_client)
        successful_response_check(response, description='Device Information')
        is_not_none(response.parsed.device)
        device_dict = response.parsed.device.to_dict()
        equal(device_dict.get('group').get('id'), group_id)
        if group_name is not None:
            equal(device_dict.get('group').get('name'), group_name)

    return device_has_group_check_func


# method check that device belongs to group(two requests check data in devices and groups tables)
@pytest.fixture()
def device_in_group_check(api_client, successful_response_check, __device_has_group_check):
    def device_in_group_check_func(serial, group_id, group_name=None):
        __device_has_group_check(serial, group_id, group_name)
        response = get_group.sync_detailed(id=group_id, client=api_client)
        successful_response_check(response, description='Group Information')
        is_not_none(response.parsed.group)
        group_dict = response.parsed.group.to_dict()
        is_in(serial, group_dict.get('devices'))

    return device_in_group_check_func


@pytest.fixture()
def devices_in_group_check(api_client, successful_response_check, __device_has_group_check):
    def devices_in_group_check_func(serials, group_id, group_name=None):
        # add timeout to wait while devices move to group in DB
        time.sleep(1)
        response = get_group.sync_detailed(id=group_id, client=api_client)
        successful_response_check(response, description='Group Information')
        is_not_none(response.parsed.group)
        group_dict = response.parsed.group.to_dict()
        for serial in serials:
            is_in(serial, group_dict.get('devices'))
            __device_has_group_check(serial, group_id, group_name)

    return devices_in_group_check_func


@pytest.fixture()
def common_group_id(api_client):
    response = get_groups.sync_detailed(client=api_client)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    common_group = next(filter(lambda x: x.to_dict()['name'] == 'Common', response.parsed.groups), None)
    is_not_none(common_group)
    return common_group.to_dict()['id']


# method create group and remove one after test
@pytest.fixture()
def group_creating(request, api_client, stf_secret, successful_response_check, random_str, unsuccess_response_check):
    request.param = Keeper()
    def group_creating_func(
            custom_api_client=api_client,
            group_class=GroupPayloadClass.ONCE,
            state=UNSET,
            start_time=UNSET,
            stop_time=UNSET,
            repetitions=UNSET
    ):
        group_response = create_group.sync_detailed(
            client=custom_api_client,
            body=GroupPayload(
                name=f'Group_{group_class.name}-{random_str()}',
                class_=group_class,
                state=state,
                start_time=start_time,
                stop_time=stop_time,
                repetitions=repetitions
            )
        )
        successful_response_check(group_response, status_code=201, description='Created')
        group = group_response.parsed.group
        is_not_none(group)
        equal(group.class_, group_class)
        equal(group.state, GroupState.READY if state is UNSET else state)
        request.param.add_obj(group)
        return group

    yield group_creating_func
    # remove groups or get response group not found
    while request.param.size() != 0:
        response = delete_group.sync_detailed(client=api_client, id=request.param.pop_obj().id)
        if response.status_code == 200:
            successful_response_check(response, description='Deleted (groups)')
        else:
            unsuccess_response_check(response, status_code=404, description='Not Found (groups)')


@pytest.fixture()
def first_device_serial(successful_response_check, api_client):
    response = get_devices.sync_detailed(client=api_client)
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    greater(len(response.parsed.devices), 0)
    return response.parsed.devices[0].serial


@pytest.fixture()
def devices_serial(successful_response_check, api_client):
    response = get_devices.sync_detailed(client=api_client)
    successful_response_check(response, description='Devices Information')
    is_not_none(response.parsed.devices)
    greater(len(response.parsed.devices), 0)
    return list(map(lambda x: x.serial, response.parsed.devices))


@pytest.fixture()
def successful_response_check():
    def successful_response_check_func(response, status_code=200, description=None):
        equal(response.status_code, status_code)
        is_true(response.parsed.success)
        if description is not None:
            equal(response.parsed.description, description)

    return successful_response_check_func


@pytest.fixture()
def unsuccess_response_check():
    def unsuccess_response_check_func(response, status_code=400, description=None):
        equal(response.status_code, status_code)
        response_content = json.loads(response.content)
        is_false(response_content['success'])
        if description is not None:
            equal(response_content['description'], description)

    return unsuccess_response_check_func

@pytest.fixture()
def failure_response_check():
    def failure_response_check_func(response, status_code=401, message=None):
        equal(response.status_code, status_code)
        response_content = json.loads(response.content)
        if message is not None:
            equal(response_content['message'], message)

    return failure_response_check_func
