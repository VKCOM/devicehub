FROM node:20.18.0-bullseye-slim

LABEL org.opencontainers.image.source=https://github.com/VKCOM/devicehub
LABEL org.opencontainers.image.title=DeviceHub
LABEL org.opencontainers.image.vendor=VKCOM
LABEL org.opencontainers.image.description="Control and manage Android and iOS devices from your browser."
LABEL org.opencontainers.image.licenses=Apache-2.0

ENV PATH=/app/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive

ENV NODE_OPTIONS="--max-old-space-size=8192"

WORKDIR /app
EXPOSE 3000

# Установка зависимостей и создание пользователя для сборки
RUN useradd --system --create-home --shell /usr/sbin/nologin devicehub-user && \
    apt-get update && \
    apt-get upgrade -yq && \
    apt-get install -y \
        htop \
        wget \
        python3 \
        build-essential \
        ca-certificates \
        libzmq3-dev \
        libprotobuf-dev \
        git \
        graphicsmagick \
        openjdk-11-jdk \
        yasm \
        curl \
        nano \
        iputils-ping && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Копируем исходники
COPY . /tmp/build/

RUN set -x && \
    cd /tmp/build && \
    export PATH=$PWD/node_modules/.bin:$PATH && \
    npm ci --python="/usr/bin/python3" --loglevel http && \
    npm link && \
    cp -r . /app && \
    cd /app && \
    npm prune --production && \
    ln -s /app/bin/stf.mjs /app/bin/stf && \
    ln -s /app/bin/stf.mjs /app/bin/devicehub && \
    cd ui && \
    npm ci && \
    npx tsc -b && \
    npx vite build && \
    cd / && \
    find /tmp -mindepth 1 ! -regex '^/tmp/hsperfdata_root\(/.*\)?' -delete

# Финальный пользователь
USER devicehub-user

# Показываем справку по умолчанию
CMD ["stf", "--help"]
