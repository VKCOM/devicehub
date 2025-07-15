
# Using the DeviceHub API to Run Automated Tests

DeviceHub provides a dedicated API for automated testing, allowing you to capture devices for test runs and release them once the tests are complete.

## Key API Endpoints for Automation

### 1. Capture Devices for Testing

Use the `/autotests/captureDevices` endpoint to allocate a group of devices for an automated test run.

**Request parameters:**
- `amount` – number of devices to capture (required)
- `timeout` – timeout in seconds (required, max 3 hours)
- `run` – test run identifier (required)
- `need_amount` – strictly enforce the requested device count

**Device filters:**
- `abi` – CPU architecture
- `model` – device model
- `type` – device type
- `sdk` – Android SDK level
- `version` – Android version

### 2. Release Devices

Use the `/autotests/freeDevices` endpoint to release the devices after the test run is complete.

## Python Client Usage Example

### Capturing a Device Group

```python
from devicehub_client.api.autotests import capture_devices

response = capture_devices.sync_detailed(
    client=api_client,
    timeout=600,
    amount=2,
    need_amount=True,
    abi='armeabi-v7a',
    run='Test-run-example',
    sdk=UNSET,
    model=UNSET,
    type=UNSET,
    version=UNSET
)
```

### Parsing the Response

On success, you'll receive an `AutoTestResponse` object with the following fields:

- `success` – operation status
- `description` – operation details
- `group` – the device group object
- `group.id` – ID of the allocated group
- `group.devices` – list of captured devices

For Android, the key field is `remoteConnectUrl`, which contains the ADB connect URL for remote debugging.
Also for iOS this field contains Appium WDA connect Url

### Releasing Devices

```python
from devicehub_client.api.autotests import free_devices

response = free_devices.sync_detailed(
    client=api_client,
    group=autotests_group_id
)
```

## Client Generation from Swagger Schema

DeviceHub uses OpenAPI/Swagger for its API documentation. The Swagger spec is available at `/api/v1/swagger.json`.

### Auto-Generating a Client

You can generate a client in any supported language using Swagger Codegen:

```bash
# Python
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l python -o ./devicehub-client

# Java
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l java -o ./devicehub-client

# JavaScript
swagger-codegen generate -i https://your-devicehub.com/api/v1/swagger.json -l javascript -o ./devicehub-client
```

### Using the Prebuilt Python Client

The repo already includes a Python client:

```python
from devicehub_client import AuthenticatedClient

client = AuthenticatedClient(
    base_url="https://your-devicehub.com",
    token="your-access-token"
)
```

## Authentication

An access token is required to use the API. You can generate one from the DeviceHub UI under Settings → Keys. Pass the token in the `Authorization` header:

```bash
curl -H "Authorization: Bearer YOUR-TOKEN-HERE" https://devicehub.example.com/api/v1/autotests/captureDevices
```

## Limitations

The autotest system in DeviceHub is built on top of the standard device group infrastructure but provides a simplified API tailored for CI/CD pipelines. Regular users are limited to 2 devices per test run.
