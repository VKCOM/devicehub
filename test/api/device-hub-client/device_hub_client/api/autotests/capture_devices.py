from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.group_response import GroupResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    timeout: int,
    amount: int,
    need_amount: Union[Unset, bool] = UNSET,
    abi: Union[Unset, str] = UNSET,
    sdk: Union[Unset, str] = UNSET,
    model: Union[Unset, str] = UNSET,
    type: Union[Unset, str] = UNSET,
    version: Union[Unset, str] = UNSET,
    run: str,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["timeout"] = timeout

    params["amount"] = amount

    params["need_amount"] = need_amount

    params["abi"] = abi

    params["sdk"] = sdk

    params["model"] = model

    params["type"] = type

    params["version"] = version

    params["run"] = run

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "get",
        "url": "/autotests",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Optional[GroupResponse]:
    if response.status_code == 200:
        response_200 = GroupResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Response[GroupResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    timeout: int,
    amount: int,
    need_amount: Union[Unset, bool] = UNSET,
    abi: Union[Unset, str] = UNSET,
    sdk: Union[Unset, str] = UNSET,
    model: Union[Unset, str] = UNSET,
    type: Union[Unset, str] = UNSET,
    version: Union[Unset, str] = UNSET,
    run: str,
) -> Response[GroupResponse]:
    """Get devices for autotests run

     Create group and return serials of captured devices

    Args:
        timeout (int):
        amount (int):
        need_amount (Union[Unset, bool]):
        abi (Union[Unset, str]):
        sdk (Union[Unset, str]):
        model (Union[Unset, str]):
        type (Union[Unset, str]):
        version (Union[Unset, str]):
        run (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GroupResponse]
    """

    kwargs = _get_kwargs(
        timeout=timeout,
        amount=amount,
        need_amount=need_amount,
        abi=abi,
        sdk=sdk,
        model=model,
        type=type,
        version=version,
        run=run,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: Union[AuthenticatedClient, Client],
    timeout: int,
    amount: int,
    need_amount: Union[Unset, bool] = UNSET,
    abi: Union[Unset, str] = UNSET,
    sdk: Union[Unset, str] = UNSET,
    model: Union[Unset, str] = UNSET,
    type: Union[Unset, str] = UNSET,
    version: Union[Unset, str] = UNSET,
    run: str,
) -> Optional[GroupResponse]:
    """Get devices for autotests run

     Create group and return serials of captured devices

    Args:
        timeout (int):
        amount (int):
        need_amount (Union[Unset, bool]):
        abi (Union[Unset, str]):
        sdk (Union[Unset, str]):
        model (Union[Unset, str]):
        type (Union[Unset, str]):
        version (Union[Unset, str]):
        run (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GroupResponse
    """

    return sync_detailed(
        client=client,
        timeout=timeout,
        amount=amount,
        need_amount=need_amount,
        abi=abi,
        sdk=sdk,
        model=model,
        type=type,
        version=version,
        run=run,
    ).parsed


async def asyncio_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    timeout: int,
    amount: int,
    need_amount: Union[Unset, bool] = UNSET,
    abi: Union[Unset, str] = UNSET,
    sdk: Union[Unset, str] = UNSET,
    model: Union[Unset, str] = UNSET,
    type: Union[Unset, str] = UNSET,
    version: Union[Unset, str] = UNSET,
    run: str,
) -> Response[GroupResponse]:
    """Get devices for autotests run

     Create group and return serials of captured devices

    Args:
        timeout (int):
        amount (int):
        need_amount (Union[Unset, bool]):
        abi (Union[Unset, str]):
        sdk (Union[Unset, str]):
        model (Union[Unset, str]):
        type (Union[Unset, str]):
        version (Union[Unset, str]):
        run (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[GroupResponse]
    """

    kwargs = _get_kwargs(
        timeout=timeout,
        amount=amount,
        need_amount=need_amount,
        abi=abi,
        sdk=sdk,
        model=model,
        type=type,
        version=version,
        run=run,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: Union[AuthenticatedClient, Client],
    timeout: int,
    amount: int,
    need_amount: Union[Unset, bool] = UNSET,
    abi: Union[Unset, str] = UNSET,
    sdk: Union[Unset, str] = UNSET,
    model: Union[Unset, str] = UNSET,
    type: Union[Unset, str] = UNSET,
    version: Union[Unset, str] = UNSET,
    run: str,
) -> Optional[GroupResponse]:
    """Get devices for autotests run

     Create group and return serials of captured devices

    Args:
        timeout (int):
        amount (int):
        need_amount (Union[Unset, bool]):
        abi (Union[Unset, str]):
        sdk (Union[Unset, str]):
        model (Union[Unset, str]):
        type (Union[Unset, str]):
        version (Union[Unset, str]):
        run (str):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        GroupResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            timeout=timeout,
            amount=amount,
            need_amount=need_amount,
            abi=abi,
            sdk=sdk,
            model=model,
            type=type,
            version=version,
            run=run,
        )
    ).parsed
