// The scrcpy server DeviceHub runs. The server refuses a client whose version
// differs, so the version is also the first argument it is started with.
// The checksum is the one Homebrew pins for the same release.
export const SCRCPY_VERSION = '5.0.1'
export const SCRCPY_SERVER_SHA256 = '764eb6f79811d5211fe9df341120882ba9994c7a61b897d7bf3fb662e53bc536'
export const SCRCPY_SERVER_URL =
    `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/scrcpy-server-v${SCRCPY_VERSION}`
// Relative to the project root
export const SCRCPY_SERVER_PATH = `vendor/scrcpy/scrcpy-server-v${SCRCPY_VERSION}`
