
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

All deployments use a centralized `.env` file.  
Create `scripts/variables.env` with the following variables:

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
docker-compose -f docker-compose-prod.yaml up -d
```

### View logs

```bash
docker-compose -f docker-compose-prod.yaml logs -f
```

### Scale specific service

```bash
docker-compose -f docker-compose-prod.yaml up -d --scale devicehub-processor001=3
```

---

## Development Deployment

The `docker-compose-dev.yaml` file provides a minimal setup for local development (only database components).

### Start development environment

```bash
docker-compose -f docker-compose-dev.yaml up -d
```

---

## macOS Deployment

The `docker-compose-macos.yaml` file is tailored for macOS and includes:

- Use of `host.docker.internal` for ADB connectivity
- All services in a single Compose file
- Optimized port mappings for Docker Desktop on macOS

---

## Scaling and High Availability

Docker Compose supports horizontal scaling of **stateless** services.

### Scale processors

```bash
docker-compose up -d --scale devicehub-processor001=5
```

### Scale storage plugins

```bash
docker-compose up -d --scale devicehub-storage-plugin-apk=3
```

---

### Services that CAN be scaled:

- `devicehub-processor001` — message processing
- `devicehub-storage-plugin-*` — storage plugins
- `devicehub-provider` — device providers (with different names)

### Services that SHOULD NOT be scaled:

- `devicehub-reaper` — single instance only
- `devicehub-api-groups-engine` — single instance only
- Database and proxy services

---

> *Scale wisely: do not scale stateful services!*
