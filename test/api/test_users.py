import json
from datetime import datetime, timedelta, timezone

import pytest
from pytest_check import equal, greater, is_not_none, is_true, is_none, is_in, is_false, between_equal

from smartphone_test_farm_client.api.admin import update_users_alert_message, create_user, delete_user
from smartphone_test_farm_client.api.users import get_user_by_email, get_users_alert_message
from smartphone_test_farm_client.api.users import get_users
from smartphone_test_farm_client.models import AlertMessagePayload, AlertMessagePayloadActivation, \
    AlertMessagePayloadLevel


# api/v1/users - list of user
def test_get_users(api_client):
    response = get_users.sync_detailed(client=api_client)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Users Information')
    is_not_none(response.parsed.users)
    greater(len(response.parsed.users), 0)
    is_not_none(response.parsed.users[0].to_dict().get('email'))
    is_not_none(response.parsed.users[0].to_dict().get('name'))
    is_not_none(response.parsed.users[0].to_dict().get('privilege'))


def test_get_users_with_bad_token(api_client_with_bad_token):
    response = get_users.sync_detailed(client=api_client_with_bad_token)
    equal(response.status_code, 401)
    is_none(response.parsed)


# def test_remove_users(api_client):

# api/v1/users/alertMessage - alert message which is storage at administrator user settings
def test_get_alert_message(api_client):
    response = get_users_alert_message.sync_detailed(client=api_client)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Users Alert Message')
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
def test_get_user_by_email(api_client, admin_user):
    response = get_user_by_email.sync_detailed(client=api_client, email=admin_user.email)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'User Information')
    is_not_none(response.parsed.user)
    equal(response.parsed.user.to_dict().get('email'), admin_user.email)
    equal(response.parsed.user.to_dict().get('name'), admin_user.name)
    equal(response.parsed.user.to_dict().get('privilege'), admin_user.privilege)


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


# @pytest.mark.focus
def test_create_remove_user(api_client, random_user):
    user = random_user()
    response = create_user.sync_detailed(client=api_client,
                                         email=user.email,
                                         name=user.name)
    equal(response.status_code, 201)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Created (user)')
    is_not_none(response.parsed.user)
    equal(response.parsed.user.to_dict().get('email'), user.email)
    equal(response.parsed.user.to_dict().get('name'), user.name)
    date_now = datetime.now(timezone.utc)
    user_create_at = datetime.fromisoformat(response.parsed.user.to_dict().get('createdAt').replace("Z", "+00:00"))
    delta = timedelta(seconds=3)
    between_equal(user_create_at, date_now - delta, date_now + delta)
    equal(response.parsed.user.to_dict().get('privilege'), user.privilege)
    is_not_none(response.parsed.user.to_dict().get('groups').get('subscribed'))
    greater(len(response.parsed.user.to_dict().get('groups').get('subscribed')), 0)
    # assert response.parsed.user.to_dict().get('groups').get('subscribed') == actual_common_group_id
    is_false(response.parsed.user.to_dict().get('groups').get('lock'))
    equal(response.parsed.user.to_dict().get('groups').get('quotas').get('allocated').get('number'),
          response.parsed.user.to_dict().get('groups').get('quotas').get('defaultGroupsNumber'))
    equal(response.parsed.user.to_dict().get('groups').get('quotas').get('allocated').get('duration'),
          response.parsed.user.to_dict().get('groups').get('quotas').get('defaultGroupsDuration'))
    equal(response.parsed.user.to_dict().get('groups').get('quotas').get('consumed').get('number'), 0)
    equal(response.parsed.user.to_dict().get('groups').get('quotas').get('consumed').get('duration'), 0)
    equal(response.parsed.user.to_dict().get('groups').get('quotas').get('repetitions'),
          response.parsed.user.to_dict().get('groups').get('quotas').get('defaultGroupsRepetitions'))

    # remove crated user
    response = delete_user.sync_detailed(client=api_client, email=user.email)
    equal(response.status_code, 200)
    is_true(response.parsed.success)
    equal(response.parsed.description, 'Deleted (users)')

    # check remove
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    equal(response.status_code, 404)
