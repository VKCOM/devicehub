import pytest
from pytest_check import is_not_none, equal, is_none

from devicehub_client.api.users import get_user_by_email


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
