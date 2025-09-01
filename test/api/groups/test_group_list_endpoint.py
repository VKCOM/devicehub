import pytest, time
from pytest_check import greater

from devicehub_client.api.groups import get_groups
from devicehub_client.api.admin import grant_admin, create_user
from devicehub_client.models import GroupPayloadClass

@pytest.mark.smoke
class TestGroupListEndpoint:
    """Test suite for GET /api/v1/groups endpoint"""

    def test_get_groups_basic(self, api_client, successful_response_check):
        """Test basic group listing functionality"""
        response = get_groups.sync_detailed(client=api_client)
        successful_response_check(response, description='Groups Information')
        greater(len(response.parsed.groups), 0)

    def test_user_group_access_before_and_after_admin_privileges(
        self,
        group_creating,
        api_client,
        api_client_custom_token,
        service_user_creating,
        stf_secret,
        successful_response_check,
        random_str
    ):
        """Test of groups visibility for user/admin"""

        group = group_creating(group_class=GroupPayloadClass.ONCE)

        # Create a service user without admin privileges
        service_user_name = f"test-service-user-{random_str()}"
        service_user = service_user_creating()

        service_user_client = api_client_custom_token(service_user.token)

        # Get initial groups list (before admin privileges)
        initial_groups_response = get_groups.sync_detailed(client=service_user_client)
        successful_response_check(initial_groups_response)
        initial_groups = initial_groups_response.parsed.groups
        initial_group_count = len(initial_groups)

        # Grant administrator rights to the service user
        grant_admin_response = grant_admin.sync_detailed(
            client=api_client,  # Use admin client to grant privileges
            email=service_user.email
        )
        successful_response_check(grant_admin_response)

        # Get groups list again after admin privileges
        admin_groups_response = get_groups.sync_detailed(client=service_user_client)
        successful_response_check(admin_groups_response)
        admin_groups = admin_groups_response.parsed.groups
        admin_group_count = len(admin_groups) - 1 # ignore common group

        # Verify that admin user has access to more groups
        assert admin_group_count > initial_group_count, (
            f"Admin user should have more groups. "
            f"Initial: {initial_group_count}, Admin (ignore common): {admin_group_count}"
        )
