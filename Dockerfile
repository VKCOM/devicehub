FROM ubuntu:20.04

ENV PATH=/app/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive \
    NODEJS_REL=v17.9.0 \
    BUNDLETOOL_REL=1.8.2

WORKDIR /app

RUN useradd --system \
      --create-home \
      --shell /usr/sbin/nologin \
      stf-build && \
    apt-get update && \
    apt-get upgrade -yq && \
    apt-get -y install wget python3 build-essential ca-certificates libzmq3-dev libprotobuf-dev git graphicsmagick openjdk-8-jdk yasm curl nano iputils-ping && \
    apt-get clean && \
    rm -rf /var/cache/apt/* /var/lib/apt/lists/*

RUN cd /tmp && \
    wget --progress=dot:mega \
      https://nodejs.org/dist/v17.9.0/node-v17.9.0-linux-x64.tar.xz && \
    tar -xJf node-v*.tar.xz --strip-components 1 -C /usr/local && \
    rm node-v*.tar.xz && \
    su stf-build -s /bin/bash -c '/usr/local/lib/node_modules/npm/node_modules/node-gyp/bin/node-gyp.js install' && \
    mkdir /tmp/bundletool && \
    cd /tmp/bundletool && \
    wget --progress=dot:mega \
      https://github.com/google/bundletool/releases/download/${BUNDLETOOL_REL}/bundletool-all-${BUNDLETOOL_REL}.jar && \
    mv bundletool-all-${BUNDLETOOL_REL}.jar bundletool.jar

# Sneak the stf executable into $PATH.
ENV PATH=/app/bin:$PATH \
    DEBIAN_FRONTEND=noninteractive

EXPOSE 3000

RUN   useradd --system \
      --create-home \
      --shell /usr/sbin/nologin \
      stf

COPY . /tmp/build/

RUN mkdir -p /app && \
    chown -R stf-build:stf-build /tmp/build /tmp/bundletool /app

USER stf-build

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
    find /tmp -mindepth 1 ! -regex '^/tmp/hsperfdata_root\(/.*\)?' -delete

USER stf

CMD stf --help
