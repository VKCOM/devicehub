/*
 * Stand-in for a forked device worker. It speaks the worker side of the
 * provider IPC: the 'ready' handshake and 'device-state' reports. Tests make it
 * report by sending it the 'device-state' message it has to forward.
 */
// FAKE_WORKER_CRASH: dies on startup, like a worker whose device is unusable
if (process.env.FAKE_WORKER_CRASH) {
    process.exit(1)
}

// FAKE_WORKER_NO_READY: stays in startup forever, like a worker preparing a slow device
if (!process.env.FAKE_WORKER_NO_READY) {
    process.send('ready')
}

process.on('message', message => {
    if (message?.type === 'device-state') {
        process.send(message)
    }
    // Dies like a worker hitting a fatal error, or giving up gracefully with code 0
    if (message?.type === 'crash') {
        process.exit(message.code ?? 1)
    }
})

// Like a real worker, shut down on SIGTERM only after cleaning up, which takes a while
const exitDelayMs = Number(process.env.FAKE_WORKER_EXIT_DELAY_MS || 0)
process.on('SIGTERM', () => setTimeout(() => process.exit(0), exitDelayMs))

// The provider is gone: nobody will ever stop us
process.on('disconnect', () => process.exit(0))

setInterval(() => {}, 1 << 30)
