import pytest
from pytest_check import greater

from devicehub_client.api.groups import get_groups


@pytest.mark.smoke
class TestGroupListEndpoint:
    """Test suite for GET /api/v1/groups endpoint"""

    def test_get_groups_basic(self, api_client, successful_response_check):
        """Test basic group listing functionality"""
        response = get_groups.sync_detailed(client=api_client)
        successful_response_check(response, description='Groups Information')
        greater(len(response.parsed.groups), 0)
