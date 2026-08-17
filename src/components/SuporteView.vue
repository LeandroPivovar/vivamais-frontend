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
  try { 
    const res = await api.get('/tickets')
    tickets.value = res || []
  } catch (err) { 
    tickets.value = []
    error.value = 'Não foi possível carregar os chamados.'
  } finally { 
    loading.value = false 
  }
}

const openTicket = async (id) => {
  loading.value = true
  try { 
    const res = await api.get(`/tickets/${id}`)
    current.value = res
    view.value = 'chat' 
  } catch (err) { 
    error.value = 'Não foi possível abrir o chamado.'
  } finally { 
    loading.value = false 
  }
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

const openWhatsApp = () => {
  window.open('https://wa.me/5511987064847?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20no%20Viva%20Mais%20Club.', '_blank')
}

const openLiveChat = () => {
  // Dispara abertura do chat ao vivo ou vai para novo chamado
  const chatFab = document.querySelector('.chat-fab')
  if (chatFab) {
    chatFab.click()
  } else {
    window.location.pathname = '/chat'
  }
}

onMounted(loadList)
</script>

<template>
  <div class="support">
    <header class="tab-header" style="margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
      <div>
        <h2>Central de Suporte</h2>
        <p style="margin-bottom:0;">Escolha o melhor canal para falar com nossa equipe ou acompanhe seus chamados.</p>
      </div>
      <button v-if="view !== 'list'" class="btn btn-outline" @click="backToList"><i class="ph ph-arrow-left"></i> Voltar aos Chamados</button>
    </header>

    <p v-if="error" class="sup-error">{{ error }}</p>

    <!-- LISTA & CANAIS DE ATENDIMENTO -->
    <div v-if="view === 'list'">
      <!-- 2 CARDS DE ATENDIMENTO: WHATSAPP & CHAT AO VIVO -->
      <div class="support-channels-grid">
        <!-- Card 1: WhatsApp -->
        <div class="support-channel-card whatsapp-channel">
          <div class="channel-header">
            <div class="channel-icon-box whatsapp-box">
              <i class="ph ph-whatsapp-logo"></i>
            </div>
            <div class="channel-status-badge whatsapp-badge">
              <span class="pulse-dot green"></span>
              SAC / Vendas
            </div>
          </div>
          <div class="channel-body">
            <h3>WhatsApp Oficial</h3>
            <p>Atendimento direto para suporte, dúvidas e vendas: <strong>(11) 98706-4847</strong></p>
          </div>
          <button class="btn btn-whatsapp-channel" @click="openWhatsApp">
            <i class="ph ph-whatsapp-logo"></i>
            <span>(11) 98706-4847</span>
          </button>
        </div>

        <!-- Card 2: Chat ao Vivo -->
        <div class="support-channel-card livechat-channel">
          <div class="channel-header">
            <div class="channel-icon-box livechat-box">
              <i class="ph ph-chat-circle-dots"></i>
            </div>
            <div class="channel-status-badge livechat-badge">
              <span class="pulse-dot blue"></span>
              Online no Sistema
            </div>
          </div>
          <div class="channel-body">
            <h3>Chat ao Vivo</h3>
            <p>Converse em tempo real com nossa equipe de suporte através do chat integrado na plataforma.</p>
          </div>
          <button class="btn btn-livechat-channel" @click="openLiveChat">
            <i class="ph ph-chat-circle-dots"></i>
            <span>Abrir Chat ao Vivo</span>
          </button>
        </div>
      </div>

      <!-- SEÇÃO DE TICKETS / CHAMADOS -->
      <div class="tickets-section-header">
        <div>
          <h3>Chamados & Tickets</h3>
          <p>Histórico de solicitações registradas por você</p>
        </div>
        <button class="btn btn-secondary" @click="startNew"><i class="ph ph-plus"></i> Novo Ticket</button>
      </div>

      <div class="card" style="padding:0; overflow:hidden; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
        <div v-if="!tickets.length" class="sup-empty">
          <i class="ph ph-ticket" style="font-size: 40px; color: var(--text-gray); display:block; margin-bottom: 8px;"></i>
          <strong>Nenhum ticket aberto no momento</strong>
          <p style="margin: 4px 0 16px; font-size: 13px; color: var(--text-gray);">Se precisar de ajuda detalhada, clique no botão acima para abrir um novo chamado.</p>
          <button class="btn btn-outline" @click="startNew"><i class="ph ph-plus"></i> Abrir Primeiro Ticket</button>
        </div>
        <ul v-else class="sup-list">
          <li v-for="t in tickets" :key="t.id" class="sup-item" @click="openTicket(t.id)">
            <div class="sup-item-main">
              <strong>{{ t.title }}</strong>
              <span class="sup-date">Atualizado em {{ fmt(t.updatedAt) }}</span>
            </div>
            <span :class="['status-badge-ref', t.status === 'respondido' ? 'ativo' : t.status === 'enviado' ? 'pendente' : 'inativo']">
              {{ t.statusLabel }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- NOVO -->
    <div v-else-if="view === 'new'" class="card form-card" style="box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
      <h3 style="margin-bottom: 16px; color: var(--secondary);">Abrir Novo Chamado</h3>
      <div class="form-group">
        <label class="form-label">Título do Chamado</label>
        <input v-model="form.title" type="text" class="form-control" maxlength="150" placeholder="Ex: Dúvida sobre ativação do benefício" />
      </div>
      <div class="form-group">
        <label class="form-label">Descrição detalhada</label>
        <textarea v-model="form.description" class="form-control" rows="5" maxlength="5000" placeholder="Descreva o que está acontecendo com o máximo de detalhes..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Anexo / Print (opcional)</label>
        <input type="file" accept="image/*,application/pdf" class="form-control" @change="e => uploadInto(e.target.files[0], form)" />
        <img v-if="form.image && isImageUrl(form.image)" :src="form.image" class="sup-preview" alt="Print" />
        <a v-else-if="form.image" :href="form.image" target="_blank" class="sup-file-link"><i class="ph ph-paperclip"></i> {{ form.imageName || 'Ver anexo' }}</a>
      </div>
      <div style="display:flex; gap:12px; margin-top:20px;">
        <button class="btn btn-secondary" :disabled="loading" @click="createTicket">{{ loading ? 'Enviando...' : 'Enviar Chamado' }}</button>
        <button class="btn btn-outline" @click="backToList">Cancelar</button>
      </div>
    </div>

    <!-- CHAT -->
    <div v-else-if="view === 'chat' && current" class="card" style="display:flex; flex-direction:column; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);">
      <div class="sup-chat-head">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="font-size: 16px; color: var(--secondary);">{{ current.title }}</strong>
          <span :class="['status-badge-ref', current.status === 'respondido' ? 'ativo' : current.status === 'enviado' ? 'pendente' : 'inativo']">
            {{ current.statusLabel }}
          </span>
        </div>
      </div>
      <div class="sup-thread">
        <div v-for="m in current.messages" :key="m.id" :class="['sup-msg', m.senderRole === 'admin' ? 'from-admin' : 'from-user']">
          <div class="sup-bubble">
            <span class="sup-who">{{ m.senderRole === 'admin' ? 'Suporte Viva Mais' : 'Você' }}</span>
            <p v-if="m.body">{{ m.body }}</p>
            <a v-if="m.image && isImageUrl(m.image)" :href="m.image" target="_blank"><img :src="m.image" class="sup-msg-img" alt="Anexo" /></a>
            <a v-else-if="m.image" :href="m.image" target="_blank" class="sup-file-link"><i class="ph ph-paperclip"></i> Ver anexo</a>
            <span class="sup-time">{{ fmt(m.createdAt) }}</span>
          </div>
        </div>
      </div>
      <div v-if="current.status !== 'fechado'" class="sup-reply">
        <textarea v-model="reply.body" class="form-control" rows="2" placeholder="Escreva uma resposta para o suporte..."></textarea>
        <div class="sup-reply-actions">
          <label class="btn btn-outline sup-attach"><i class="ph ph-paperclip"></i><span v-if="reply.image">1</span>
            <input type="file" accept="image/*,application/pdf" hidden @change="e => uploadInto(e.target.files[0], reply)" />
          </label>
          <button class="btn btn-secondary" :disabled="loading" @click="sendReply">Enviar Mensagem</button>
        </div>
      </div>
      <p v-else class="sup-closed">Este ticket foi concluído e fechado.</p>
    </div>
  </div>
</template>

<style scoped>
.support { max-width: 960px; margin: 0 auto; }

/* 2 Cards de Canais de Suporte */
.support-channels-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.support-channel-card {
  padding: 24px;
  border-radius: var(--radius-md, 12px);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.support-channel-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md, 0 4px 20px rgba(0,0,0,0.08));
}

.whatsapp-channel {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
}

.livechat-channel {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.channel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.channel-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}
.whatsapp-box {
  background: #dcfce7;
  color: #16a34a;
  border: 1px solid #86efac;
}
.livechat-box {
  background: #dbeafe;
  color: #2563eb;
  border: 1px solid #93c5fd;
}

.channel-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
}
.whatsapp-badge {
  background: #dcfce7;
  color: #15803d;
}
.livechat-badge {
  background: #dbeafe;
  color: #1e40af;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.pulse-dot.green {
  background: #16a34a;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.25);
}
.pulse-dot.blue {
  background: #2563eb;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.channel-body h3 {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-dark);
  margin-bottom: 6px;
}
.channel-body p {
  font-size: 13px;
  color: #64748b;
  margin: 0;
  line-height: 1.45;
}

