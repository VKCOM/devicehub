FROM node:20.18.0-bullseye-slim

ENV PATH=/app/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive \
    BUNDLETOOL_REL=1.8.2

WORKDIR /app
EXPOSE 3000

RUN useradd --system \
      --create-home \
      --shell /usr/sbin/nologin \
      stf-build && \
    apt-get update && \
    apt-get upgrade -yq && \
    apt-get -y install wget python3 build-essential ca-certificates libzmq3-dev libprotobuf-dev git graphicsmagick openjdk-11-jdk yasm curl nano iputils-ping && \
    apt-get clean && \
    rm -rf /var/cache/apt/* /var/lib/apt/lists/*

RUN cd /tmp && \
    su stf-build -s /bin/bash -c '/usr/local/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js install' && \
    mkdir /tmp/bundletool && \
    cd /tmp/bundletool && \
    wget --progress=dot:mega \
          https://github.com/google/bundletool/releases/download/${BUNDLETOOL_REL}/bundletool-all-${BUNDLETOOL_REL}.jar && \
        mv bundletool-all-${BUNDLETOOL_REL}.jar bundletool.jar


RUN   useradd --system \
      --create-home \
      --shell /usr/sbin/nologin \
      stf

# Copy app source.
COPY . /tmp/build/

# Give permissions to our build user.
RUN mkdir -p /app && \
    chown -R stf-build:stf-build /tmp/build /tmp/bundletool /app

# Switch over to the build user.
USER stf-build

# Run the build.
RUN set -x && \
    cd /tmp/build && \
    export PATH=$PWD/node_modules/.bin:$PATH && \
    npm ci --python="/usr/bin/python3"  --loglevel http && \
    npm pack && \
    tar xzf vk-devicehub-*.tgz --strip-components 1 -C /app && \
    npm prune --production && \
    mv node_modules /app && \
    rm -rf ~/.node-gyp && \
    mkdir /app/bundletool && \
    mv /tmp/bundletool/* /app/bundletool && \
    cd /app && \
    find /tmp -mindepth 1 ! -regex '^/tmp/hsperfdata_root\(/.*\)?' -delete && \
    ln -s /app/bin/stf.mjs /app/bin/stf &&\
    cd ui && \
    npm ci && \
    npx tsc -b && \
    npx vite build --mode staging

# Switch to the app user.
USER stf

# Show help by default.
CMD stf --help
