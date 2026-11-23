// Notificações nativas do app Android (Firebase Cloud Messaging via Capacitor).
// No site/PWA tudo aqui é no-op. O backend manda: Pagamento Aprovado, Renovação
// Confirmada, Renovação Pendente e Comissão Confirmada (com `tab` para abrir a aba certa).
import { PushNotifications } from '@capacitor/push-notifications'
import { LocalNotifications } from '@capacitor/local-notifications'
import { api } from './api'
import { IS_NATIVE_APP, APP_MODULE } from './nativeApp'

// Os 3 apps (Viva Mais, Kids e Teens) estão no Firebase. O servidor guarda qual app
// é cada celular para o admin poder mandar novidades só para o Kids ou só para o Teens.
const PUSH_ENABLED = IS_NATIVE_APP
const PUSH_APP = APP_MODULE === 'kids' ? 'kids' : APP_MODULE === 'teen' ? 'teens' : 'vivamais'

const CHANNEL_ID = 'default'
let listenersReady = false
let currentToken = null
let localId = 1

/**
 * Pede permissão e registra o celular para a conta logada. Chamar depois do login
 * e ao abrir o app já logado. `onOpenTab(tab)` é chamado quando o usuário toca na notificação.
 */
export async function initPush(onOpenTab) {
  if (!PUSH_ENABLED) return
  try {
    if (!listenersReady) {
      listenersReady = true
      await PushNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Avisos da conta',
        description: APP_MODULE ? 'Novidades do app' : 'Pagamentos, renovações e comissões',
        importance: 4,
        visibility: 1,
      })
      PushNotifications.addListener('registration', ({ value }) => {
        currentToken = value
        api.post('/push/devices', { token: value, platform: 'android', app: PUSH_APP }).catch(() => {})
      })
      PushNotifications.addListener('registrationError', () => {})
      // Com o app aberto o Android não mostra a notificação sozinho: mostramos como local.
      PushNotifications.addListener('pushNotificationReceived', (n) => {
        LocalNotifications.schedule({
          notifications: [{
            id: localId++,
            title: n.title || 'Viva Mais',
            body: n.body || '',
            channelId: CHANNEL_ID,
            smallIcon: 'ic_stat_notify',
            extra: n.data || {},
          }],
        }).catch(() => {})
      })
      PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        if (notification?.data?.tab) onOpenTab?.(notification.data.tab)
      })
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        if (notification?.extra?.tab) onOpenTab?.(notification.extra.tab)
      })
    }
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return
    await PushNotifications.register()
  } catch {
    // notificação nunca pode travar o login
  }
}

/** Logout: este celular para de receber as notificações da conta. Chamar antes de limpar o token. */
export async function unregisterPush() {
  if (!PUSH_ENABLED || !currentToken) return
  try {
    await api.delete('/push/devices', { token: currentToken })
  } catch { /* segue o logout */ }
}
