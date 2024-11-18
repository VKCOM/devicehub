from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.device_list_response import DeviceListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    id: str,
    *,
    bookable: Union[Unset, bool] = False,
    fields: Union[Unset, str] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["bookable"] = bookable

    params["fields"] = fields

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": f"/groups/{id}/devices",
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
    id: str,
    *,
    client: AuthenticatedClient,
    bookable: Union[Unset, bool] = False,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Gets the devices of a group

     Returns the devices of the group to which you belong

    Args:
        id (str):
        bookable (Union[Unset, bool]):  Default: False.
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        bookable=bookable,
        fields=fields,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    id: str,
    *,
    client: AuthenticatedClient,
    bookable: Union[Unset, bool] = False,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Gets the devices of a group

     Returns the devices of the group to which you belong

    Args:
        id (str):
        bookable (Union[Unset, bool]):  Default: False.
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DeviceListResponse
    """

    return sync_detailed(
        id=id,
        client=client,
        bookable=bookable,
        fields=fields,
    ).parsed


async def asyncio_detailed(
    id: str,
    *,
    client: AuthenticatedClient,
    bookable: Union[Unset, bool] = False,
    fields: Union[Unset, str] = UNSET,
) -> Response[DeviceListResponse]:
    """Gets the devices of a group

     Returns the devices of the group to which you belong

    Args:
        id (str):
        bookable (Union[Unset, bool]):  Default: False.
        fields (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DeviceListResponse]
    """

    kwargs = _get_kwargs(
        id=id,
        bookable=bookable,
        fields=fields,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    id: str,
    *,
    client: AuthenticatedClient,
    bookable: Union[Unset, bool] = False,
    fields: Union[Unset, str] = UNSET,
) -> Optional[DeviceListResponse]:
    """Gets the devices of a group

     Returns the devices of the group to which you belong

    Args:
        id (str):
        bookable (Union[Unset, bool]):  Default: False.
        fields (Union[Unset, str]):

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
            bookable=bookable,
            fields=fields,
        )
    ).parsed
