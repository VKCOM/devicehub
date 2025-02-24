from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.default_response import DefaultResponse
from ...models.users_payload import UsersPayload
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    body: UsersPayload,
    group_owner: Union[Unset, bool] = UNSET,
) -> Dict[str, Any]:
    headers: Dict[str, Any] = {}

    params: Dict[str, Any] = {}

    params["groupOwner"] = group_owner

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "delete",
        "url": "/users",
        "params": params,
    }

    _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DefaultResponse]:
    if response.status_code == 200:
        response_200 = DefaultResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[DefaultResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    body: UsersPayload,
    group_owner: Union[Unset, bool] = UNSET,
) -> Response[DefaultResponse]:
    """Removes users

     Removes users from the database

    Args:
        group_owner (Union[Unset, bool]):
        body (UsersPayload): Payload object for adding/removing users

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        body=body,
        group_owner=group_owner,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: Union[AuthenticatedClient, Client],
    body: UsersPayload,
    group_owner: Union[Unset, bool] = UNSET,
) -> Optional[DefaultResponse]:
    """Removes users

     Removes users from the database

    Args:
        group_owner (Union[Unset, bool]):
        body (UsersPayload): Payload object for adding/removing users

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return sync_detailed(
        client=client,
        body=body,
        group_owner=group_owner,
    ).parsed


async def asyncio_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    body: UsersPayload,
    group_owner: Union[Unset, bool] = UNSET,
) -> Response[DefaultResponse]:
    """Removes users

     Removes users from the database

    Args:
        group_owner (Union[Unset, bool]):
        body (UsersPayload): Payload object for adding/removing users

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        body=body,
        group_owner=group_owner,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: Union[AuthenticatedClient, Client],
    body: UsersPayload,
    group_owner: Union[Unset, bool] = UNSET,
) -> Optional[DefaultResponse]:
    """Removes users

     Removes users from the database

    Args:
        group_owner (Union[Unset, bool]):
        body (UsersPayload): Payload object for adding/removing users

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            group_owner=group_owner,
        )
    ).parsed
