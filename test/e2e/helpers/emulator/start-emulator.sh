#!/bin/bash

# Запуск виртуального X-сервера (нужен для рендеринга)
#Xvfb :0 -screen 0 1280x800x16 &
#export DISPLAY=:0
adb devices
# Запуск эмулятора без KVM
emulator -avd test_avd -no-accel -no-audio -no-window -gpu swiftshader_indirect -verbose
