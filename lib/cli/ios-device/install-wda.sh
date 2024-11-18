#!/bin/bash
set -o pipefail

cd "$(git rev-parse --show-toplevel)" || exit


if [ -n "$1" ]; then
  deviceId=$1
else
  deviceId=$(idb list-targets | grep "device" | awk -F '|' '{ gsub(/ /, "", $0); print $2 }' | head -1)
fi

if [ -n "$2" ]; then
  deviceNum=$2
else
  deviceNum=0
fi
deviceName=$(idb list-targets | grep "$deviceId" | awk -F '|' '{ gsub(/ $/, "", $1); print $1 }' | head -1)
echo "Using device $deviceId ($deviceName) with nmber $deviceNum"  >&2
pushd WebDriverAgent || exit
xcodebuild \
  -project WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -destination "id=$deviceId" \
  -allowProvisioningUpdates \
  build || exit

xcodebuild \
  -project WebDriverAgent.xcodeproj \
  -scheme WebDriverAgentRunner \
  -destination "id=$deviceId" \
  -allowProvisioningUpdates \
  test
