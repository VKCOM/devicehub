FROM debian:bookworm-slim

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}
ENV ANDROID_AVD_HOME=/tmp/avd
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator"

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    bash coreutils unzip wget curl ca-certificates \
    libgl1-mesa-glx libglu1-mesa openjdk-17-jdk-headless \
    mesa-utils pulseaudio socat locales && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    cd ${ANDROID_HOME}/cmdline-tools && \
    wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O sdk.zip && \
    unzip sdk.zip -d temp && mv temp/cmdline-tools latest && rm -rf sdk.zip temp

RUN yes | sdkmanager --sdk_root=${ANDROID_HOME} --licenses && \
    sdkmanager --sdk_root=${ANDROID_HOME} \
        "platform-tools" "emulator" \
        "platforms;android-30" \
        "system-images;android-30;default;x86_64"

# Создание AVD в RAM-диске
RUN mkdir -p /tmp/avd && \
    ANDROID_AVD_HOME=/tmp/avd \
    avdmanager create avd -n test_avd \
    -k "system-images;android-30;default;x86_64" \
    --device "pixel" && \
    sed -i '/^disk.dataPartition.size/d' /tmp/avd/test_avd.avd/config.ini && \
    echo "disk.dataPartition.size=2048M" >> /tmp/avd/test_avd.avd/config.ini && \
    echo "tag.id=default" >> /tmp/avd/test_avd.avd/config.ini && \
    echo "tag.display=Default" >> /tmp/avd/test_avd.avd/config.ini

# Очистка всего лишнего после создания AVD
RUN rm -rf ${ANDROID_HOME}/cmdline-tools/latest/lib \
           ${ANDROID_HOME}/cmdline-tools/latest/source.properties \
           ${ANDROID_HOME}/cmdline-tools/latest/NOTICE.txt \
           ${ANDROID_HOME}/cmdline-tools/latest/README.md && \
    rm -rf /root/.android \
           ${ANDROID_HOME}/system-images/*/google_apis \
           ${ANDROID_HOME}/platforms/* \
           ${ANDROID_HOME}/temp \
           /tmp/*.zip /tmp/temp \
           /var/lib/apt/lists/* \

COPY start-emulator.sh /start-emulator.sh
RUN chmod +x /start-emulator.sh

EXPOSE 5554 5555

ENTRYPOINT ["/start-emulator.sh"]
