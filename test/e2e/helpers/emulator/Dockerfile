FROM debian:bullseye-slim

# Настройки среды
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=${ANDROID_SDK_ROOT}/cmdline-tools/latest/bin:${ANDROID_SDK_ROOT}/emulator:${ANDROID_SDK_ROOT}/platform-tools:$PATH

# Установка зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    wget unzip curl \
    libgl1-mesa-glx \
    libpulse0 \
    libx11-6 \
    libxrender1 \
    libxtst6 \
    libnss3 \
    pulseaudio \
    libtcmalloc-minimal4 \
    libgles2-mesa \
    redir  \
    qemu-utils \
    iproute2 \
    libxkbfile1 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Установка Android SDK
RUN mkdir -p ${ANDROID_SDK_ROOT}/cmdline-tools && \
    cd ${ANDROID_SDK_ROOT}/cmdline-tools && \
    wget https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip -O tools.zip && \
    unzip tools.zip && rm tools.zip && \
    mv cmdline-tools latest

# Установка компонентов SDK и эмулятора
RUN yes | sdkmanager --licenses
RUN sdkmanager \
    "platform-tools" \
    "emulator" \
    "platforms;android-30" \
    "system-images;android-30;google_apis;x86_64"

# Создание и настройка AVD
RUN echo "no" | avdmanager create avd -n test_avd -k "system-images;android-30;google_apis;x86_64" --device "pixel"

# Стартовая команда (запуск headless-эмулятора)
CMD ["emulator", "-avd", "test_avd", "-no-snapshot", "-no-audio", "-no-window", "-no-accel"]
