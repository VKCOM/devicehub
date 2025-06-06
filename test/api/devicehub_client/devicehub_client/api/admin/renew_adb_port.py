from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.adb_port_response import AdbPortResponse
from ...types import Response


def _get_kwargs(
    serial: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": f"/devices/{serial}/adbPort",
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[AdbPortResponse]:
    if response.status_code == 200:
        response_200 = AdbPortResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[AdbPortResponse]:
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
) -> Response[AdbPortResponse]:
    """Renews adb port for device

     Renews adb port for device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AdbPortResponse]
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
) -> Optional[AdbPortResponse]:
    """Renews adb port for device

     Renews adb port for device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AdbPortResponse
    """

    return sync_detailed(
        serial=serial,
        client=client,
    ).parsed


async def asyncio_detailed(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[AdbPortResponse]:
    """Renews adb port for device

     Renews adb port for device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[AdbPortResponse]
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
) -> Optional[AdbPortResponse]:
    """Renews adb port for device

     Renews adb port for device

    Args:
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        AdbPortResponse
    """

    return (
        await asyncio_detailed(
            serial=serial,
            client=client,
        )
    ).parsed
