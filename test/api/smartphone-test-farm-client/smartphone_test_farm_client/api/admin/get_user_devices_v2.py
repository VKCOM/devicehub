from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_list_response import DeviceListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    email: str,
    *,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/users/{email}/devices",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DeviceListResponse]:
    if response.status_code == HTTPStatus.OK:
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
    email: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Gets the devices controlled by a user

     Gets the devices controlled by a user

    Args:
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        fields=fields,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    email: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Gets the devices controlled by a user

     Gets the devices controlled by a user

    Args:
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceListResponse
    """

    return sync_detailed(
        email=email,
        client=client,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    email: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Gets the devices controlled by a user

     Gets the devices controlled by a user

    Args:
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    email: str,
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Gets the devices controlled by a user

     Gets the devices controlled by a user

    Args:
        email (str):
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceListResponse
    """

    return (
        await asyncio_detailed(
            email=email,
            client=client,
            fields=fields,
        )
    ).parsed
