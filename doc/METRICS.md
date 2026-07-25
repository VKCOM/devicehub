# Metrics

DeviceHub exposes the counters of the whole platform through the `GET /api/v1/metrics` operation of
the [API](API.md), using the [Prometheus text exposition format][exposition-format].

The operation is a privileged one: it is tagged `admin` in the API specification and the controller
checks the privilege of the caller as well, so it is reserved to administrator users. This is
required because the returned counters cover all the devices, users and groups whatever the group
they belong to, which a simple user is not allowed to see.

The counters are computed when the endpoint is scraped, not on a timer, so the returned values are
always those of the very moment the Prometheus server asked for them, and no extra unit or
background job has to run.

## Exposed metrics

| Metric | Type | Labels | Description |
| ------ | ---- | ------ | ----------- |
| `devicehub_devices_total` | gauge | | Number of devices known to DeviceHub, whether they are present or not |
| `devicehub_devices_by_state` | gauge | `state` | Number of devices per aggregate device state |
| `devicehub_devices_available` | gauge | | Number of devices in the `available` state |
| `devicehub_devices_busy` | gauge | | Number of devices in the `busy` state |
| `devicehub_providers_total` | gauge | | Number of distinct providers serving at least one present device |
| `devicehub_users_total` | gauge | | Number of users known to DeviceHub |
| `devicehub_users_by_privilege` | gauge | `privilege` | Number of users per privilege (`root`, `admin`, `user`) |
| `devicehub_groups_total` | gauge | | Number of groups known to DeviceHub |
| `devicehub_groups_active` | gauge | | Number of groups which are currently active |
| `devicehub_groups_by_state` | gauge | `state` | Number of groups per group state (`pending`, `ready`, `waiting`) |
| `devicehub_groups_by_class` | gauge | `class` | Number of groups per group class (`once`, `bookable`, `standard`, `hourly`, ...) |

The `app="devicehub"` label is added to every metric, and the standard `process_*` and `nodejs_*`
metrics of the API process are exposed as well.

The `state` label of `devicehub_devices_by_state` holds the aggregate device state, computed with the
same state machine the device table uses in `ui/src/lib/utils/get-device-state.util.ts`, with the
branches that depend on who is looking at the device dropped:

| State | Meaning |
| ----- | ------- |
| `absent` | The device is not plugged to any provider |
| `offline` | The device is present but reported offline |
| `unauthorized` | The device is present but not authorized |
| `preparing` | The device is online but not ready yet |
| `available` | The device is ready and owned by nobody, or an Apple device in the `PREPARING` status |
| `busy` | The device is ready and owned by a user |
| `unhealthy` | The device reports the `UNHEALTHY` status |
| `present` | The device is present and in none of the states above |

The `using` and `automation` states of the device table are not exposed since they are relative to
the user looking at the device, which has no meaning for a scraper. For the same reason the
`isDeviceUsable` correction the device table applies to a device held by somebody else is not
applied here: a ready device with an owner is counted as `busy`.

Every label value is known in advance, so a counter which drops to zero is exported as zero instead
of vanishing, and a document holding an unexpected value can't create new time series.

## Scraping the endpoint

The operation uses the same authentication as the rest of the API, so the Prometheus server needs an
access token belonging to an administrator user. Generate one from the UI, in *Settings* > *Keys* >
*Access Tokens*, while logged in as an administrator.

```yaml
scrape_configs:
  - job_name: devicehub
    metrics_path: /api/v1/metrics
    scheme: http
    authorization:
      type: Bearer
      credentials: <DEVICEHUB_ADMIN_ACCESS_TOKEN>
    static_configs:
      - targets: ['devicehub.example.org:7100']
```

Errors are reported the way the rest of the API reports them, as a JSON body: `401` when the token
is missing or invalid, `403` when the token belongs to a simple user, and `500` when the counters
can't be read from the database. Only the successful response uses the Prometheus text format, since
that is what the format is specified for.

## Setting up a minimal test environment

Start DeviceHub as usual, for instance with
[docker-compose-dev.yaml](../docker-compose-dev.yaml), then add a Prometheus server and a Grafana
instance next to it:

```yaml
services:
  prometheus:
    image: prom/prometheus:v3.1.0
    ports:
      - "9090:9090"
    volumes:
      - "./prometheus.yml:/etc/prometheus/prometheus.yml"

  grafana:
    image: grafana/grafana:11.5.1
    ports:
      - "3000:3000"
    environment:
      - GF_AUTH_ANONYMOUS_ENABLED=true
      - GF_AUTH_ANONYMOUS_ORG_ROLE=Admin
```

With a `prometheus.yml` holding the scrape configuration above and a `15s` scrape interval:

```yaml
global:
  scrape_interval: 15s
```

Check that the endpoint answers, then that Prometheus scrapes it:

```bash
curl -H "Authorization: Bearer $DEVICEHUB_ADMIN_ACCESS_TOKEN" \
  http://localhost:7100/api/v1/metrics
```

```
# HELP devicehub_devices_total Number of devices known to DeviceHub, whether they are present or not
# TYPE devicehub_devices_total gauge
devicehub_devices_total{app="devicehub"} 5
# HELP devicehub_devices_by_state Number of devices per aggregate device state
# TYPE devicehub_devices_by_state gauge
devicehub_devices_by_state{state="absent",app="devicehub"} 1
devicehub_devices_by_state{state="available",app="devicehub"} 2
devicehub_devices_by_state{state="busy",app="devicehub"} 1
devicehub_devices_by_state{state="unhealthy",app="devicehub"} 1
...
```

The target then shows up as `UP` on http://localhost:9090/targets, and Grafana can be pointed at
`http://prometheus:9090` to graph the series, for example the share of devices in use:

```
sum(devicehub_devices_busy) / sum(devicehub_devices_total)
```

[exposition-format]: <https://prometheus.io/docs/instrumenting/exposition_formats/#text-based-format>
