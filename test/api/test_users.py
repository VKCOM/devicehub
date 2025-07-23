import json
from datetime import datetime, timedelta, timezone

import pytest

from devicehub_client.api.groups import remove_group_user, remove_group_users
from devicehub_client.api.user import get_user
from pytest_check import equal, greater, is_not_none, is_true, is_none, is_in, is_false, between_equal

from devicehub_client.api.admin import update_users_alert_message, create_user, delete_user, \
    create_service_user, revoke_admin, grant_admin, update_user_groups_quotas, update_default_user_groups_quotas
from devicehub_client.api.users import get_user_by_email, get_users_alert_message
from devicehub_client.api.users import get_users
from devicehub_client.models import AlertMessagePayload, AlertMessagePayloadActivation, \
    AlertMessagePayloadLevel, UsersPayload

from conftest import ADMIN_PRIVILEGE, USER_PRIVILEGE


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


def test_get_unexisting_user_by_email(api_client, unsuccess_response_check):
    response = get_user_by_email.sync_detailed(client=api_client, email='unexisting@eamil.ru')
    unsuccess_response_check(response, status_code=404, description='Not Found (user)')


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
def test_create_server_user(api_client, admin, random_user, stf_secret, successful_response_check,
                             service_user_creating):
    request_user = random_user(privilege=ADMIN_PRIVILEGE if admin else USER_PRIVILEGE)
    service_user_creating(user=request_user)
    response = get_user_by_email.sync_detailed(client=api_client, email=request_user.email)
    successful_response_check(
        response=response,
        description='User Information',
    )
    user_dict = response.parsed.user.to_dict()
    is_not_none(user_dict)
    equal(user_dict.get('email'), request_user.email)
    equal(user_dict.get('name'), request_user.name)
    equal(user_dict.get('privilege'), request_user.privilege)


@pytest.mark.parametrize("admin", [True, False])
def test_create_server_user_without_admin_privilege(
    api_client_custom_token,
    service_user_creating,
    random_user,
    stf_secret,
    admin
):
    request_user = random_user()
    service_user = service_user_creating()
    response = create_service_user.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        email=request_user.email,
        name=request_user.name,
        admin=admin,
        secret=stf_secret
    )
    equal(response.status_code, 403)


def test_grant_admin_privilege(api_client, random_user, successful_response_check, stf_secret, regular_user):
    """Test granting admin privilege to a regular user"""
    # First create a regular user
    user = regular_user()
    # Verify user has regular privilege
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'user')

    # Grant admin privilege
    response = grant_admin.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='Grant admin for user')

    # Verify admin privilege was granted
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'admin')


def test_grant_admin_already_admin_user(api_client, random_user, successful_response_check, stf_secret,
                                        service_user_creating):
    """Test granting admin privilege to user who is already admin"""
    # Create user with admin privilege
    user = random_user(privilege=ADMIN_PRIVILEGE)
    service_user_creating(user=user)

    # Grant admin privilege to already admin user
    response = grant_admin.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='Grant admin for user')

    # Verify user is still admin
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'admin')


def test_grant_admin_nonexistent_user(api_client, unsuccess_response_check):
    """Test granting admin to non-existent user returns 404"""
    response = grant_admin.sync_detailed(client=api_client, email='nonexistent@example.com')
    unsuccess_response_check(response, status_code=404, description='Not Found (user)')


def test_grant_admin_with_bad_token(api_client_with_bad_token, admin_user, failure_response_check):
    """Test granting admin with invalid token returns 401"""
    response = grant_admin.sync_detailed(client=api_client_with_bad_token, email=admin_user.email)
    failure_response_check(response, status_code=401, message='Unknown token')


def test_grant_admin_without_admin_privilege(api_client_custom_token, service_user_creating, admin_user, failure_response_check):
    """Test granting admin without admin privilege returns 403"""
    service_user = service_user_creating()
    response = grant_admin.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        email=admin_user.email
    )
    failure_response_check(response, status_code=403, message='Forbidden: privileged operation (admin)')


def test_grant_revoke_admin_cycle(api_client, random_user, successful_response_check, stf_secret, regular_user):
    """Test complete cycle of granting and revoking admin privileges"""
    # Create regular user
    user = regular_user()

    # Grant admin privilege
    response = grant_admin.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='Grant admin for user')

    # Verify admin privilege
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'admin')

    # Revoke admin privilege
    response = revoke_admin.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='Revoke admin for user')

    # Verify privilege reverted to user
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'user')


def test_revoke_admin_privilege(api_client, random_user, successful_response_check, stf_secret, service_user_creating):
    """Test revoking admin privilege from a user"""
    # First create a user with admin privilege
    user = random_user(privilege=ADMIN_PRIVILEGE)
    service_user_creating(user=user)

    # Verify user has admin privilege
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'admin')

    # Revoke admin privilege
    response = revoke_admin.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='Revoke admin for user')

    # Verify admin privilege was revoked
    response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    successful_response_check(response=response, description='User Information')
    equal(response.parsed.user.privilege, 'user')


