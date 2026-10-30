# devicehub_client
A client library for accessing DeviceHub

## Usage
First, create a client. `base_url` is the API root, including the `/api/v1` prefix:

```python
from devicehub_client import Client

client = Client(base_url="https://devicehub.example.com/api/v1")
```

If the endpoints you're going to hit require authentication, use `AuthenticatedClient` instead:

```python
from devicehub_client import AuthenticatedClient

client = AuthenticatedClient(base_url="https://devicehub.example.com/api/v1", token="SuperSecretToken")
```

Now call an endpoint. For example, capture two devices for a test run (the `autotests` tag):

```python
from devicehub_client.api.autotests import capture_devices

with client as client:
    # sync_detailed also returns the status code; parsed is set on success
    response = capture_devices.sync_detailed(client=client, timeout=600, amount=2, run="my-test-run")
    print(response.status_code, response.parsed)
```

Or do the same thing with an async version:

```python
from devicehub_client.api.autotests import capture_devices

async with client as client:
    response = await capture_devices.asyncio_detailed(client=client, timeout=600, amount=2, run="my-test-run")
```

By default, when you're calling an HTTPS API it will attempt to verify that SSL is working correctly. Using certificate verification is highly recommended most of the time, but sometimes you may need to authenticate to a server (especially an internal server) using a custom certificate bundle.

```python
client = AuthenticatedClient(
    base_url="https://internal_api.example.com/api/v1",
    token="SuperSecretToken",
    verify_ssl="/path/to/certificate_bundle.pem",
)
```

You can also disable certificate validation altogether, but beware that **this is a security risk**.

```python
client = AuthenticatedClient(
    base_url="https://internal_api.example.com/api/v1",
    token="SuperSecretToken",
    verify_ssl=False
)
```

Things to know:
1. Every path/method combo becomes a Python module with four functions:
    1. `sync`: Blocking request that returns parsed data (if successful) or `None`
    1. `sync_detailed`: Blocking request that always returns a `Request`, optionally with `parsed` set if the request was successful.
    1. `asyncio`: Like `sync` but async instead of blocking
    1. `asyncio_detailed`: Like `sync_detailed` but async instead of blocking

1. All path/query params, and bodies become method arguments.
1. If your endpoint had any tags on it, the first tag will be used as a module name for the function (`autotests` above)
1. Any endpoint which did not have a tag will be in `devicehub_client.api.default`

## Advanced customizations

There are more settings on the generated `Client` class which let you control more runtime behavior, check out the docstring on that class for more info. You can also customize the underlying `httpx.Client` or `httpx.AsyncClient` (depending on your use-case):

```python
from devicehub_client import Client

def log_request(request):
    print(f"Request event hook: {request.method} {request.url} - Waiting for response")

def log_response(response):
    request = response.request
    print(f"Response event hook: {request.method} {request.url} - Status {response.status_code}")

client = Client(
    base_url="https://devicehub.example.com/api/v1",
    httpx_args={"event_hooks": {"request": [log_request], "response": [log_response]}},
)

# Or get the underlying httpx client to modify directly with client.get_httpx_client() or client.get_async_httpx_client()
```

You can even set the httpx client directly, but beware that this will override any existing settings (e.g., base_url):

```python
import httpx
from devicehub_client import Client

client = Client(
    base_url="https://devicehub.example.com/api/v1",
)
# Note that base_url needs to be re-set, as would any shared cookies, headers, etc.
client.set_httpx_client(httpx.Client(base_url="https://devicehub.example.com/api/v1", proxies="http://localhost:8030"))
```

## Building / publishing this package
This project uses [Poetry](https://python-poetry.org/) to manage dependencies  and packaging.  Here are the basics:
1. Update the metadata in pyproject.toml (e.g. authors, version)
1. If you're using a private repository, configure it with Poetry
    1. `poetry config repositories.<your-repository-name> <url-to-your-repository>`
    1. `poetry config http-basic.<your-repository-name> <username> <password>`
1. Publish the client with `poetry publish --build -r <your-repository-name>` or, if for public PyPI, just `poetry publish --build`

If you want to install this client into another project without publishing it (e.g. for development) then:
1. If that project **is using Poetry**, you can simply do `poetry add <path-to-this-client>` from that project
1. If that project is not using Poetry:
    1. Build a wheel with `poetry build -f wheel`
    1. Install that wheel from the other project `pip install <path-to-wheel>`
