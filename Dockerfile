# ---------- Stage 1: Build ----------
FROM node:20.18.0-bullseye-slim AS build

LABEL org.opencontainers.image.source=https://github.com/VKCOM/devicehub
LABEL org.opencontainers.image.title=DeviceHub
LABEL org.opencontainers.image.vendor=VKCOM
LABEL org.opencontainers.image.description="Control and manage Android and iOS devices from your browser."
LABEL org.opencontainers.image.licenses=Apache-2.0

ENV PATH=/app/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive \
    BUNDLETOOL_REL=1.8.2 \
    NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app

# Create build user and install build dependencies
RUN useradd --system --create-home --shell /usr/sbin/nologin stf-build && \
    apt-get update && \
    apt-get upgrade -yq && \
    apt-get install -yq \
      htop wget python3 build-essential ca-certificates \
      libzmq3-dev libprotobuf-dev git graphicsmagick \
      openjdk-11-jdk yasm curl nano iputils-ping && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Download bundletool
RUN mkdir -p /tmp/bundletool && \
    wget -q -O /tmp/bundletool/bundletool.jar \
    https://github.com/google/bundletool/releases/download/${BUNDLETOOL_REL}/bundletool-all-${BUNDLETOOL_REL}.jar

# Copy application source code
COPY . /tmp/build/

# Set permissions
RUN chown -R stf-build:stf-build /tmp/build /tmp/bundletool /app

# Build application
USER stf-build

RUN set -x && \
    cd /tmp/build && \
    export PATH=$PWD/node_modules/.bin:$PATH && \
    npm ci --python="/usr/bin/python3" --loglevel http && \
    npm pack && \
    tar xzf vk-devicehub-*.tgz --strip-components 1 -C /app && \
    npm prune --production && \
    mv node_modules /app && \
    mkdir /app/bundletool && \
    mv /tmp/bundletool/* /app/bundletool && \
    ln -s /app/bin/stf.mjs /app/bin/stf && \
    cd /app/ui && \
    npm ci && \
    npx tsc -b && \
    npx vite build && \
    rm -rf /tmp/build

# ---------- Stage 2: Runtime ----------
FROM node:20.18.0-bullseye-slim

ENV PATH=/app/bin:$PATH \
    NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app
EXPOSE 3000

# Create runtime user
RUN useradd --system --create-home --shell /usr/sbin/nologin stf

# Copy build artifacts from build stage
COPY --from=build /app /app

USER stf

# Show help by default
CMD ["stf", "--help"]
