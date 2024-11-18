from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_response import DeviceResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    email: str,
    serial: str,
    *,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/users/{email}/devices/{serial}",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DeviceResponse]:
    if response.status_code == HTTPStatus.OK:
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
    email: str,
    serial: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceResponse]:
    """Gets a device controlled by a user

     Gets a device controlled by a user

    Args:
        email (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        serial=serial,
        fields=fields,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    email: str,
    serial: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceResponse]:
    """Gets a device controlled by a user

     Gets a device controlled by a user

    Args:
        email (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceResponse
    """

    return sync_detailed(
        email=email,
        serial=serial,
        client=client,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    email: str,
    serial: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceResponse]:
    """Gets a device controlled by a user

     Gets a device controlled by a user

    Args:
        email (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        serial=serial,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    email: str,
    serial: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceResponse]:
    """Gets a device controlled by a user

     Gets a device controlled by a user

    Args:
        email (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceResponse
    """

    return (
        await asyncio_detailed(
            email=email,
            serial=serial,
            client=client,
            fields=fields,
        )
    ).parsed
