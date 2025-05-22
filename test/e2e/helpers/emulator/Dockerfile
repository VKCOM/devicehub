FROM debian:bullseye-slim

ENV ANDROID_HOME "/opt/sdk"
ENV ANDROID_SDK_ROOT "/opt/sdk"
ENV PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools
ENV CONSOLE_PORT 10000
ENV ADB_PORT 10001
ENV EMULATOR_CONFIG "/root/.android/avd/x86_64.avd/config.ini"

ARG EMULATOR_RAM=14336
ARG EMULATOR_CORES_NUMBER=6
ARG CLI_TOOLS_VERSION=11076708
ARG ANDROID_SDK=android-30
ARG IMAGE_TYPE=default

ENV EMULATOR_TYPE ${IMAGE_TYPE}

# Install required dependencies
RUN apt-get update && apt-get -y dist-upgrade && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    telnet openjdk-17-jdk bash git unzip wget redir qemu-utils procps iproute2 \
    libx11-dev libpulse-dev libnss3 libxcomposite-dev libxcursor-dev libxi-dev \
    libxtst-dev uuid-dev libgl-dev libasound-dev libxcb1-dev lldb strace && \
    apt-get -y autoremove && apt-get clean autoclean && \
    rm -rf /var/lib/apt/lists/*

# Download and extract Android Tools
# New versions https://developer.android.com/studio#command-tools
RUN wget https://dl.google.com/android/repository/commandlinetools-linux-${CLI_TOOLS_VERSION}_latest.zip -O /tmp/tools.zip && \
    mkdir -p ${ANDROID_HOME} && \
    unzip -qq /tmp/tools.zip -d ${ANDROID_HOME} && \
    rm -v /tmp/tools.zip

# Install SDK Packages
RUN mkdir -p ~/.android/ && touch ~/.android/repositories.cfg && \
    yes | ${ANDROID_HOME}/cmdline-tools/bin/sdkmanager --sdk_root=${ANDROID_HOME} --licenses && \
    ${ANDROID_HOME}/cmdline-tools/bin/sdkmanager --sdk_root=${ANDROID_HOME} --update && \
    ${ANDROID_HOME}/cmdline-tools/bin/sdkmanager --sdk_root=${ANDROID_HOME} emulator "system-images;${ANDROID_SDK};${IMAGE_TYPE};x86_64" platform-tools "platforms;${ANDROID_SDK}"

    # Compress downloaded system.img
RUN echo "Converting system.img to qcow2" && \
    qemu-img convert -O qcow2 -c ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/system.img ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/system.qcow2 && \
    mv ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/system.qcow2 ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/system.img && \
    # Compress downloaded userdata.img
    echo "Converting userdata.img to qcow2" && \
    qemu-img convert -O qcow2 -c ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/userdata.img ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/userdata.qcow2 && \
    mv ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/userdata.qcow2 ${ANDROID_HOME}/system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/userdata.img


RUN echo | ${ANDROID_HOME}/cmdline-tools/bin/avdmanager create avd --name "x86_64"  --package "system-images;${ANDROID_SDK};${IMAGE_TYPE};x86_64" --tag ${IMAGE_TYPE}

COPY start.sh /opt/sdk/start-emulator.sh

COPY config.ini ${EMULATOR_CONFIG}

RUN echo image.sysdir.1=system-images/${ANDROID_SDK}/${IMAGE_TYPE}/x86_64/ >> ${EMULATOR_CONFIG} && \
    echo hw.cpu.ncore=${EMULATOR_CORES_NUMBER} >> ${EMULATOR_CONFIG} &&  \
    echo hw.ramSize=${EMULATOR_RAM} >> ${EMULATOR_CONFIG} &&\
    sed -i 's:image.sysdir.1=sdk/:image.sysdir.1=:g' "/root/.android/avd/x86_64.avd/config.ini" && \
    groupadd kvm && useradd -d /home/app -G kvm -m -r app && \
    chmod +x /opt/sdk/start.sh && \
    find "${HOME}/.android/avd" -name *lock -exec rm {} \;


CMD /opt/sdk/start-emulator.sh