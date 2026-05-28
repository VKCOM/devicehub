import syrup from '@devicefarmer/stf-syrup'

import devutil, {type DevUtil, type Identity} from '../../../../util/devutil.js'
import logger from '../../../../util/logger.js'
import display, {type Display, type DisplayProperties} from './display.js'
import phone from './phone.js'

export interface PhoneIdentity {
    imei?: string
    imsi?: string
    phoneNumber?: string
    iccid?: string
    network?: string
    [key: string]: string | undefined
}

export interface FullIdentity extends Identity {
    display: DisplayProperties
    phone: PhoneIdentity
    module?: string
}

interface IdentityOptions {
    deviceName?: string
    [key: string]: unknown
}

export default syrup.serial()
    .dependency(display)
    .dependency(phone)
    .dependency(devutil)
    .define(function(
        options: IdentityOptions,
        display: Display,
        phone: PhoneIdentity,
        devutil: DevUtil
    ): Promise<FullIdentity> {
        const log = logger.createLogger('device:plugins:identity')

        async function solve(): Promise<FullIdentity> {
            log.info('Solving identity')
            const baseIdentity = await devutil.makeIdentity()
            const identity: FullIdentity = {
                ...baseIdentity,
                display: display.properties,
                phone,
            }
            if (options.deviceName) {
                identity.module = options.deviceName
            }
            return identity
        }

        return solve()
    })
