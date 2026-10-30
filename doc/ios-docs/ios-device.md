# Adding an iOS device to DeviceHub

Use ios-provider unit to add a provider that will track and manage port forwarding to the device.

For an example of running a single iOS device worker by hand, see [lib/cli/ios-device/start-ios.sh](../../lib/cli/ios-device/start-ios.sh). It starts `stf ios-device` with the device serial, WebDriverAgent port and ZeroMQ endpoints.

## Requirements

-   Installed `git`
-   Installed `idb`
-   Installed `xcodebuild`
-   Installed the `stf` command from this repository (clone this repository and do `npm ci` followed by `npm link`)
-   Access to MongoDB which used by stf
    Note: You need to create your own provisioning profile in Xcode for the WebDriverAgent project. Run `npm run setup-wda` to open it from `node_modules/appium-webdriveragent`.

## Usage

First start [WebDriverAgent](./../WebDriverAgent/)
Then run

```bash
stf ios-provider \
    --connect-sub tcp://127.0.0.1:7114 \
    --connect-push tcp://127.0.0.1:7116 \
    --screen-ws-url-pattern 'ws://localhost:<%= publicPort %>' \
    --public-ip localhost \
    --provider localworker \
    --storage-url http://localhost:7100/
```
Also you can use ESP32 Implementation described in [this document](esp32.md)

## Determine the device name:

The device name is determined using idb list-targets.

## Port forwarding:

A [fork](https://github.com/irdkwmnsb/node-usbmux) of node-usbmux is used to forward ports 9100 and 8100 from the device to the local machine.
