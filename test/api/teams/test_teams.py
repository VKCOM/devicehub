from time import sleep
import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal, is_in

from devicehub_client.api.groups import add_group_devices
from devicehub_client.api.teams import get_teams, create_team, delete_team, update_team, remove_user_from_team
from devicehub_client.api.devices import get_devices
from devicehub_client.models import TeamPayload, GroupPayloadClass, DevicesPayload


@pytest.mark.smoke
class TestTeamBasicOperations:
    """Test suite for basic team CRUD operations"""

    def test_create_and_delete_team_basic(self, api_client, successful_response_check, random_str):
        """Test basic team creation and deletion lifecycle"""
        response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'team-{random_str()}'))
        created_team_id = response.parsed.team.id
        successful_response_check(response, description='Team info (created)')

        response = delete_team.sync_detailed(client=api_client, id=created_team_id)
        successful_response_check(response, description='Team deleted')

    def test_get_teams_basic(self, api_client, successful_response_check, random_str):
        """Test basic team listing functionality"""
        response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'group-{random_str()}'))
        successful_response_check(response, description='Team info (created)')

        response = get_teams.sync_detailed(client=api_client)
        successful_response_check(response, description='Teams Information')
        greater(len(response.parsed.teams), 0)


@pytest.mark.integration
class TestTeamUserManagement:
    """Test suite for team user membership operations"""

    def test_add_and_remove_user_to_team_complete_flow(self, api_client, api_client_custom_token,
                                                       successful_response_check, random_str, group_creating,
                                                       service_user_creating, first_device_serial):
        """Test complete user team membership flow with device access validation"""
        # Create new team
        response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'team-{random_str()}'))
        created_team_id = response.parsed.team.id
        successful_response_check(response, description='Team info (created)')

        # Create service user
        service_user = service_user_creating()
        user_api_client = api_client_custom_token(token=service_user.token)

        # Verify service user can initially access device
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        devices = [device.serial for device in devices]
        is_in(first_device_serial, devices)

        # Create group and add device to bookable group
        bookable_group = group_creating(group_class=GroupPayloadClass.ONCE)
        response = add_group_devices.sync_detailed(
            id=bookable_group.id,
            client=api_client,
            body=DevicesPayload(serials=first_device_serial)
        )
        successful_response_check(response, description='Added (group devices)')

        # Verify service user cannot access device after group assignment
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        devices = [device.serial for device in devices]
        is_not_in(first_device_serial, devices)

        # Add group to team
        group_add = update_team.sync_detailed(client=api_client, id=created_team_id,
                                              body=TeamPayload(groups=[bookable_group.id]))
        successful_response_check(group_add)

        # Verify service user still cannot access device (not in team yet)
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        devices = [device.serial for device in devices]
        is_not_in(first_device_serial, devices)

        # Add user to team
        user_add = update_team.sync_detailed(client=api_client, id=created_team_id,
                                             body=TeamPayload(users=[service_user.email]))
        successful_response_check(user_add)

        # Verify user can now access device through team membership
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        devices = [device.serial for device in devices]
        is_in(first_device_serial, devices)

        # Remove user from team
        remove_user_from_team.sync_detailed(client=api_client, id=created_team_id, email=service_user.email)

        # Verify user cannot access device after removal
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        devices = [device.serial for device in devices]
        is_not_in(first_device_serial, devices)

        # Cleanup
        response = delete_team.sync_detailed(client=api_client, id=created_team_id)
        successful_response_check(response, description='Team deleted')


@pytest.mark.integration
class TestTeamGroupIntegration:
    """Test suite for team and group integration scenarios"""

    def test_team_group_device_access_control(self, api_client, api_client_custom_token, successful_response_check,
                                              random_str, group_creating, service_user_creating, first_device_serial):
        """Test device access control through team-group relationships"""
        # Create team and service user
        response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'access-team-{random_str()}'))
        team_id = response.parsed.team.id
        successful_response_check(response, description='Team info (created)')

        service_user = service_user_creating()
        user_api_client = api_client_custom_token(token=service_user.token)

        # Create multiple groups with different access patterns
        bookable_group_1 = group_creating(group_class=GroupPayloadClass.ONCE)
        bookable_group_2 = group_creating(group_class=GroupPayloadClass.ONCE)

        # Add devices to different groups
        response = add_group_devices.sync_detailed(
            id=bookable_group_1.id,
            client=api_client,
            body=DevicesPayload(serials=first_device_serial)
        )
        successful_response_check(response, description='Added (group devices)')

        # Add only first group to team initially
        response = update_team.sync_detailed(
            client=api_client,
            id=team_id,
            body=TeamPayload(groups=[bookable_group_1.id])
        )
        successful_response_check(response)

        # Add user to team
        response = update_team.sync_detailed(
            client=api_client,
            id=team_id,
            body=TeamPayload(users=[service_user.email])
        )
        successful_response_check(response)

        # Verify user has access to devices in team's groups
        devices = get_devices.sync_detailed(client=user_api_client).parsed.devices
        device_serials = [device.serial for device in devices]
        is_in(first_device_serial, device_serials)

        # Update team to include both groups
        response = update_team.sync_detailed(
            client=api_client,
            id=team_id,
            body=TeamPayload(groups=[bookable_group_1.id, bookable_group_2.id])
        )
        successful_response_check(response)

        # Cleanup
        response = delete_team.sync_detailed(client=api_client, id=team_id)
        successful_response_check(response, description='Team deleted')

