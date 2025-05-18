FROM debian:bookworm-slim

ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator"
ENV ANDROID_AVD_HOME=/tmp/avd

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash coreutils unzip wget curl ca-certificates \
    libgl1-mesa-glx libglu1-mesa openjdk-17-jdk-headless \
    mesa-utils xvfb pulseaudio socat locales && \
    sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && \
    locale-gen && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    cd ${ANDROID_HOME}/cmdline-tools && \
    wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O sdk.zip && \
    unzip sdk.zip -d temp && mv temp/cmdline-tools latest && rm -rf sdk.zip temp

RUN yes | sdkmanager --sdk_root=${ANDROID_HOME} --licenses && \
    sdkmanager --sdk_root=${ANDROID_HOME} \
        "platform-tools" "emulator" \
        "platforms;android-30" \
        "system-images;android-30;default;x86_64"

RUN mkdir -p /tmp/avd && \
    echo "no" | avdmanager create avd -n test_avd \
    -k "system-images;android-30;default;x86_64" \
    --device "pixel" && \
    sed -i '/^disk.dataPartition.size/d' /tmp/avd/avd/test_avd.avd/config.ini && \
    echo "disk.dataPartition.size=2048M" >> /tmp/avd/avd/test_avd.avd/config.ini && \
    echo "tag.id=default" >> /tmp/avd/avd/test_avd.avd/config.ini && \
    echo "tag.display=Default" >> /tmp/avd/avd/test_avd.avd/config.ini

COPY start-emulator.sh /start-emulator.sh
RUN chmod +x /start-emulator.sh

EXPOSE 5554 5555
ENTRYPOINT ["/start-emulator.sh"]
