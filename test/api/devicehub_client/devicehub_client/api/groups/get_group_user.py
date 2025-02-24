from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.user_response import UserResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    email: str,
    *,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/groups/{id}/users/{email}",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Optional[UserResponse]:
    if response.status_code == 200:
        response_200 = UserResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Response[UserResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: str,
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Response[UserResponse]:
    """Gets a user of a group

     Gets a user of a group to which you belong; if you are the administrator user then all user fields
    are returned, otherwise only 'email', 'name' and 'privilege' user fields are returned

    Args:
        id (str):
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        email=email,
        fields=fields,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Optional[UserResponse]:
    """Gets a user of a group

     Gets a user of a group to which you belong; if you are the administrator user then all user fields
    are returned, otherwise only 'email', 'name' and 'privilege' user fields are returned

    Args:
        id (str):
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserResponse
    """

    return sync_detailed(
        id=id,
        email=email,
        client=client,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    id: str,
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Response[UserResponse]:
    """Gets a user of a group

     Gets a user of a group to which you belong; if you are the administrator user then all user fields
    are returned, otherwise only 'email', 'name' and 'privilege' user fields are returned

    Args:
        id (str):
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        email=email,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Optional[UserResponse]:
    """Gets a user of a group

     Gets a user of a group to which you belong; if you are the administrator user then all user fields
    are returned, otherwise only 'email', 'name' and 'privilege' user fields are returned

    Args:
        id (str):
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserResponse
    """

    return (
        await asyncio_detailed(
            id=id,
            email=email,
            client=client,
            fields=fields,
        )
    ).parsed
