import json
from datetime import datetime, timedelta, timezone
import pytest
from devicehub_client.api.user import get_user
from pytest_check import equal, greater, is_not_none, is_true, is_none, is_in, is_false, between_equal

from devicehub_client.api.admin import (
    update_users_alert_message, create_user, delete_user,
    create_service_user, revoke_admin, grant_admin,
    update_user_groups_quotas, update_default_user_groups_quotas
)
from devicehub_client.api.users import get_user_by_email, get_users_alert_message, get_users
from devicehub_client.models import (
    AlertMessagePayload, AlertMessagePayloadActivation, AlertMessagePayloadLevel
)
from conftest import ADMIN_PRIVILEGE, USER_PRIVILEGE


@pytest.mark.smoke
class TestUserListEndpoint:
    """Test suite for GET /api/v1/users endpoint"""

    def test_get_users_basic(self, api_client, successful_response_check):
        """Test basic user listing functionality"""
        response = get_users.sync_detailed(client=api_client)
        successful_response_check(response=response, description='Users Information')
        is_not_none(response.parsed.users)
        greater(len(response.parsed.users), 0)

        first_user_dict = response.parsed.users[0].to_dict()
        is_not_none(first_user_dict.get('email'))
        is_not_none(first_user_dict.get('name'))
        is_not_none(first_user_dict.get('privilege'))


@pytest.mark.regression
class TestUserListErrorHandling:
    """Test suite for error handling in user listing"""

    def test_get_users_with_bad_token(self, api_client_with_bad_token):
        """Test user listing with invalid authentication token"""
        response = get_users.sync_detailed(client=api_client_with_bad_token)
        equal(response.status_code, 401)
        is_none(response.parsed)


@pytest.mark.smoke
class TestUserByEmailEndpoint:
    """Test suite for GET /api/v1/users/{email} endpoint"""

    def test_get_user_by_email_basic(self, api_client, admin_user, successful_response_check):
        """Test basic user retrieval by email"""
        response = get_user_by_email.sync_detailed(client=api_client, email=admin_user.email)
        successful_response_check(response=response, description='User Information')

        user_dict = response.parsed.user.to_dict()
        is_not_none(user_dict)
        equal(user_dict.get('email'), admin_user.email)
        equal(user_dict.get('name'), admin_user.name)
        equal(user_dict.get('privilege'), admin_user.privilege)


@pytest.mark.regression
class TestUserByEmailErrorHandling:
    """Test suite for error handling in user retrieval by email"""

    def test_get_nonexistent_user_by_email(self, api_client, unsuccess_response_check):
        """Test retrieval of non-existent user"""
        response = get_user_by_email.sync_detailed(client=api_client, email='unexisting@eamil.ru')
        unsuccess_response_check(response, status_code=404, description='Not Found (user)')

    def test_get_user_by_email_with_bad_token(self, api_client_with_bad_token, admin_user):
        """Test user retrieval with invalid authentication token"""
        response = get_user_by_email.sync_detailed(client=api_client_with_bad_token, email=admin_user.email)
        equal(response.status_code, 401)
        is_none(response.parsed)


@pytest.mark.integration
class TestUserLifecycleManagement:
    """Test suite for user creation, modification, and deletion"""

    def test_create_and_delete_user_complete_flow(self, api_client, random_user, successful_response_check,
                                                  common_group_id):
        """Test complete user lifecycle from creation to deletion"""
        user = random_user()

        # Create user
        response = create_user.sync_detailed(
            client=api_client,
            email=user.email,
            name=user.name
        )
        successful_response_check(response=response, status_code=201, description='Created (user)')

        # Validate created user properties
        user_dict = response.parsed.user.to_dict()
        is_not_none(user_dict)
        equal(user_dict.get('email'), user.email)
        equal(user_dict.get('name'), user.name)

        # Validate creation timestamp
        date_now = datetime.now(timezone.utc)
        user_create_at = datetime.fromisoformat(user_dict.get('createdAt').replace("Z", "+00:00"))
        delta = timedelta(seconds=3)
        between_equal(user_create_at, date_now - delta, date_now + delta)

        # Validate user privilege and group subscriptions
        equal(user_dict.get('privilege'), user.privilege)
        subscribed = user_dict.get('groups').get('subscribed')
        is_not_none(subscribed)
        greater(len(subscribed), 0)
        equal(user_dict.get('groups').get('subscribed')[0], common_group_id)
        is_false(user_dict.get('groups').get('lock'))

        # Validate user quotas
        quotas = user_dict.get('groups').get('quotas')
        equal(quotas.get('allocated').get('number'), quotas.get('defaultGroupsNumber'))
        equal(quotas.get('allocated').get('duration'), quotas.get('defaultGroupsDuration'))
        equal(quotas.get('consumed').get('number'), 0)
        equal(quotas.get('consumed').get('duration'), 0)
        equal(quotas.get('repetitions'), quotas.get('defaultGroupsRepetitions'))

        # Delete created user
        response = delete_user.sync_detailed(client=api_client, email=user.email)
        equal(response.status_code, 200)
        is_true(response.parsed.success)
        equal(response.parsed.description, 'Deleted (users)')

        # Verify user deletion
        response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
        equal(response.status_code, 404)


