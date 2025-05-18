#!/bin/bash

export ANDROID_SDK_ROOT=/opt/android-sdk
export ANDROID_HOME=/opt/android-sdk
export ANDROID_AVD_HOME=/tmp/avd
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator:$ANDROID_SDK_ROOT/platform-tools

echo "===> Cleaning up old AVD image files..."
rm -f /tmp/avd/avd/test_avd.avd/*.img

#echo "===> Starting Xvfb..."
#Xvfb :0 -screen 0 1280x800x16 &
#export DISPLAY=:0
#sleep 2

echo "===> Starting emulator..."
${ANDROID_HOME}/emulator/emulator -avd test_avd \
  -no-audio -no-window -gpu swiftshader_indirect \
  -partition-size 2048 -verbose &

adb wait-for-device
adb shell getprop sys.boot_completed
echo "✅ Emulator booted (inside /tmp/avd)"
