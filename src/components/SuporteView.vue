<script setup>
import { ref, onMounted } from 'vue'
import { api, uploadFile } from '../services/api'

// true p/ url de imagem (mostra <img>); senão é anexo genérico (link).
const isImageUrl = (u) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(u || '')

const view = ref('list') // 'list' | 'new' | 'chat'
const tickets = ref([])
const current = ref(null)
const loading = ref(false)
const error = ref('')

const form = ref({ title: '', description: '', image: '' })
const reply = ref({ body: '', image: '' })

const STATUS_CLASS = { enviado: 'badge-warning', respondido: 'badge-success', fechado: 'badge-muted' }

const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '')

// Envia o arquivo pro servidor (grava em disco) e guarda só o caminho retornado.
const uploadInto = async (file, target) => {
  if (!file) return
  const okType = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!okType) { error.value = 'Envie uma imagem ou PDF.'; return }
  if (file.size > 8 * 1024 * 1024) { error.value = 'Arquivo muito grande (máx. 8MB).'; return }
  error.value = ''
  try {
    const r = await uploadFile(file)
    target.value.image = r.url
    target.value.imageName = r.name
  } catch (e) {
    error.value = e?.message || 'Não foi possível enviar o arquivo.'
  }
}

const loadList = async () => {
  loading.value = true
  try { tickets.value = await api.get('/tickets') } catch { error.value = 'Não foi possível carregar os tickets.' } finally { loading.value = false }
}

const openTicket = async (id) => {
  loading.value = true
  try { current.value = await api.get(`/tickets/${id}`); view.value = 'chat' } catch { error.value = 'Não foi possível abrir o ticket.' } finally { loading.value = false }
}

const startNew = () => { form.value = { title: '', description: '', image: '' }; error.value = ''; view.value = 'new' }

const createTicket = async () => {
  if (!form.value.title.trim() || !form.value.description.trim()) { error.value = 'Preencha título e descrição.'; return }
  loading.value = true
  try {
    await api.post('/tickets', { title: form.value.title, description: form.value.description, image: form.value.image || undefined })
    await loadList()
    view.value = 'list'
  } catch (e) { error.value = e?.message || 'Não foi possível abrir o ticket.' } finally { loading.value = false }
}

const sendReply = async () => {
  if (!reply.value.body.trim()) return
  loading.value = true
  try {
    current.value = await api.post(`/tickets/${current.value.id}/messages`, { body: reply.value.body, image: reply.value.image || undefined })
    reply.value = { body: '', image: '' }
  } catch (e) { error.value = e?.message || 'Não foi possível enviar a mensagem.' } finally { loading.value = false }
}

const backToList = () => { view.value = 'list'; current.value = null; loadList() }

onMounted(loadList)
</script>

