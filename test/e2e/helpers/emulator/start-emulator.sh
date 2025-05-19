#!/bin/bash

export ANDROID_SDK_ROOT=/opt/android-sdk
export ANDROID_HOME=/opt/android-sdk
export ANDROID_AVD_HOME=/tmp/avd
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools

echo "===> Cleaning up old AVD image files..."
rm -f /tmp/avd/test_avd.avd/*.img

echo "===> Starting emulator..."
$ANDROID_HOME/emulator/emulator -avd test_avd \
  -no-audio -no-window -gpu swiftshader_indirect \
  -partition-size 2048 -verbose -sdcard 512M &

adb wait-for-device
adb shell getprop sys.boot_completed
echo "✅ Emulator booted and ready."