def test_revoke_admin_nonexistent_user(api_client, unsuccess_response_check):
    """Test revoking admin from non-existent user returns 404"""
    response = revoke_admin.sync_detailed(client=api_client, email='nonexistent@example.com')
    unsuccess_response_check(response, status_code=404, description='Not Found (user)')


def test_revoke_admin_with_bad_token(api_client_with_bad_token, admin_user, failure_response_check):
    """Test revoking admin with invalid token returns 401"""
    response = revoke_admin.sync_detailed(client=api_client_with_bad_token, email=admin_user.email)
    failure_response_check(response, status_code=401, message='Unknown token')


def test_revoke_admin_without_admin_privilege(api_client_custom_token, service_user_creating, admin_user,
                                              failure_response_check):
    """Test revoking admin without admin privilege returns 403"""
    service_user = service_user_creating()
    response = revoke_admin.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        email=admin_user.email
    )
    failure_response_check(response, status_code=403, message='Forbidden: privileged operation (admin)')


@pytest.mark.parametrize("quotas",
                         [
                             (5, 3600000, 5),
                             (5, None, None),
                             (None, 3600000, None),
                             (None, None, 5),
                             (0, 0, 0)
                         ],
                         ids=[
                            "with all quota parameters",
                            "only with quota number parameter",
                            "only with quota duration parameter",
                            "only with quota repetitions parameter",
                            "all quota parameters are zeros",
                         ])
def test_update_default_user_groups_quotas(successful_response_check, quotas,
                                                   service_user_creating, random_user, api_client_custom_token):
    """Test updating default group quotas for new users"""
    quota_number, quota_duration, quota_repetitions = quotas
    default_quotas = (10, 1296000000, 10)
    request_user = random_user(privilege=ADMIN_PRIVILEGE)
    service_user = service_user_creating(user=request_user)
    response = update_default_user_groups_quotas.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        number=quota_number,
        duration=quota_duration,
        repetitions=quota_repetitions
    )
    successful_response_check(
        response=response,
        description='Updated (user default quotas)'
    )
    # Check quotas updated
    response = get_user.sync_detailed(client=api_client_custom_token(token=service_user.token))
    successful_response_check(
        response=response,
        description='User information'
    )
    user_dict = response.parsed.user.to_dict()
    equal(user_dict['defaultGroupsNumber'], quota_number if quota_number or quota_number == 0 else default_quotas[0])
    equal(user_dict['defaultGroupsDuration'], quota_duration if quota_duration or quota_duration == 0 else default_quotas[1])
    equal(user_dict['defaultGroupsRepetitions'], quota_repetitions if quota_repetitions or quota_repetitions == 0 else default_quotas[2])


def test_update_default_user_groups_quotas_unauthorized(api_client_with_bad_token, failure_response_check):
    """Test updating default quotas with bad token returns 401"""
    response = update_default_user_groups_quotas.sync_detailed(
        client=api_client_with_bad_token,
        number=5
    )
    failure_response_check(response, status_code=401, message='Unknown token')


def test_update_default_user_groups_quotas_without_admin(api_client_custom_token, service_user_creating,
                                                         failure_response_check):
    """Test updating default quotas without admin privilege returns 403"""
    service_user = service_user_creating()
    response = update_default_user_groups_quotas.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        number=5
    )
    failure_response_check(response, status_code=403, message='Forbidden: privileged operation (admin)')


def test_update_user_groups_quotas(api_client, random_user, successful_response_check, stf_secret, regular_user,
                                   random_num):
    """Test updating group quotas for a specific user"""
    # First create a regular user
    user = regular_user()

    quota_number = random_num(2)
    quota_duration = random_num(8)
    quota_repetitions = random_num(2)

    # Update user's group quotas
    response = update_user_groups_quotas.sync_detailed(
        client=api_client,
        email=user.email,
        number=quota_number,
        duration=quota_duration,
        repetitions=quota_repetitions
    )
    successful_response_check(
        response=response,
        description='Updated (user quotas)'
    )

    # Verify the quotas were updated
    user_response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
    user_dict = user_response.parsed.user.to_dict()
    quotas = user_dict['groups']['quotas']
    allocated = quotas.get('allocated', {})
    equal(allocated['number'], quota_number)
    equal(allocated['duration'], quota_duration)
    equal(quotas['repetitions'], quota_repetitions)


def test_update_user_groups_quotas_nonexistent_user(api_client, unsuccess_response_check):
    """Test updating quotas for non-existent user returns 404"""
    response = update_user_groups_quotas.sync_detailed(
        client=api_client,
        email='nonexistent@example.com',
        number=5
    )
    unsuccess_response_check(response, status_code=404, description='Unknown user')


