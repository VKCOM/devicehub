FROM debian:bookworm

RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bash \
      coreutils \
      busybox-static \
      ca-certificates \
      curl \
      unzip \
      git \
      wget \
      sudo \
      libgl1-mesa-glx \
      libglu1-mesa \
      openjdk-17-jdk-headless \
      mesa-utils \
      xvfb \
      pulseaudio \
      socat && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Установка переменных окружения
ENV ANDROID_HOME=/opt/android-sdk
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
ENV PATH="${PATH}:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/emulator"
ENV ANDROID_SDK_ROOT=${ANDROID_HOME}

# Установка Android SDK Command Line Tools (с правильной структурой)
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools && \
    cd ${ANDROID_HOME}/cmdline-tools && \
    wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O sdk.zip && \
    unzip sdk.zip -d temp && \
    mv temp/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest && \
    rm -rf sdk.zip temp

# SDK Manager и лицензии
RUN yes | sdkmanager --sdk_root=${ANDROID_HOME} "platform-tools" && \
    yes | sdkmanager --sdk_root=${ANDROID_HOME} --licenses

# Установка компонентов
RUN sdkmanager --sdk_root=${ANDROID_HOME} \
    "emulator" \
    "platforms;android-30" \
    "system-images;android-30;google_apis;x86_64"

# Создание AVD
RUN echo "no" | avdmanager create avd -n test_avd -k "system-images;android-30;google_apis;x86_64" --device "pixel"

# Запуск
COPY config.ini "/root/.android/avd/test_avd.avd/config.ini"

COPY start-emulator.sh /start-emulator.sh
RUN chmod +x /start-emulator.sh

EXPOSE 5554 5555

ENTRYPOINT ["/start-emulator.sh"]
