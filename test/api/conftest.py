import random
import string

import pytest
from smartphone_test_farm_client import AuthenticatedClient

ADMIN_EMAIL = 'administrator@fakedomain.com'
ADMIN_NAME = 'administrator'
ADMIN_PRIVILEGE = 'admin'


BASE_URL = 'http://localhost:7100/api/v1'


def pytest_addoption(parser):
    parser.addoption("--token", action="store")


@pytest.fixture(scope='session')
def token(request):
    token_value = request.config.option.token
    if token_value is None:
        pytest.fail(reason='Missed token')
    return token_value


@pytest.fixture(scope="module")
def api_client(token):
    api_client = AuthenticatedClient(base_url=BASE_URL,
                                     token=token)
    return api_client


@pytest.fixture(scope="module")
def api_client_with_bad_token():
    api_client = AuthenticatedClient(base_url=BASE_URL, token='bad_token')
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
def base_host():
    return BASE_HOST


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
