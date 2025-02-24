from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.default_response import DefaultResponse
from ...types import Response


def _get_kwargs(
    email: str,
    serial: str,
) -> Dict[str, Any]:
    _kwargs: Dict[str, Any] = {
        "method": "delete",
        "url": f"/users/{email}/devices/{serial}",
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[DefaultResponse]:
    if response.status_code == 200:
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
    email: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[DefaultResponse]:
    """Remove a device from the user control

     Remove a device from the user control; note this is analogous to press the 'Stop Using' button in
    the UI because that forbids also remote connection through ADB

    Args:
        email (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        serial=serial,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    email: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[DefaultResponse]:
    """Remove a device from the user control

     Remove a device from the user control; note this is analogous to press the 'Stop Using' button in
    the UI because that forbids also remote connection through ADB

    Args:
        email (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return sync_detailed(
        email=email,
        serial=serial,
        client=client,
    ).parsed


async def asyncio_detailed(
    email: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Response[DefaultResponse]:
    """Remove a device from the user control

     Remove a device from the user control; note this is analogous to press the 'Stop Using' button in
    the UI because that forbids also remote connection through ADB

    Args:
        email (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[DefaultResponse]
    """

    kwargs = _get_kwargs(
        email=email,
        serial=serial,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    email: str,
    serial: str,
    *,
    client: Union[AuthenticatedClient, Client],
) -> Optional[DefaultResponse]:
    """Remove a device from the user control

     Remove a device from the user control; note this is analogous to press the 'Stop Using' button in
    the UI because that forbids also remote connection through ADB

    Args:
        email (str):
        serial (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        DefaultResponse
    """

    return (
        await asyncio_detailed(
            email=email,
            serial=serial,
            client=client,
        )
    ).parsed
