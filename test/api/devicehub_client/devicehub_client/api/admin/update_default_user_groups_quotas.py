from http import HTTPStatus
from typing import Any, Dict, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.user_response import UserResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    number: Union[Unset, int] = UNSET,
    duration: Union[Unset, int] = UNSET,
    repetitions: Union[Unset, int] = UNSET,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}

    params["number"] = number

    params["duration"] = duration

    params["repetitions"] = repetitions

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: Dict[str, Any] = {
        "method": "put",
        "url": "/users/groupsQuotas",
        "params": params,
    }

    return _kwargs


def _parse_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Optional[UserResponse]:
    if response.status_code == 200:
        response_200 = UserResponse.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(*, client: Union[AuthenticatedClient, Client], response: httpx.Response) -> Response[UserResponse]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    number: Union[Unset, int] = UNSET,
    duration: Union[Unset, int] = UNSET,
    repetitions: Union[Unset, int] = UNSET,
) -> Response[UserResponse]:
    """Updates the default groups quotas of users

     Updates the default groups quotas allocated to each new user

    Args:
        number (Union[Unset, int]):
        duration (Union[Unset, int]):
        repetitions (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserResponse]
    """

    kwargs = _get_kwargs(
        number=number,
        duration=duration,
        repetitions=repetitions,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: Union[AuthenticatedClient, Client],
    number: Union[Unset, int] = UNSET,
    duration: Union[Unset, int] = UNSET,
    repetitions: Union[Unset, int] = UNSET,
) -> Optional[UserResponse]:
    """Updates the default groups quotas of users

     Updates the default groups quotas allocated to each new user

    Args:
        number (Union[Unset, int]):
        duration (Union[Unset, int]):
        repetitions (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserResponse
    """

    return sync_detailed(
        client=client,
        number=number,
        duration=duration,
        repetitions=repetitions,
    ).parsed


async def asyncio_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    number: Union[Unset, int] = UNSET,
    duration: Union[Unset, int] = UNSET,
    repetitions: Union[Unset, int] = UNSET,
) -> Response[UserResponse]:
    """Updates the default groups quotas of users

     Updates the default groups quotas allocated to each new user

    Args:
        number (Union[Unset, int]):
        duration (Union[Unset, int]):
        repetitions (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[UserResponse]
    """

    kwargs = _get_kwargs(
        number=number,
        duration=duration,
        repetitions=repetitions,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: Union[AuthenticatedClient, Client],
    number: Union[Unset, int] = UNSET,
    duration: Union[Unset, int] = UNSET,
    repetitions: Union[Unset, int] = UNSET,
) -> Optional[UserResponse]:
    """Updates the default groups quotas of users

     Updates the default groups quotas allocated to each new user

    Args:
        number (Union[Unset, int]):
        duration (Union[Unset, int]):
        repetitions (Union[Unset, int]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        UserResponse
    """

    return (
        await asyncio_detailed(
            client=client,
            number=number,
            duration=duration,
            repetitions=repetitions,
        )
    ).parsed
