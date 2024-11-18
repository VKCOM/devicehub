from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.size_response import SizeResponse
from ...types import Response


def _get_kwargs(
    serial: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/devices/{serial}/size",
    }

    return _kwargs


def _parse_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Optional[SizeResponse]:
    if response.status_code == HTTPStatus.OK:
        response_200 = SizeResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Response[SizeResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[SizeResponse]:
    """Gets the size of a device

     Gets the size of a device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[SizeResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[SizeResponse]:
    """Gets the size of a device

     Gets the size of a device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        SizeResponse
    """

    return sync_detailed(
        serial=serial,
        client=client,
    ).parsed


async def asyncio_detailed(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[SizeResponse]:
    """Gets the size of a device

     Gets the size of a device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[SizeResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[SizeResponse]:
    """Gets the size of a device

     Gets the size of a device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        SizeResponse
    """

    return (
        await asyncio_detailed(
            serial=serial,
            client=client,
        )
    ).parsed
