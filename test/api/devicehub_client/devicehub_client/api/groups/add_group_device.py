from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.conflicts_response import ConflictsResponse
from ...models.group_response import GroupResponse
from ...types import Response


def _get_kwargs(
    id: str,
    serial: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": f"/groups/{id}/devices/{serial}",
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[ConflictsResponse, GroupResponse]]:
    if response.status_code == 200:
        response_200 = GroupResponse.from_dict(response.json())

        return response_200
    if response.status_code == 409:
        response_409 = ConflictsResponse.from_dict(response.json())

        return response_409
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[ConflictsResponse, GroupResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[Union[ConflictsResponse, GroupResponse]]:
    """Adds a device into a transient group

     Adds a device into a transient group owned by you

    Args:
        id (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ConflictsResponse, GroupResponse]]
    """

    kwargs = _get_kwargs(
        id=id,
        serial=serial,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[Union[ConflictsResponse, GroupResponse]]:
    """Adds a device into a transient group

     Adds a device into a transient group owned by you

    Args:
        id (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ConflictsResponse, GroupResponse]
    """

    return sync_detailed(
        id=id,
        serial=serial,
        client=client,
    ).parsed


async def asyncio_detailed(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[Union[ConflictsResponse, GroupResponse]]:
    """Adds a device into a transient group

     Adds a device into a transient group owned by you

    Args:
        id (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[ConflictsResponse, GroupResponse]]
    """

    kwargs = _get_kwargs(
        id=id,
        serial=serial,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[Union[ConflictsResponse, GroupResponse]]:
    """Adds a device into a transient group

     Adds a device into a transient group owned by you

    Args:
        id (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[ConflictsResponse, GroupResponse]
    """

    return (
        await asyncio_detailed(
            id=id,
            serial=serial,
            client=client,
        )
    ).parsed
