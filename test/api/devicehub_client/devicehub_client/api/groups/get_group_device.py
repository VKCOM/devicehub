from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_response import DeviceResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    serial: str,
    *,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/groups/{id}/devices/{serial}",
        "params": params,
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
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceResponse]:
    """Gets a device of a group

     Returns a device of a group to which you belong

    Args:
        id (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        serial=serial,
        fields=fields,
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
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceResponse]:
    """Gets a device of a group

     Returns a device of a group to which you belong

    Args:
        id (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceResponse
    """

    return sync_detailed(
        id=id,
        serial=serial,
        client=client,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceResponse]:
    """Gets a device of a group

     Returns a device of a group to which you belong

    Args:
        id (str):
        serial (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        serial=serial,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceResponse]:
    """Gets a device of a group

     Returns a device of a group to which you belong

    Args:
        id (str):
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
            id=id,
            serial=serial,
            client=client,
            fields=fields,
        )
    ).parsed
