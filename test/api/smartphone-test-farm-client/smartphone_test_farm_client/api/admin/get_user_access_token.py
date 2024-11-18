from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.user_access_token_response import UserAccessTokenResponse
from ...types import Response


def _get_kwargs(
    email: str,
    id: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/users/{email}/accessTokens/{id}",
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[UserAccessTokenResponse]:
    if response.status_code == HTTPStatus.OK:
        response_200 = UserAccessTokenResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[UserAccessTokenResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    email: str,
    id: str,
    *,
    client: AuthenticatedClient,
) -> Response[UserAccessTokenResponse]:
    """Gets an access token of a user

     Gets an access token of a user

    Args:
        email (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserAccessTokenResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        id=id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    email: str,
    id: str,
    *,
    client: AuthenticatedClient,
) -> Optional[UserAccessTokenResponse]:
    """Gets an access token of a user

     Gets an access token of a user

    Args:
        email (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserAccessTokenResponse
    """

    return sync_detailed(
        email=email,
        id=id,
        client=client,
    ).parsed


async def asyncio_detailed(
    email: str,
    id: str,
    *,
    client: AuthenticatedClient,
) -> Response[UserAccessTokenResponse]:
    """Gets an access token of a user

     Gets an access token of a user

    Args:
        email (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserAccessTokenResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        id=id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    email: str,
    id: str,
    *,
    client: AuthenticatedClient,
) -> Optional[UserAccessTokenResponse]:
    """Gets an access token of a user

     Gets an access token of a user

    Args:
        email (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserAccessTokenResponse
    """

    return (
        await asyncio_detailed(
            email=email,
            id=id,
            client=client,
        )
    ).parsed
