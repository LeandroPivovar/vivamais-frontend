import { io } from 'socket.io-client'
import { getToken } from './api'
import { IS_NATIVE_APP, SITE_ORIGIN } from './nativeApp'

let socket = null

/** Conexão socket.io (mesma origem; nginx faz proxy de /socket.io/). Autentica pelo JWT. */
export function getSocket() {
  const token = getToken()
  if (!socket) {
    // No app a página não está no domínio do site: conecta direto nele.
    socket = io(IS_NATIVE_APP ? SITE_ORIGIN : undefined, {
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
