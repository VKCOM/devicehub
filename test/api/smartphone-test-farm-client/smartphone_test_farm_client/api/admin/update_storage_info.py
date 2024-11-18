from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.default_response import DefaultResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    serial: str,
    *,
    place: Union[Unset, str] = UNSET,
    storage_id: Union[Unset, str] = UNSET,
    adb_port: Union[Unset, int] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["place"] = place

    params["storageId"] = storage_id

    params["adbPort"] = adb_port

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": f"/devices/{serial}/updateStorageInfo",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DefaultResponse]:
    if response.status_code == HTTPStatus.OK:
        response_200 = DefaultResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[DefaultResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    serial: str,
    *,
    client: AuthenticatedClient,
    place: Union[Unset, str] = UNSET,
    storage_id: Union[Unset, str] = UNSET,
    adb_port: Union[Unset, int] = UNSET,
) -> Response[DefaultResponse]:
    """update device storage info

     update device storage info

    Args:
        serial (str):
        place (Union[Unset, str]):
        storage_id (Union[Unset, str]):
        adb_port (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        place=place,
        storage_id=storage_id,
        adb_port=adb_port,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    serial: str,
    *,
    client: AuthenticatedClient,
    place: Union[Unset, str] = UNSET,
    storage_id: Union[Unset, str] = UNSET,
    adb_port: Union[Unset, int] = UNSET,
) -> Optional[DefaultResponse]:
    """update device storage info

     update device storage info

    Args:
        serial (str):
        place (Union[Unset, str]):
        storage_id (Union[Unset, str]):
        adb_port (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return sync_detailed(
        serial=serial,
        client=client,
        place=place,
        storage_id=storage_id,
        adb_port=adb_port,
    ).parsed


async def asyncio_detailed(
    serial: str,
    *,
    client: AuthenticatedClient,
    place: Union[Unset, str] = UNSET,
    storage_id: Union[Unset, str] = UNSET,
    adb_port: Union[Unset, int] = UNSET,
) -> Response[DefaultResponse]:
    """update device storage info

     update device storage info

    Args:
        serial (str):
        place (Union[Unset, str]):
        storage_id (Union[Unset, str]):
        adb_port (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        serial=serial,
        place=place,
        storage_id=storage_id,
        adb_port=adb_port,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    serial: str,
    *,
    client: AuthenticatedClient,
    place: Union[Unset, str] = UNSET,
    storage_id: Union[Unset, str] = UNSET,
    adb_port: Union[Unset, int] = UNSET,
) -> Optional[DefaultResponse]:
    """update device storage info

     update device storage info

    Args:
        serial (str):
        place (Union[Unset, str]):
        storage_id (Union[Unset, str]):
        adb_port (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return (
        await asyncio_detailed(
            serial=serial,
            client=client,
            place=place,
            storage_id=storage_id,
            adb_port=adb_port,
        )
    ).parsed
