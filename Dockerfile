# -------- BUILDER --------
FROM --platform=linux/amd64 node:20.19.0-bullseye-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY . .

RUN npm ci --python="/usr/bin/python3" --loglevel http && \
    npm prune --production

# -------- RUNTIME --------
FROM --platform=linux/amd64 node:20.19.0-bullseye-slim

LABEL org.opencontainers.image.source=https://github.com/VKCOM/devicehub
LABEL org.opencontainers.image.title=DeviceHub
LABEL org.opencontainers.image.vendor=VKCOM
LABEL org.opencontainers.image.description="Control and manage Android and iOS devices from your browser."
LABEL org.opencontainers.image.licenses=Apache-2.0

ENV PATH=/app/.build/bin:$PATH
ENV NODE_OPTIONS="--max-old-space-size=32768"

EXPOSE 3000
WORKDIR /app

RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --create-home --shell /usr/sbin/nologin devicehub-user

COPY --from=builder /app .
RUN rm -rf ./ui
COPY --from=builder /app/ui/dist ./ui/dist

RUN ln -s /app/.build/bin/stf.mjs /app/.build/bin/stf && \
    ln -s /app/.build/bin/stf.mjs /app/.build/bin/devicehub && \
    ln -s /app/.build/bin/stf.mjs /app/.build/bin/dh

USER devicehub-user

CMD ["devicehub", "--help"]
