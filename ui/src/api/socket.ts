import { io } from 'socket.io-client'

import config from '@/config/variables-config.json'

export const socket = io(config[import.meta.env.MODE as keyof typeof config].websocketUrl, {
  autoConnect: true,
  reconnectionAttempts: 3,
  reconnection: true,
  transports: ['websocket'],
})
