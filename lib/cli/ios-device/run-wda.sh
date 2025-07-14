#!/bin/bash
set -o pipefail

cd "$(git rev-parse --show-toplevel)" || exit


if [ -n "$1" ]; then
  deviceId=$1
else
  deviceId=$(idb list-targets | grep "device" | awk -F '|' '{ gsub(/ /, "", $0); print $2 }' | head -1)
fi

if [ -z "$deviceId" ]; then
    echo "Could not find device with empty"
    exit
fi

if [ -n "$2" ]; then
  deviceNum=$2
else
  deviceNum=0
fi
deviceName=$(idb list-targets | grep "$deviceId" | awk -F '|' '{ gsub(/ $/, "", $1); print $1 }' | head -1)

echo "Using device $deviceId ($deviceName) with number $deviceNum"  >&2

trap exit EXIT

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
  test | tee /tmp/wdalog.txt &
wdapid=$!

# source ~/Documents/pymobiledevice3/.venv/bin/activate
pymobiledevice3 usbmux forward --serial $deviceId 910$deviceNum 9100 &
mjpegpid=$!
pymobiledevice3 usbmux forward --serial $deviceId 810$deviceNum 8100 &
wdaproxypic=$!

function exit() {
  kill $wdapid
  kill $mjpegpid
  kill $wdaproxypic
  wait
}

gtail -n1 -f /tmp/wdalog.txt | grep -q "ServerURLHere" > /dev/null
# echo "Found line"

cd "$(git rev-parse --show-toplevel)" || exit
MONGODB_PORT_27017_TCP=mongodb://devicehub-mongo:27017 stf ios-device \
    --serial "$deviceId" \
    --host localhost \
    --screen-port 1800$deviceNum \
    --mjpeg-port  910$deviceNum \
    --connect-port 1820$deviceNum \
    --provider mightyworker \
    --public-ip localhost \
    --screen-ws-url-pattern "ws://localhost:1800$deviceNum" \
    --storage-url http://localhost:7100/ \
    --connect-sub tcp://127.0.0.1:7250 \
    --connect-push tcp://127.0.0.1:7270 \
    --connect-app-dealer tcp://127.0.0.1:7160 \
    --connect-dev-dealer tcp://127.0.0.1:7260 \
    --wda-host 127.0.0.1 \
    --wda-port 810$deviceNum || exit
