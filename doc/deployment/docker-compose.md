
# Docker Compose Deployment

Docker Compose is the recommended way to deploy **VK DeviceHub**, offering:

- Simplified orchestration
- Dependency management
- Automatic network setup

compared to manual `systemd` unit handling.

---

## Prerequisites

Make sure you have the following installed:

- Docker
- Docker Compose
- Environment configuration file: `scripts/variables.env`
- SSL certificates (automatically generated via the `omgwtfssl` container)

---

## Environment Configuration

All deployments read a shared environment file, `scripts/variables.env`, which is passed to Compose with `--env-file`.
Adjust the values for your installation (the file in the repository has development defaults):

```env
STF_SECRET=your_jwt_secret_here
STF_DOMAIN=your.domain.com
STF_PORT=443
AUTH_URL=auth/mock/
MONGODB_PORT_27017_TCP=mongodb://devicehub-mongo:27017
```

---

## Deployment Commands

### Start all services

```bash
docker compose -f docker-compose-prod.yaml --env-file scripts/variables.env up -d
```

### View logs

```bash
docker compose -f docker-compose-prod.yaml logs -f
```

The nginx proxy publishes ports 80 and 443. The UI is available at `https://<STF_DOMAIN>` (or `https://localhost` for a local setup).

---

## Development Deployment

The `docker-compose-dev.yaml` file provides a minimal setup for local development (only database components).

### Start development environment

```bash
docker compose -f docker-compose-dev.yaml up -d
```

This starts MongoDB (`devicehub-mongo`) in replica set mode. Run the STF units themselves with `stf local` or a local `stf` command.

---

## macOS Deployment

The `docker-compose-macos.yaml` file is tailored for macOS and includes:

- Use of `host.docker.internal` for ADB connectivity
- All services in a single Compose file
- Optimized port mappings for Docker Desktop on macOS

---

## Scaling and High Availability

Only **stateless** services can be scaled. Every service in `docker-compose-prod.yaml` sets a fixed `container_name`, and Compose does not allow `--scale` for such services. To run several replicas, remove `container_name` from the service (or copy the service under a new name with its own `container_name`) first. Then scale it as usual:

```bash
docker compose -f docker-compose-prod.yaml --env-file scripts/variables.env up -d --scale devicehub-processor=5
```

### Services that CAN be scaled (after the change above):

- `devicehub-processor` — message processing
- `devicehub-storage-plugin-apk`, `devicehub-storage-plugin-image` — storage plugins

### Services that SHOULD NOT be scaled:

- `devicehub-reaper` — single instance only
- `devicehub-api-groups-engine` — single instance only
- `devicehub-provider` — each provider publishes the fixed device port range (`12010-12100`) and must have a unique `--name`; run additional providers on separate hosts or with different port ranges
- Database and proxy services

---

> *Scale wisely: do not scale stateful services!*
