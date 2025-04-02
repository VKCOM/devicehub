import HID from 'node-hid'

const sleep = (/** @type {number | undefined} */ time) => {
    return new Promise((resolve) => setInterval(resolve, time))
}

const main = async() => {
    const devices = await HID.devicesAsync()
    // console.log(devices)
    const chinesePCB = devices.find((device) => device.vendorId === 29197)
    console.log(chinesePCB)
    if (!chinesePCB || !chinesePCB.path) {
        return
    }
    const device = await HID.HIDAsync.open(chinesePCB.path)
    console.log(device)

    device.on('data', console.log)
    device.on('error', console.error)

    // Step 0 - Initialize?
    // We get back a5 b1 52 9a 0b 92 bd 00 01 00 00 00 00 00 00 00
    await device.write([0xa5, 0xa5, 0xa5, 0x00, 0x00, 0x00, 0x00, 0x00])

    await sleep(200)

    // Step 1 - Initialize 2?
    // We get back a6 75 56 ad 0b 92 bd a3 fa 00 00 00 00 00 00 00
    await device.write([0xa3, 0xa3, 0xa3, 0x00, 0x00, 0x00, 0x00, 0x00])

    for (let i = 0; i < 3; i++) {
        await sleep(10)
        await device.write([0xa1, 0x00, 0x81, 0x81, 0x00, 0x00, 0x00, 0x00]) // Moves it up and left
    }

    for (let i = 0; i < 3; i++) {
        await sleep(10)
        await device.write([0xa1, 0x00, 0x81, 0x81, 0x00, 0x00, 0x00, 0x00]) // Moves it up and left
    }

    for(;;) {
        // await device.write([0xa1, 0x00, 0x81, 0x81, 0x00, 0x00, 0x00, 0x00]) // Moves it up and left
        // await device.write([0xa1, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]) // Moves it down slightly
        // await device.write([0xa1, 0x00, 0x81, 0x00, 0x00, 0x00, 0x00, 0x00]) // Moves it left
        // await device.write([0xa1, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]) // doesn't work

        await device.write([0xa1, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]) // Moves it down
        await sleep(80)
        await device.write([0xa1, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]) // Moves it right
        await sleep(80)
        await device.write([0xa1, 0x00, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00]) // Moves it up
        await sleep(80)
        await device.write([0xa1, 0x00, 0xf8, 0x00, 0x00, 0x00, 0x00, 0x00]) // Moves it left
        await sleep(80)

        // await device.write([0xa1, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // Mouse down
        // await device.write([0xa1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]) // Mouse up

        // Home button (0.04 interval)
        // home
        // a200000000000000
        // a2002b0000000000
        // a200000000000000
        // a2002b0000000000
        // a2080b0000000000
        // a200000000000000

        // back
        // a200000000000000
        // a2002b0000000000
        // a200000000000000
        // a2002b0000000000
        // a2002b0500000000
        // a200000000000000

        // Lock
        // a200000000000000
        // a2002b0000000000
        // a200000000000000
        // a2002b0000000000
        // a2002b0f00000000
        // a200000000000000
    }
}

main()
