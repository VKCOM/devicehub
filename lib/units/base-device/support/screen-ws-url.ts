import _ from 'lodash'

export interface ScreenWsUrlOptions {
    screenWsUrlPattern: string
    publicIp: string
    screenPort: number
    serial: string
    provider: string
}

/* The URL clients open the screen WebSocket at, from the --screen-ws-url-pattern template */
export const screenWsUrl = ({screenWsUrlPattern, publicIp, screenPort, serial, provider}: ScreenWsUrlOptions): string =>
    _.template(screenWsUrlPattern)({publicIp, publicPort: screenPort, serial, provider})
