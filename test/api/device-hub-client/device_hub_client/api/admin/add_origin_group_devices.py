from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_list_response import DeviceListResponse
from ...models.devices_payload import DevicesPayload
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    *,
    body: DevicesPayload,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    headers: Dict[str, Any] = {}

    params: Dict[str, Any] = {}

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": f"/devices/groups/{id}",
        "params": params,
    }

    _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DeviceListResponse]:
    if response.status_code == 200:
        response_200 = DeviceListResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[DeviceListResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: DevicesPayload,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Adds devices into an origin group

     Adds devices into an origin group along with updating each added device; returns the updated devices

    Args:
        id (str):
        fields (Union[Unset, str]):
        body (DevicesPayload): Payload object for adding/removing devices

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
        fields=fields,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: DevicesPayload,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Adds devices into an origin group

     Adds devices into an origin group along with updating each added device; returns the updated devices

    Args:
        id (str):
        fields (Union[Unset, str]):
        body (DevicesPayload): Payload object for adding/removing devices

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceListResponse
    """

    return sync_detailed(
        id=id,
        client=client,
        body=body,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: DevicesPayload,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Adds devices into an origin group

     Adds devices into an origin group along with updating each added device; returns the updated devices

    Args:
        id (str):
        fields (Union[Unset, str]):
        body (DevicesPayload): Payload object for adding/removing devices

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        body=body,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    *,
    client: Union[AuthenticatedClient, Client],
    body: DevicesPayload,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Adds devices into an origin group

     Adds devices into an origin group along with updating each added device; returns the updated devices

    Args:
        id (str):
        fields (Union[Unset, str]):
        body (DevicesPayload): Payload object for adding/removing devices

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceListResponse
    """

    return (
        await asyncio_detailed(
            id=id,
            client=client,
            body=body,
            fields=fields,
        )
    ).parsed
