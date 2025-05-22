#!/bin/bash

export ANDROID_SDK_ROOT=/opt/sdk
export ANDROID_HOME=/opt/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools

echo "Launching emulator..."
emulator -avd test_avd \
  -no-accel -no-window -no-audio -gpu swiftshader_indirect \
  -partition-size 2048 -verbose &

EMULATOR_PID=$!

adb wait-for-device
adb shell getprop sys.boot_completed
echo "Emulator booted"
wait ${EMULATOR_PID}