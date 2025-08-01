from time import sleep

import pytest

from devicehub_client.api.admin import add_origin_group_devices
from devicehub_client.api.groups import add_group_user, add_group_device, delete_group
from devicehub_client.models import GroupPayloadClass, DevicesPayload


@pytest.mark.integration
class TestGroupDeviceManagement:
    """Test suite for adding and removing devices from groups"""

    def test_device_return_to_origin_group(self, api_client, api_client_custom_token, common_group_id,
                                           device_in_group_check, first_device_serial, group_creating,
                                           service_user_creating, successful_response_check, unsuccess_response_check):
        """Test device flow when groups are deleted - devices return to origin"""
        # Create bookable group by admin
        bookable_group = group_creating(group_class=GroupPayloadClass.BOOKABLE)

        # Add device to admin bookable group
        response = add_origin_group_devices.sync_detailed(
            id=bookable_group.id,
            client=api_client,
            body=DevicesPayload(serials=first_device_serial)
        )
        successful_response_check(response, description='Updated (devices)')

        # Create and add user to admin bookable group
        service_user = service_user_creating()
        response = add_group_user.sync_detailed(id=bookable_group.id, email=service_user.email, client=api_client)
        successful_response_check(response, description='Added (group users)')

        # Create once group by user
        user_api_client = api_client_custom_token(token=service_user.token)
        once_group = group_creating(custom_api_client=user_api_client)

        # Add device to once group by user
        response = add_group_device.sync_detailed(
            id=once_group.id,
            client=api_client,
            serial=first_device_serial
        )
        successful_response_check(response, description='Added (group devices)')

        # Try to delete bookable group by admin (should fail)
        response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
        unsuccess_response_check(response, status_code=403, description='Forbidden (groups)')

        # Delete once group by user
        response = delete_group.sync_detailed(id=once_group.id, client=user_api_client)
        successful_response_check(response, description='Deleted (groups)')

        # Check device moved to bookable group
        device_in_group_check(serial=first_device_serial, group_id=bookable_group.id, group_name=bookable_group.name)

        # Delete bookable group
        response = delete_group.sync_detailed(id=bookable_group.id, client=api_client)
        successful_response_check(response, description='Deleted (groups)')
        sleep(1)

        # Check device returned to common group
        device_in_group_check(serial=first_device_serial, group_id=common_group_id, group_name='Common')
