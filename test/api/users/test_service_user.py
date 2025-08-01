import pytest
from pytest_check import is_not_none, equal

from conftest import ADMIN_PRIVILEGE, USER_PRIVILEGE
from devicehub_client.api.admin import create_service_user
from devicehub_client.api.users import get_user_by_email


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