<template>
  <div class="support">
    <header class="tab-header" style="margin-bottom: 20px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <h2>Suporte</h2>
        <p style="margin-bottom:0;">Abra um chamado e acompanhe as respostas do nosso time.</p>
      </div>
      <button v-if="view === 'list'" class="btn btn-secondary" @click="startNew"><i class="ph ph-plus"></i> Novo Ticket</button>
      <button v-else class="btn btn-outline" @click="backToList"><i class="ph ph-arrow-left"></i> Voltar</button>
    </header>

    <p v-if="error" class="sup-error">{{ error }}</p>

    <!-- LISTA -->
    <div v-if="view === 'list'" class="card" style="padding:0;">
      <div v-if="!tickets.length" class="sup-empty">Você ainda não abriu nenhum ticket.</div>
      <ul v-else class="sup-list">
        <li v-for="t in tickets" :key="t.id" class="sup-item" @click="openTicket(t.id)">
          <div class="sup-item-main">
            <strong>{{ t.title }}</strong>
            <span class="sup-date">Atualizado em {{ fmt(t.updatedAt) }}</span>
          </div>
          <span :class="['badge', STATUS_CLASS[t.status] || 'badge-muted']">{{ t.statusLabel }}</span>
        </li>
      </ul>
    </div>

    <!-- NOVO -->
    <div v-else-if="view === 'new'" class="card form-card">
      <div class="form-group">
        <label class="form-label">Título</label>
        <input v-model="form.title" type="text" class="form-control" maxlength="150" placeholder="Resumo do problema" />
      </div>
      <div class="form-group">
        <label class="form-label">Descrição</label>
        <textarea v-model="form.description" class="form-control" rows="5" maxlength="5000" placeholder="Descreva o que está acontecendo..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Print (opcional)</label>
        <input type="file" accept="image/*,application/pdf" class="form-control" @change="e => uploadInto(e.target.files[0], form)" />
        <img v-if="form.image && isImageUrl(form.image)" :src="form.image" class="sup-preview" alt="Print" />
        <a v-else-if="form.image" :href="form.image" target="_blank" class="sup-file-link"><i class="ph ph-paperclip"></i> {{ form.imageName || 'Ver anexo' }}</a>
      </div>
      <button class="btn btn-secondary" :disabled="loading" @click="createTicket">{{ loading ? 'Enviando...' : 'Abrir Ticket' }}</button>
    </div>

    <!-- CHAT -->
    <div v-else-if="view === 'chat' && current" class="card" style="display:flex; flex-direction:column;">
      <div class="sup-chat-head">
        <div>
          <strong>{{ current.title }}</strong>
          <span :class="['badge', STATUS_CLASS[current.status] || 'badge-muted']" style="margin-left:8px;">{{ current.statusLabel }}</span>
        </div>
      </div>
      <div class="sup-thread">
        <div v-for="m in current.messages" :key="m.id" :class="['sup-msg', m.senderRole === 'admin' ? 'from-admin' : 'from-user']">
          <div class="sup-bubble">
            <span class="sup-who">{{ m.senderRole === 'admin' ? 'Suporte' : 'Você' }}</span>
            <p v-if="m.body">{{ m.body }}</p>
            <a v-if="m.image && isImageUrl(m.image)" :href="m.image" target="_blank"><img :src="m.image" class="sup-msg-img" alt="Anexo" /></a>
            <a v-else-if="m.image" :href="m.image" target="_blank" class="sup-file-link"><i class="ph ph-paperclip"></i> Ver anexo</a>
            <span class="sup-time">{{ fmt(m.createdAt) }}</span>
          </div>
        </div>
      </div>
      <div v-if="current.status !== 'fechado'" class="sup-reply">
        <textarea v-model="reply.body" class="form-control" rows="2" placeholder="Escreva uma resposta..."></textarea>
        <div class="sup-reply-actions">
          <label class="btn btn-outline sup-attach"><i class="ph ph-paperclip"></i><span v-if="reply.image">1</span>
            <input type="file" accept="image/*,application/pdf" hidden @change="e => uploadInto(e.target.files[0], reply)" />
          </label>
          <button class="btn btn-secondary" :disabled="loading" @click="sendReply">Enviar</button>
        </div>
      </div>
      <p v-else class="sup-closed">Este ticket foi fechado.</p>
    </div>
  </div>
</template>

<style scoped>
.support { max-width: 820px; }
.sup-error { color:#ef4444; font-size:13px; margin-bottom:12px; }
.sup-empty { padding: 32px; text-align:center; color: var(--text-gray); }
.sup-list { list-style:none; margin:0; padding:0; }
.sup-item { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--border-color); cursor:pointer; transition: background .15s; }
.sup-item:hover { background: var(--bg-gray, #f4f6f8); }
.sup-item-main { display:flex; flex-direction:column; gap:2px; }
.sup-date { font-size:12px; color: var(--text-gray); }
.badge-muted { background:#e5e7eb; color:#6b7280; }
.sup-preview, .sup-msg-img { max-width: 220px; border-radius:8px; margin-top:8px; display:block; }
.sup-file-link { display:inline-flex; align-items:center; gap:6px; margin-top:8px; font-size:13px; color: var(--secondary); text-decoration:none; }
.sup-file-link:hover { text-decoration:underline; }
.sup-chat-head { padding: 4px 4px 12px; border-bottom:1px solid var(--border-color); margin-bottom:12px; }
.sup-thread { display:flex; flex-direction:column; gap:12px; max-height: 50vh; overflow-y:auto; padding: 4px; }
.sup-msg { display:flex; }
.sup-msg.from-user { justify-content:flex-end; }
.sup-bubble { max-width: 78%; padding:10px 14px; border-radius:12px; background: var(--bg-gray,#f1f5f9); }
.from-user .sup-bubble { background: var(--primary-light, #e6efff); }
.sup-who { font-size:11px; font-weight:700; color: var(--secondary); display:block; margin-bottom:2px; }
.sup-bubble p { margin:0; font-size:14px; color: var(--text-dark); white-space:pre-wrap; }
.sup-time { font-size:10px; color: var(--text-gray); display:block; margin-top:4px; text-align:right; }
.sup-reply { margin-top:12px; border-top:1px solid var(--border-color); padding-top:12px; }
.sup-reply-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; align-items:center; }
.sup-attach { display:inline-flex; align-items:center; gap:4px; cursor:pointer; }
.sup-closed { margin-top:12px; color: var(--text-gray); font-size:13px; text-align:center; }
</style>