@pytest.mark.parametrize("quotas",
                         [
                             (0, 0, 0),
                             (0, None, None),
                             (None, 0, None),
                             (None, None, 0),
                         ],
                         ids=[
                            "all quota parameters are zeros",
                            "only quota number is zero",
                            "only duration is zero",
                            "only repetitions is zero",
                         ])
def test_update_user_groups_quotas_invalid_quotas(api_client, admin_user, regular_user, unsuccess_response_check,
                                                  quotas):
    """Test updating quotas below consumed resources returns 400"""
    # First create a regular user
    user = regular_user()
    quota_number, quota_duration, quota_repetitions = quotas
    # This test assumes the user has already consumed some resources
    # and we're trying to set quotas below the consumed amount
    response = update_user_groups_quotas.sync_detailed(
        client=api_client,
        email=user.email,
        number=quota_number,  # Assuming admin has consumed more than 0
        duration=quota_duration,
        repetitions=quota_repetitions
    )
    # Should return 400 if quotas are below consumed resources
    unsuccess_response_check(response, status_code=400, description='Bad Request (quotas must be >= actual consumed resources)')


def test_update_user_groups_quotas_unauthorized(api_client_with_bad_token, admin_user, failure_response_check):
    """Test updating user quotas with bad token returns 401"""
    response = update_user_groups_quotas.sync_detailed(
        client=api_client_with_bad_token,
        email=admin_user.email,
        number=5
    )
    failure_response_check(response, status_code=401, message='Unknown token')


def test_update_user_groups_quotas_without_admin(api_client_custom_token, service_user_creating, admin_user,
                                                 failure_response_check):
    """Test updating user quotas without admin privilege returns 403"""
    service_user = service_user_creating()
    response = update_user_groups_quotas.sync_detailed(
        client=api_client_custom_token(token=service_user.token),
        email=admin_user.email,
        number=5
    )
    failure_response_check(response, status_code=403, message='Forbidden: privileged operation (admin)')


def test_remove_single_user_from_group_success(
        api_client,
        common_group_id,
        test_user_email,
        successful_response_check
):
    """Test successful removal of a single user from group"""
    response = remove_group_user.sync_detailed(
        id=common_group_id,
        email=test_user_email,
        client=api_client
    )

    successful_response_check(response, description="Removed (group user)")
    is_not_none(response.parsed.group)


def test_remove_multiple_users_from_group_success(
        api_client,
        common_group_id,
        test_users_emails,
        successful_response_check
):
    """Test successful removal of multiple users from group"""
    body = UsersPayload(emails=",".join(test_users_emails))

    response = remove_group_users.sync_detailed(
        id=common_group_id,
        client=api_client,
        body=body
    )

    successful_response_check(response, description="Removed (group users)")
    is_not_none(response.parsed.group)


def test_remove_user_from_nonexistent_group(
        api_client,
        test_user_email,
        random_str,
        unsuccess_response_check
):
    """Test removing user from non-existent group"""
    fake_group_id = f"group-{random_str()}"

    response = remove_group_user.sync_detailed(
        id=fake_group_id,
        email=test_user_email,
        client=api_client
    )

    unsuccess_response_check(response, status_code=404, description="Not Found (group)")


def test_remove_nonexistent_user_from_group(
        api_client,
        common_group_id,
        random_str,
        unsuccess_response_check
):
    """Test removing non-existent user from group"""
    fake_email = f"fake-{random_str()}@example.com"

    response = remove_group_user.sync_detailed(
        id=common_group_id,
        email=fake_email,
        client=api_client
    )

    unsuccess_response_check(response, status_code=404, description="Not Found (group user)")


def test_remove_group_owner_forbidden(
        api_client,
        common_group_id,
        group_owner_email,
        unsuccess_response_check
):
    """Test that removing group owner is forbidden"""
    response = remove_group_user.sync_detailed(
        id=common_group_id,
        email=group_owner_email,
        client=api_client
    )

    unsuccess_response_check(response, status_code=403, description="Forbidden (group user)")


def test_remove_all_users_from_group(
        api_client,
        common_group_id,
        successful_response_check
):
    """Test removing all users from group (empty emails parameter)"""
    body = UsersPayload()  # Empty body removes all users

    response = remove_group_users.sync_detailed(
        id=common_group_id,
        client=api_client,
        body=body
    )

    successful_response_check(response, description="Removed (group users)")
    is_not_none(response.parsed.group)


def test_remove_user_already_not_in_group(
        api_client,
        common_group_id,
        user_not_in_group_email,
        successful_response_check
):
    """Test removing user that's already not in the group"""
    response = remove_group_user.sync_detailed(
        id=common_group_id,
        email=user_not_in_group_email,
        client=api_client
    )

    successful_response_check(response, status_code=200, description="Unchanged (group user)")