import net from 'net'

export async function isTcpPortOpen(host: string, port: string, timeout = 2000): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = new net.Socket()
        let isConnected = false

        socket.setTimeout(timeout)

        socket.on('connect', () => {
            isConnected = true
            socket.destroy()
        })

        socket.on('timeout', () => {
            socket.destroy()
        })

        socket.on('error', () => {
            // suppress errors
        })

        socket.on('close', () => {
            resolve(isConnected)
        })

        socket.connect(port, host)
    })
}
