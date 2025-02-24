import json
from datetime import datetime, timedelta, timezone

import pytest
from pytest_check import equal, greater, is_not_none, is_true, is_none, is_in, is_false, between_equal

from devicehub_client.api.admin import update_users_alert_message, create_user, delete_user, \
    create_service_user
from devicehub_client.api.users import get_user_by_email, get_users_alert_message
from devicehub_client.api.users import get_users
from devicehub_client.models import AlertMessagePayload, AlertMessagePayloadActivation, \
    AlertMessagePayloadLevel


# api/v1/users - list of user
def test_get_users(api_client, successful_response_check):
    response = get_users.sync_detailed(client=api_client)
    successful_response_check(
        response=response,
        description='Users Information'
    )
    is_not_none(response.parsed.users)
    greater(len(response.parsed.users), 0)
    first_user_dict = response.parsed.users[0].to_dict()
    is_not_none(first_user_dict.get('email'))
    is_not_none(first_user_dict.get('name'))
    is_not_none(first_user_dict.get('privilege'))


def test_get_users_with_bad_token(api_client_with_bad_token):
    response = get_users.sync_detailed(client=api_client_with_bad_token)
    equal(response.status_code, 401)
    is_none(response.parsed)


# def test_remove_users(api_client):

# api/v1/users/alertMessage - alert message which is storage at administrator user settings
def test_get_alert_message(api_client, successful_response_check):
    response = get_users_alert_message.sync_detailed(client=api_client)
    successful_response_check(
        response=response,
        description='Users Alert Message'
    )
    is_not_none(response.parsed.alert_message)
    is_in(response.parsed.alert_message.activation, ['True', 'False'])
    is_in(response.parsed.alert_message.level, ['Information', 'Warning', 'Critical'])
    is_not_none(response.parsed.alert_message.data)
    greater(len(response.parsed.alert_message.data), 0)


def test_put_alert_message(api_client, random_str, random_choice):
    response = get_users_alert_message.sync_detailed(client=api_client)
    equal(response.status_code, 200)
    is_not_none(response.parsed.alert_message)
    old_alert_message = response.parsed.alert_message
    new_alert_message = AlertMessagePayload(
        activation=random_choice(list(AlertMessagePayloadActivation)),
        level=random_choice(list(AlertMessagePayloadLevel)),
        data=f'***Test run #{random_str()}***'
    )
    response = update_users_alert_message.sync_detailed(
        client=api_client,
        body=new_alert_message
    )
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Updated (users alert message)')
    is_not_none(response.parsed.alert_message)
    equal(response.parsed.alert_message.activation, new_alert_message.activation.value)
    equal(response.parsed.alert_message.level, new_alert_message.level.value)
    equal(response.parsed.alert_message.data, new_alert_message.data)
    #     return old alertMessage
    response = update_users_alert_message.sync_detailed(
        client=api_client,
        body=AlertMessagePayload.from_dict(old_alert_message.to_dict())
    )
    equal(response.status_code, 200)
    is_true(response.parsed.success)


def test_get_alert_message_with_bad_token(api_client_with_bad_token):
    response = get_users_alert_message.sync_detailed(client=api_client_with_bad_token)
    equal(response.status_code, 401)
    is_none(response.parsed)


# api/v1/users/{user_email} - certain user by email
def test_get_user_by_email(api_client, admin_user, successful_response_check):
    response = get_user_by_email.sync_detailed(client=api_client, email=admin_user.email)
    successful_response_check(
        response=response,
        description='User Information',
    )
    user_dict = response.parsed.user.to_dict()
    is_not_none(user_dict)
    equal(user_dict.get('email'), admin_user.email)
    equal(user_dict.get('name'), admin_user.name)
    equal(user_dict.get('privilege'), admin_user.privilege)


def test_get_unexisting_user_by_email(api_client):
    response = get_user_by_email.sync_detailed(client=api_client, email='unexisting@eamil.ru')
    equal(response.status_code, 404)
    is_none(response.parsed)
    is_not_none(response.content)
    response_content = json.loads(response.content)
    is_false(response_content['success'])
    equal(response_content['description'], 'Not Found (user)')


def test_get_user_by_email_with_bad_token(api_client_with_bad_token, admin_user):
    response = get_user_by_email.sync_detailed(client=api_client_with_bad_token, email=admin_user.email)
    equal(response.status_code, 401)
    is_none(response.parsed)


def test_create_remove_user(api_client, random_user, successful_response_check, common_group_id):
    user = random_user()
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
    equal(user_dict.get('email'), user.email)
    equal(user_dict.get('name'), user.name)
    date_now = datetime.now(timezone.utc)
    user_create_at = datetime.fromisoformat(user_dict.get('createdAt').replace("Z", "+00:00"))
    delta = timedelta(seconds=3)
    between_equal(user_create_at, date_now - delta, date_now + delta)
    equal(user_dict.get('privilege'), user.privilege)
    subscribed = user_dict.get('groups').get('subscribed')
    is_not_none(subscribed)
    greater(len(subscribed), 0)
    equal(user_dict.get('groups').get('subscribed')[0], common_group_id)
    is_false(user_dict.get('groups').get('lock'))
    quotas = user_dict.get('groups').get('quotas')
    equal(quotas.get('allocated').get('number'), quotas.get('defaultGroupsNumber'))
    equal(quotas.get('allocated').get('duration'), quotas.get('defaultGroupsDuration'))
    equal(quotas.get('consumed').get('number'), 0)
    equal(quotas.get('consumed').get('duration'), 0)
    equal(quotas.get('repetitions'), quotas.get('defaultGroupsRepetitions'))

    # remove crated user
    response = delete_user.sync_detailed(client=api_client, email=user.email)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Deleted (users)')

    # check remove
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    equal(response.status_code, 404)


@pytest.mark.parametrize("admin", [True, False])
# api/v1/users/service/{id} - create server account
def test_create_server_user(api_client, admin, random_user, stf_secret, successful_response_check):
    request_user = random_user()
    response = create_service_user.sync_detailed(
        client=api_client,
        email=request_user.email,
        name=request_user.name,
        admin=admin,
        secret=stf_secret
    )
    successful_response_check(
        response=response,
        status_code=201,
        description='Created (service user)'
    )
    service_user_dict = response.parsed.service_user_info.to_dict()
    is_not_none(service_user_dict)
    equal(service_user_dict.get('email'), request_user.email)
    is_not_none(service_user_dict.get('token'))

    response = get_user_by_email.sync_detailed(client=api_client, email=request_user.email)
    successful_response_check(
        response=response,
        description='User Information',
    )
    user_dict = response.parsed.user.to_dict()
    is_not_none(user_dict)
    equal(user_dict.get('email'), request_user.email)
    equal(user_dict.get('name'), request_user.name)
    equal(user_dict.get('privilege'), 'admin' if admin else 'user')


@pytest.mark.parametrize("admin", [True, False])
def test_create_server_user_without_admin_privilege(
    api_client_custom_token,
    service_user_token,
    random_user,
    stf_secret,
    admin
):
    request_user = random_user()
    response = create_service_user.sync_detailed(
        client=api_client_custom_token(token=service_user_token()),
        email=request_user.email,
        name=request_user.name,
        admin=admin,
        secret=stf_secret
    )
    equal(response.status_code, 403)
