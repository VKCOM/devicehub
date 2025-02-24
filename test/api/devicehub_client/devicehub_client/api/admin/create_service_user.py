from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.service_user_response import ServiceUserResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    email: str,
    *,
    name: str,
    admin: Union[Unset, bool] = UNSET,
    secret: str,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["name"] = name

    params["admin"] = admin

    params["secret"] = secret

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "post",
        "url": f"/users/service/{email}",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[ServiceUserResponse]:
    if response.status_code == 201:
        response_201 = ServiceUserResponse.from_dict(response.json())

        return response_201
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[ServiceUserResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    name: str,
    admin: Union[Unset, bool] = UNSET,
    secret: str,
) -> Response[ServiceUserResponse]:
    """Creates a serviceUser

     Creates a user in the database by parameters

    Args:
        email (str):
        name (str):
        admin (Union[Unset, bool]):
        secret (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ServiceUserResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        name=name,
        admin=admin,
        secret=secret,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    name: str,
    admin: Union[Unset, bool] = UNSET,
    secret: str,
) -> Optional[ServiceUserResponse]:
    """Creates a serviceUser

     Creates a user in the database by parameters

    Args:
        email (str):
        name (str):
        admin (Union[Unset, bool]):
        secret (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ServiceUserResponse
    """

    return sync_detailed(
        email=email,
        client=client,
        name=name,
        admin=admin,
        secret=secret,
    ).parsed


async def asyncio_detailed(
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    name: str,
    admin: Union[Unset, bool] = UNSET,
    secret: str,
) -> Response[ServiceUserResponse]:
    """Creates a serviceUser

     Creates a user in the database by parameters

    Args:
        email (str):
        name (str):
        admin (Union[Unset, bool]):
        secret (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[ServiceUserResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        name=name,
        admin=admin,
        secret=secret,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    email: str,
    *,
    client: Union[AuthenticatedClient, Client],
    name: str,
    admin: Union[Unset, bool] = UNSET,
    secret: str,
) -> Optional[ServiceUserResponse]:
    """Creates a serviceUser

     Creates a user in the database by parameters

    Args:
        email (str):
        name (str):
        admin (Union[Unset, bool]):
        secret (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        ServiceUserResponse
    """

    return (
        await asyncio_detailed(
            email=email,
            client=client,
            name=name,
            admin=admin,
            secret=secret,
        )
    ).parsed
