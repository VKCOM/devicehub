import {describe, expect, it} from 'vitest'
import {screenWsUrl} from '../../../../lib/units/base-device/support/screen-ws-url.ts'

describe('screen WebSocket URL', () => {
    const options = {provider: 'vk-android-1', serial: '10.0.0.5:5555', publicIp: 'devicehub.test', screenPort: 7400}

    // A reverse proxy routes the screen of a device by its provider
    it('fills in the provider and the serial', () => {
        expect(screenWsUrl({...options, screenWsUrlPattern: 'wss://devicehub.test/d/<%= provider %>/<%= serial %>'}))
            .toBe('wss://devicehub.test/d/vk-android-1/10.0.0.5:5555')
    })

    it('fills in the public address by default', () => {
        expect(screenWsUrl({...options, screenWsUrlPattern: 'ws://${publicIp}:${publicPort}'}))
            .toBe('ws://devicehub.test:7400')
    })
})
