from datetime import datetime, timezone, timedelta

import pytest
from pytest_check import is_not_none, equal, between_equal, greater, is_false, is_true

from devicehub_client.api.admin import create_user, delete_user
from devicehub_client.api.users import get_user_by_email


@pytest.mark.integration
class TestUserLifecycleManagement:
    """Test suite for user creation, modification, and deletion"""

    def test_create_and_delete_user_complete_flow(self, api_client, random_user, successful_response_check,
                                                  common_group_id, default_quotas):
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
        equal(quotas.get('allocated').get('number'), default_quotas.number)
        equal(quotas.get('allocated').get('duration'), default_quotas.duration)
        equal(quotas.get('consumed').get('number'), 0)
        equal(quotas.get('consumed').get('duration'), 0)
        equal(quotas.get('repetitions'), default_quotas.repetitions)

        # Delete created user
        response = delete_user.sync_detailed(client=api_client, email=user.email)
        equal(response.status_code, 200)
        is_true(response.parsed.success)
        equal(response.parsed.description, 'Deleted (users)')

        # Verify user deletion
        response = get_user_by_email.sync_detailed(client=api_client, email=user.email)
        equal(response.status_code, 404)
