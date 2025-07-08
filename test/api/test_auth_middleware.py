from pytest_check import equal

from devicehub_client import AuthenticatedClient, Client
from devicehub_client.api.admin import create_service_user
from devicehub_client.api.users import get_users


def test_bearer_token_authentication(api_client, successful_response_check):
    """Test standard Bearer token authentication"""
    response = get_users.sync_detailed(client=api_client)
    successful_response_check(response, description='Users Information')


def test_invalid_token_authentication(api_client_with_bad_token):
    """Test authentication failure with invalid token"""
    response = get_users.sync_detailed(client=api_client_with_bad_token)
    equal(response.status_code, 401)


def test_privilege_enforcement_admin_only(api_client_custom_token, service_user_creating):
    """Test that admin-only endpoints reject regular users"""
    regular_user = service_user_creating()
    user_client = api_client_custom_token(regular_user.token)
    # Try to access admin endpoint - should fail with 403
    response = create_service_user.sync_detailed(client=user_client, email='test@test.com', name='test', secret='secret')
    equal(response.status_code, 403)