.btn-whatsapp-channel {
  background: #16a34a;
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: var(--radius-sm, 8px);
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.15s;
  text-decoration: none;
}
.btn-whatsapp-channel:hover {
  background: #15803d;
}

.btn-livechat-channel {
  background: #0284c7;
  color: #fff;
  border: none;
  padding: 10px 16px;
  border-radius: var(--radius-sm, 8px);
  font-weight: 600;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-livechat-channel:hover {
  background: #0369a1;
}

/* Seção de Tickets */
.tickets-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
.tickets-section-header h3 {
  font-size: 18px;
  color: var(--secondary);
  margin: 0;
}
.tickets-section-header p {
  font-size: 13px;
  color: var(--text-gray);
  margin: 2px 0 0;
}

.sup-error { color:#ef4444; font-size:13px; margin-bottom:12px; }
.sup-empty { padding: 40px 24px; text-align:center; color: var(--text-gray); }
.sup-list { list-style:none; margin:0; padding:0; }
.sup-item { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:16px 20px; border-bottom:1px solid var(--border-color); cursor:pointer; transition: background .15s; }
.sup-item:last-child { border-bottom: none; }
.sup-item:hover { background: #f8fafc; }
.sup-item-main { display:flex; flex-direction:column; gap:3px; }
.sup-item-main strong { font-size: 14px; color: var(--text-dark); }
.sup-date { font-size:12px; color: var(--text-gray); }

.badge-muted { background:#e5e7eb; color:#6b7280; }
.sup-preview, .sup-msg-img { max-width: 220px; border-radius:8px; margin-top:8px; display:block; }
.sup-file-link { display:inline-flex; align-items:center; gap:6px; margin-top:8px; font-size:13px; color: var(--secondary); text-decoration:none; }
.sup-file-link:hover { text-decoration:underline; }
.sup-chat-head { padding: 8px 8px 14px; border-bottom:1px solid var(--border-color); margin-bottom:14px; }
.sup-thread { display:flex; flex-direction:column; gap:12px; max-height: 50vh; overflow-y:auto; padding: 6px; }
.sup-msg { display:flex; }
.sup-msg.from-user { justify-content:flex-end; }
.sup-bubble { max-width: 78%; padding:10px 14px; border-radius:12px; background: var(--bg-gray,#f1f5f9); }
.from-user .sup-bubble { background: #eff6ff; border: 1px solid #dbeafe; }
.sup-who { font-size:11px; font-weight:700; color: var(--secondary); display:block; margin-bottom:2px; }
.sup-bubble p { margin:0; font-size:14px; color: var(--text-dark); white-space:pre-wrap; }
.sup-time { font-size:10px; color: var(--text-gray); display:block; margin-top:4px; text-align:right; }
.sup-reply { margin-top:14px; border-top:1px solid var(--border-color); padding-top:14px; }
.sup-reply-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:8px; align-items:center; }
.sup-attach { display:inline-flex; align-items:center; gap:4px; cursor:pointer; }
.sup-closed { margin-top:12px; color: var(--text-gray); font-size:13px; text-align:center; }
</style>
