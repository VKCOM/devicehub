import { io } from 'socket.io-client'
import { backOff } from 'exponential-backoff'

import { variablesConfig } from '@/config/variables.config'
import { authStore } from '@/store/auth-store'

export const socket = io(variablesConfig[import.meta.env.MODE].websocketUrl, {
  autoConnect: false,
  reconnection: false,
  transports: ['websocket'],
  auth: (cb) => {
    cb({ token: authStore.jwt })
  },
})

let reconnecting: Promise<void> | null = null

function connectSocket(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.connected) {
      resolve()

      return
    }

    const onConnect = () => {
      socket.off('connect_error', onError)
      resolve()
    }

    const onError = (err: Error) => {
      socket.off('connect', onConnect)
      reject(err)
    }

    socket.once('connect', onConnect)
    socket.once('connect_error', onError)
    socket.connect()
  })
}

export function connectWithBackoff(): Promise<void> {
  if (reconnecting) return reconnecting

  reconnecting = backOff(() => connectSocket(), {
    numOfAttempts: 10,
    startingDelay: 1000,
    maxDelay: 30000,
    jitter: 'full',
  })
    .catch((err) => {
      console.error('Socket.IO: all reconnection attempts exhausted', err)
    })
    .finally(() => {
      reconnecting = null
    })

  return reconnecting
}

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') return

  connectWithBackoff()
})
