import { io } from 'socket.io-client'

import { variablesConfig } from '@/config/variables-config'

export const socket = io(variablesConfig[import.meta.env.MODE].websocketUrl, {
  autoConnect: true,
  reconnectionAttempts: 3,
  reconnection: true,
  transports: ['websocket'],
})
