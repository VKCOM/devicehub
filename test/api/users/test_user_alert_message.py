import pytest
from pytest_check import equal, greater, is_not_none, is_true, is_none, is_in

from devicehub_client.api.admin import (
    update_users_alert_message
)
from devicehub_client.api.users import get_users_alert_message
from devicehub_client.models import (
    AlertMessagePayload, AlertMessagePayloadActivation, AlertMessagePayloadLevel
)


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
