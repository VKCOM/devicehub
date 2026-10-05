import {readFileSync, writeFileSync} from 'node:fs'

// WDA's HTTP server respects USE_IP, but its MJPEG listener otherwise binds all
// interfaces. Apply the same setting to MJPEG before Xcode builds the runner.
// An unset USE_IP preserves the ordinary device's existing binding behavior.
const path = new URL('../node_modules/appium-webdriveragent/WebDriverAgentLib/Routing/FBTCPSocket.m', import.meta.url)
const source = readFileSync(path, 'utf8')
const oldCall = '[self.listeningSocket acceptOnPort:self.port error:error]'
const newCall = '[self.listeningSocket acceptOnInterface:FBConfiguration.bindingIPAddress port:self.port error:error]'

if (!source.includes(newCall)) {
    if (!source.includes(oldCall) || !source.includes('#import "FBTCPSocket.h"')) {
        throw new Error('WDA MJPEG implementation changed; review loopback binding before building silent iOS workers')
    }

    writeFileSync(
        path,
        source
            .replace('#import "FBTCPSocket.h"', '#import "FBTCPSocket.h"\n#import "FBConfiguration.h"')
            .replace(oldCall, newCall)
    )
}
