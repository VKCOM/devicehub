import { io } from 'socket.io-client'

import { variablesConfig } from '@/config/variables.config'
import { authStore } from '@/store/auth-store'

export const socket = io(variablesConfig[import.meta.env.MODE].websocketUrl, {
  autoConnect: false,
  reconnectionAttempts: 3,
  reconnection: true,
  transports: ['websocket'],
  auth: (cb) => {
    cb({ token: authStore.jwt })
  },
})
