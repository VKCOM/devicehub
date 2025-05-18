#!/bin/bash

export ANDROID_SDK_ROOT=/opt/android-sdk
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools
export EMULATOR_ROOT="${ANDROID_HOME}/emulator"

echo "===> Cleaning up old userdata and cache images"
rm -f /root/.android/avd/test_avd.avd/userdata-qemu.img
rm -f /root/.android/avd/test_avd.avd/userdata.img
rm -f /root/.android/avd/test_avd.avd/cache.img

# Запуск виртуального X-сервера (нужен для рендеринга)
#Xvfb :0 -screen 0 1280x800x16 &
#export DISPLAY=:0
adb devices
# Запуск эмулятора без KVM
${EMULATOR_ROOT}/emulator -avd test_avd -no-accel -no-audio -no-window -gpu swiftshader_indirect -verbose -partition-size 2048 &

adb wait-for-device
