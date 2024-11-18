import pytest
from smartphone_test_farm_client.api.groups import get_groups
from smartphone_test_farm_client.models import GroupListResponse


def test_get_groups(api_client):
    response = get_groups.sync_detailed(client=api_client)
    assert response.parsed.success is True
    assert len(response.parsed.groups) > 0
