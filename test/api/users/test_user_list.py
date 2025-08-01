import pytest
from pytest_check import is_not_none, greater, equal, is_none

from devicehub_client.api.users import get_users


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
