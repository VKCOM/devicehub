from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_response import DeviceResponse
from ...types import Response


def _get_kwargs(
    serial: str,
    id: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": f"/devices/{serial}/groups/{id}",
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DeviceResponse]:
    if response.status_code == 200:
        response_200 = DeviceResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[DeviceResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    serial: str,
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[DeviceResponse]:
    """Adds a device into an origin group

     Adds a device into an origin group along with updating the added device; returns the updated device

    Args:
        serial (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        id=id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    serial: str,
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[DeviceResponse]:
    """Adds a device into an origin group

     Adds a device into an origin group along with updating the added device; returns the updated device

    Args:
        serial (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceResponse
    """

    return sync_detailed(
        serial=serial,
        id=id,
        client=client,
    ).parsed


async def asyncio_detailed(
    serial: str,
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[DeviceResponse]:
    """Adds a device into an origin group

     Adds a device into an origin group along with updating the added device; returns the updated device

    Args:
        serial (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        id=id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    serial: str,
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[DeviceResponse]:
    """Adds a device into an origin group

     Adds a device into an origin group along with updating the added device; returns the updated device

    Args:
        serial (str):
        id (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceResponse
    """

    return (
        await asyncio_detailed(
            serial=serial,
            id=id,
            client=client,
        )
    ).parsed
