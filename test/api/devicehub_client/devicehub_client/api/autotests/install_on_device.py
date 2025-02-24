from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.adb_install_flags_payload import AdbInstallFlagsPayload
from ...models.remote_connect_user_device_response import RemoteConnectUserDeviceResponse
from ...types import Response


def _get_kwargs(
    serial: str,
    *,
    body: AdbInstallFlagsPayload,
) -> Dict[str, Any]:
    headers: Dict[str, Any] = {}

    _kwargs: Dict[str, Any] = {
        "method": "post",
        "url": f"/autotests/install/{serial}",
    }

    _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[RemoteConnectUserDeviceResponse]:
    if response.status_code == 200:
        response_200 = RemoteConnectUserDeviceResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[RemoteConnectUserDeviceResponse]:
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
    body: AdbInstallFlagsPayload,
) -> Response[RemoteConnectUserDeviceResponse]:
    """install apk on device by serial

     Installing apk to device from url

    Args:
        serial (str):
        body (AdbInstallFlagsPayload): List of flags for adb install

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[RemoteConnectUserDeviceResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        body=body,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: AdbInstallFlagsPayload,
) -> Optional[RemoteConnectUserDeviceResponse]:
    """install apk on device by serial

     Installing apk to device from url

    Args:
        serial (str):
        body (AdbInstallFlagsPayload): List of flags for adb install

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        RemoteConnectUserDeviceResponse
    """

    return sync_detailed(
        serial=serial,
        client=client,
        body=body,
    ).parsed


async def asyncio_detailed(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: AdbInstallFlagsPayload,
) -> Response[RemoteConnectUserDeviceResponse]:
    """install apk on device by serial

     Installing apk to device from url

    Args:
        serial (str):
        body (AdbInstallFlagsPayload): List of flags for adb install

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[RemoteConnectUserDeviceResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        body=body,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: AdbInstallFlagsPayload,
) -> Optional[RemoteConnectUserDeviceResponse]:
    """install apk on device by serial

     Installing apk to device from url

    Args:
        serial (str):
        body (AdbInstallFlagsPayload): List of flags for adb install

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        RemoteConnectUserDeviceResponse
    """

    return (
        await asyncio_detailed(
            serial=serial,
            client=client,
            body=body,
        )
    ).parsed
