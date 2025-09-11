import syrup from '@devicefarmer/stf-syrup'
import sdb from './sdb/index.js'
import router from '../../base-device/support/router.js'
import wire from '../../../wire/index.js'
import wireutil from '../../../wire/util.js'
import push from '../../base-device/support/push.js'
import {exec} from 'child_process'

export default syrup.serial()
    .dependency(push)
    .dependency(router)
    .dependency(sdb)
    .define((options, push, router, sdb) => {
        const identity = {
            collect: async() => {
                const display = await sdb.shell('cat /sys/class/graphics/fb0/virtual_size') || '0,0'
                const [width, height] = display.split(',').map(Number)

                Object.assign(identity, {
                    width, height,
                    status: await sdb.getDeviceStatus(),
                    OSVersion: await sdb.shell("cat /etc/tizen-release | grep VERSION | awk -F'= ' '{print $2}'") || '',
                    MACAddress: await new Promise(resolve => {
                        exec(
                            `arp -a | grep ${options.host} | awk '{for(i=1;i<=NF;i++) if($i=="at") print $(i+1)}'`,
                            (err, stdout, stderr) =>
                                resolve(err || stderr || !stdout ? '' : stdout.trim())
                        )
                    })
                })

                router.on(wire.ProbeMessage, () => {
                    push.send([
                        wireutil.global,
                        wireutil.envelope(new wire.DeviceIdentityMessage(
                            options.serial,
                            'Tizen', // platform
                            '', // manufacturer
                            '', // operator
                            '', // model
                            identity.OSVersion,
                            '', // abi
                            '', // sdk
                            new wire.DeviceDisplayMessage({
                                id: 0,
                                width,
                                height,
                                rotation: 0,
                                xdpi: 0.0,
                                ydpi: 0.0,
                                fps: 0.0,
                                density: 0.0,
                                secure: false,
                                url: ''
                            }),
                            new wire.DevicePhoneMessage({}),
                            '', // product
                            '', // cpuPlatform
                            '', // openGLESVersion
                            '', // marketName
                            identity.MACAddress,
                            '' // ram
                        ))
                    ])
                })
            }
        }
        return identity
    })
