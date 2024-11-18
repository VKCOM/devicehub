from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.group_list_response import GroupListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    fields: Union[Unset, str] = UNSET,
    owner: Union[Unset, bool] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["fields"] = fields

    params["owner"] = owner

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": "/groups",
        "params": params,
    }

    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[GroupListResponse]:
    if response.status_code == HTTPStatus.OK:
        response_200 = GroupListResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[GroupListResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
    owner: Union[Unset, bool] = UNSET,
) -> Response[GroupListResponse]:
    """Gets groups

     Returns the groups to which you belong

    Args:
        fields (Union[Unset, str]):
        owner (Union[Unset, bool]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GroupListResponse]
    """

    kwargs = _get_kwargs(
        fields=fields,
        owner=owner,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
    owner: Union[Unset, bool] = UNSET,
) -> Optional[GroupListResponse]:
    """Gets groups

     Returns the groups to which you belong

    Args:
        fields (Union[Unset, str]):
        owner (Union[Unset, bool]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GroupListResponse
    """

    return sync_detailed(
        client=client,
        fields=fields,
        owner=owner,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
    owner: Union[Unset, bool] = UNSET,
) -> Response[GroupListResponse]:
    """Gets groups

     Returns the groups to which you belong

    Args:
        fields (Union[Unset, str]):
        owner (Union[Unset, bool]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GroupListResponse]
    """

    kwargs = _get_kwargs(
        fields=fields,
        owner=owner,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    fields: Union[Unset, str] = UNSET,
    owner: Union[Unset, bool] = UNSET,
) -> Optional[GroupListResponse]:
    """Gets groups

     Returns the groups to which you belong

    Args:
        fields (Union[Unset, str]):
        owner (Union[Unset, bool]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GroupListResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            fields=fields,
            owner=owner,
        )
    ).parsed
