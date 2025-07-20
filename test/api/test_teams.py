from time import sleep

import pytest
from pytest_check import greater, equal, is_not_none, is_not_in, is_none, between_equal

from devicehub_client.api.teams import get_teams, create_team, delete_team
from devicehub_client.models import TeamPayload


def test_create_and_delete_team(api_client, successful_response_check, random_str):
    response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'group-{random_str()}'))
    created_team_id = response.parsed.team.id
    successful_response_check(response, description='Team info (created)')

    response = delete_team.sync_detailed(client=api_client, id=created_team_id)
    successful_response_check(response, description='Team deleted')


def test_get_teams(api_client, successful_response_check, random_str):
    response = create_team.sync_detailed(client=api_client, body=TeamPayload(name=f'group-{random_str()}'))
    successful_response_check(response, description='Team info (created)')

    response = get_teams.sync_detailed(client=api_client)
    successful_response_check(response, description='Teams Information')
    greater(len(response.parsed.teams), 0)
