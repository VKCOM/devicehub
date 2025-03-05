# Adding an iOS device to DeviceHub

Use ios-provider unit to add a provider that will track and manage port forwarding to the device.

Also see [lib/cli/ios-device/run-wda.sh](../lib/cli/ios-device/run-wda.sh) on how to run a single device.
This script is designed to set up and run WebDriverAgent on an iOS device using `idb` and `pymobiledevice3`. It also sets up port forwarding that is needed for the ios-device.

## Requirements

-   Installed `git`
-   Installed `idb`
-   Installed `xcodebuild`
-   Installed the `stf` command from this repository (clone this repository and do `npm ci` followed by `npm link`)
-   Access to MongoDB which used by stf
    Note: You need to create you own provisioning profile in XCode for the [WebDriverAgent project](../WebDriverAgent)

## Usage

First start [WebDriverAgent](./../WebDriverAgent/)
Then run

```bash
stf ios-provider \
    --connect-sub tcp://127.0.0.1:7114 \
    --connect-push tcp://127.0.0.1:7116 \
    --connect-app-dealer tcp://127.0.0.1:7112 \
    --connect-dev-dealer tcp://127.0.0.1:7115 \
    --screen-ws-url-pattern 'ws://localhost:<%= publicPort %>' \
    --public-ip localhost \
    --provider localworker \
    --storage-url http://localhost:7100/
```

## Determine the device name:

The device name is determined using idb list-targets.

## Port forwarding:

A [fork](https://github.com/irdkwmnsb/node-usbmux) of node-usbmux is used to forward ports 9100 and 8100 from the device to the local machine.
