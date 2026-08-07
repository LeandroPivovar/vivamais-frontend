import { io } from 'socket.io-client'
import { getToken } from './api'

let socket = null

/** Conexão socket.io (mesma origem; nginx faz proxy de /socket.io/). Autentica pelo JWT. */
export function getSocket() {
  const token = getToken()
  if (!socket) {
    socket = io({
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    })
  } else {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
