<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../services/api'
import { getSocket } from '../services/socket'

const messages = ref([])
const conversationId = ref(null)
const input = ref('')
const connected = ref(false)
const thread = ref(null)
let socket = null

const scrollDown = async () => {
  await nextTick()
  if (thread.value) thread.value.scrollTop = thread.value.scrollHeight
}

const onMessage = (payload) => {
  if (payload?.conversationId !== conversationId.value) return
  messages.value.push(payload.message)
  scrollDown()
}

// Suporte encerrou a conversa: mostra aviso (o chat some em ~1min).
const onClosed = () => {
  messages.value.push({ id: 'sys-' + Date.now(), senderRole: 'system', body: 'Conversa encerrada pelo suporte. Se precisar, escreva de novo para iniciar um novo atendimento.' })
  scrollDown()
}
// Conversa apagada após 1min → zera o chat do usuário.
const onPurged = () => { messages.value = [] }
// Usuário escreveu após o encerramento → começou um chat novo (zerado).
const onReset = (payload) => {
  messages.value = []
  if (payload?.conversationId) conversationId.value = payload.conversationId
}

const send = () => {
  const body = input.value.trim()
  if (!body || !socket) return
  socket.emit('chat:send', { body })
  input.value = ''
}

onMounted(async () => {
  try {
    const data = await api.get('/chat')
    conversationId.value = data.conversation.id
    messages.value = data.messages
    await api.post('/chat/read').catch(() => {})
    scrollDown()
  } catch { /* segue mesmo sem histórico */ }

  socket = getSocket()
  connected.value = socket.connected
  socket.on('connect', () => { connected.value = true; socket.emit('chat:read', {}) })
  socket.on('disconnect', () => { connected.value = false })
  socket.on('chat:message', onMessage)
  socket.on('chat:closed', onClosed)
  socket.on('chat:purged', onPurged)
  socket.on('chat:reset', onReset)
})

onUnmounted(() => {
  if (socket) {
    socket.off('chat:message', onMessage)
    socket.off('chat:closed', onClosed)
    socket.off('chat:purged', onPurged)
    socket.off('chat:reset', onReset)
  }
})
</script>

<template>
  <div class="chat">
    <header class="tab-header" style="margin-bottom:16px;">
      <h2>Chat ao vivo <span :class="['dot', connected ? 'on' : 'off']"></span></h2>
      <p style="margin-bottom:0;">Fale com nosso time em tempo real.</p>
    </header>

    <div class="card chat-box">
      <div ref="thread" class="chat-thread">
        <p v-if="!messages.length" class="chat-empty">Envie uma mensagem para começar a conversa.</p>
        <template v-for="m in messages" :key="m.id">
          <div v-if="m.senderRole === 'system'" class="c-sys">{{ m.body }}</div>
          <div v-else :class="['c-msg', m.senderRole === 'admin' ? 'from-admin' : 'from-user']">
            <div class="c-bubble">
              <span class="c-who">{{ m.senderRole === 'admin' ? 'Suporte' : 'Você' }}</span>
              <p>{{ m.body }}</p>
            </div>
          </div>
        </template>
      </div>
      <div class="chat-input">
        <input v-model="input" type="text" class="form-control" placeholder="Escreva sua mensagem..." @keyup.enter="send" />
        <button class="btn btn-secondary" @click="send"><i class="ph ph-paper-plane-tilt"></i></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat { max-width: 720px; }
.dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-left:6px; vertical-align:middle; }
.dot.on { background:#16a34a; } .dot.off { background:#cbd5e1; }
.chat-box { display:flex; flex-direction:column; height: 62vh; padding:0; overflow:hidden; }
.chat-thread { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:10px; }
.chat-empty { color:var(--text-gray); text-align:center; margin:auto; }
.c-msg { display:flex; } .c-msg.from-user { justify-content:flex-end; }
.c-bubble { max-width:76%; padding:9px 13px; border-radius:12px; background:var(--bg-gray,#f1f5f9); }
.from-user .c-bubble { background:var(--primary-light,#e6efff); }
.c-who { font-size:11px; font-weight:700; color:var(--secondary); display:block; margin-bottom:2px; }
.c-bubble p { margin:0; font-size:14px; color:var(--text-dark); white-space:pre-wrap; }
.chat-input { display:flex; gap:8px; padding:12px; border-top:1px solid var(--border-color); }
.chat-input input { flex:1; }
.c-sys { align-self:center; background:#fef3c7; color:#92400e; font-size:12px; padding:6px 12px; border-radius:10px; text-align:center; max-width:90%; }
</style>