@pytest.mark.integration
class TestServiceUserManagement:
    """Test suite for service user creation and management"""

    @pytest.mark.parametrize("admin", [True, False])
    def test_create_service_user_with_admin_privileges(self, api_client, admin, random_user, stf_secret,
                                                       successful_response_check, service_user_creating):
        """Test service user creation with different privilege levels"""
        request_user = random_user(privilege=ADMIN_PRIVILEGE if admin else USER_PRIVILEGE)
        service_user_creating(user=request_user)

        response = get_user_by_email.sync_detailed(client=api_client, email=request_user.email)
        successful_response_check(response=response, description='User Information')

        user_dict = response.parsed.user.to_dict()
        is_not_none(user_dict)
        equal(user_dict.get('email'), request_user.email)
        equal(user_dict.get('name'), request_user.name)
        equal(user_dict.get('privilege'), request_user.privilege)

    @pytest.mark.parametrize("admin", [True, False])
    def test_create_service_user_without_admin_privilege(self, api_client_custom_token, service_user_creating,
                                                         random_user, stf_secret, admin):
        """Test service user creation by non-admin user (should fail)"""
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


@pytest.mark.smoke
class TestUserAlertMessageEndpoint:
    """Test suite for GET/PUT /api/v1/users/alertMessage endpoint"""

    def test_get_alert_message_basic(self, api_client, successful_response_check):
        """Test basic alert message retrieval"""
        response = get_users_alert_message.sync_detailed(client=api_client)
        successful_response_check(response=response, description='Users Alert Message')

        is_not_none(response.parsed.alert_message)
        is_in(response.parsed.alert_message.activation, ['True', 'False'])
        is_in(response.parsed.alert_message.level, ['Information', 'Warning', 'Critical'])
        is_not_none(response.parsed.alert_message.data)
        greater(len(response.parsed.alert_message.data), 0)

    def test_update_alert_message_complete_flow(self, api_client, random_str, random_choice):
        """Test complete alert message update and restoration flow"""
        # Get current alert message
        response = get_users_alert_message.sync_detailed(client=api_client)
        equal(response.status_code, 200)
        is_not_none(response.parsed.alert_message)
        old_alert_message = response.parsed.alert_message

        # Create new alert message
        new_alert_message = AlertMessagePayload(
            activation=random_choice(list(AlertMessagePayloadActivation)),
            level=random_choice(list(AlertMessagePayloadLevel)),
            data=f'***Test run #{random_str()}***'
        )

        # Update alert message
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

        # Restore original alert message
        response = update_users_alert_message.sync_detailed(
            client=api_client,
            body=AlertMessagePayload.from_dict(old_alert_message.to_dict())
        )
        equal(response.status_code, 200)
        is_true(response.parsed.success)


@pytest.mark.regression
class TestUserAlertMessageErrorHandling:
    """Test suite for error handling in alert message operations"""

    def test_get_alert_message_with_bad_token(self, api_client_with_bad_token):
        """Test alert message retrieval with invalid authentication token"""
        response = get_users_alert_message.sync_detailed(client=api_client_with_bad_token)
        equal(response.status_code, 401)
        is_none(response.parsed)
