<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { api, lookupCep, uploadFile } from '../services/api'
import { getSocket } from '../services/socket'
import TeenAdminView from './teen/TeenAdminView.vue'

const props = defineProps({
  layoutMode: {
    type: String,
    default: 'desktop'
  }
})

const emit = defineEmits(['triggerDevModal'])

// Aba ativa do Admin: 'usuarios', 'financeiro', 'tickets' ou 'chat'
const activeAdminTab = ref('usuarios')

// Dados vêm da API — banco é a única fonte de verdade
const users = ref([])
const config = ref({
  planBronzePrice: 0,
  planBronzeMmn: 0,
  planIndividualPrice: 0,
  planIndividualMmn: 0,
  planFamilyPrice: 0,
  planFamilyMmn: 0,
  planPremiumPrice: 0,
  planPremiumMmn: 0,
  planBronzeDependents: 0,
  planIndividualDependents: 0,
  planFamilyDependents: 0,
  planPremiumDependents: 0,
  percentages: [0, 0, 0, 0, 0],
  modules: {
    health: { label: 'Telemedicina', price: 0, icon: 'ph-first-aid' },
    clube: { label: 'Clube de Descontos', price: 0, icon: 'ph-tag' },
    pet: { label: 'Veterinário (Pet)', price: 0, icon: 'ph-dog' }
  },
  veencaPayEnabled: false,
  veencaPublicKey: '',
  veencaSecretKey: '',
  veencaSecretKeySet: false,
  veencaSecretKeyLast4: null,
  veencaPeriodicityType: 'MONTHS',
  veencaProductIndividual: '',
  veencaProductFamily: '',
  activeGateway: 'veenca',
  wooviEnabled: false,
  wooviAppId: '',
  wooviAppIdSet: false,
  wooviAppIdLast4: null,
  wooviSandbox: false,
  pagarmeEnabled: false,
  pagarmeSecretKey: '',
  pagarmeSecretKeySet: false,
  pagarmeSecretKeyLast4: null,
  pagarmePublicKey: '',
  clubeCertoEnabled: false,
  clubeCertoCnpj: '',
  clubeCertoPassword: '',
  clubeCertoPasswordSet: false,
  clubeCertoCompanyId: ''
})

// Controles de Modais
const showRegisterModal = ref(false)
const showConfigModal = ref(false)
const showTreeModal = ref(false)
const selectedTreeUser = ref(null)
const editingUser = ref(null)

// Controla scroll do body quando modal está aberto no Admin
watch([showRegisterModal, showConfigModal, showTreeModal, editingUser], (vals) => {
  const isOpen = vals.some(v => !!v)
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

// A API nunca devolve a chave secreta do gateway — o campo do form volta vazio,
// o que o backend lê como "manter a chave gravada".
const applyConfig = (data) => {
  if (data && Object.keys(data).length > 0) {
    config.value = { ...config.value, ...data, veencaSecretKey: '', clubeCertoPassword: '', wooviAppId: '', pagarmeSecretKey: '' }
  }
}

// CEP → preenche endereço (ViaCEP via backend). Usado no cadastro e na edição de usuário.
const fillCepInto = async (obj) => {
  const r = await lookupCep(obj.zipCode)
  if (!r) return
  if (r.street) obj.address = r.street
  if (r.neighborhood) obj.neighborhood = r.neighborhood
  if (r.city) obj.city = r.city
  if (r.state) obj.state = r.state
}
const onNewUserCep = () => fillCepInto(newUser.value)
const onEditUserCep = () => fillCepInto(editingUser.value)

// --- Tickets de suporte (admin) ---
const TICKET_STATUS_CLASS = { enviado: 'badge-warning', respondido: 'badge-success', fechado: 'badge-muted' }
const adminTickets = ref([])
const currentTicket = ref(null)
const ticketReply = ref({ body: '', image: '' })
const ticketLoading = ref(false)
const fmtTicketDate = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '')

const isImageUrl = (u) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(u || '')
const ticketUpload = async (file) => {
  if (!file) return
  const okType = file.type.startsWith('image/') || file.type === 'application/pdf'
  if (!okType || file.size > 8 * 1024 * 1024) return
  try { const r = await uploadFile(file); ticketReply.value.image = r.url } catch { /* ignora */ }
}

const loadTickets = async () => {
  try { 
    const res = await api.get('/admin/tickets') 
    adminTickets.value = res || []
  } catch { 
    adminTickets.value = [] 
  }
}
const openTicketsTab = async () => {
  activeAdminTab.value = 'tickets'
  await loadTickets()
  if (!currentTicket.value && adminTickets.value.length > 0) {
    currentTicket.value = adminTickets.value[0]
  }
}
const openAdminTicket = async (id) => {
  try { 
    const res = await api.get(`/admin/tickets/${id}`)
    currentTicket.value = res || null
  } catch { 
    currentTicket.value = null
  }
}
const replyTicket = async () => {
  if (!ticketReply.value.body.trim()) return
  ticketLoading.value = true
  try {
    currentTicket.value = await api.post(`/admin/tickets/${currentTicket.value.id}/messages`, {
      body: ticketReply.value.body,
      image: ticketReply.value.image || undefined,
    })
    ticketReply.value = { body: '', image: '' }
    await loadTickets()
  } catch (e) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível responder o ticket.' })
  } finally { ticketLoading.value = false }
}
const setTicketStatus = async (status) => {
  try {
    currentTicket.value = await api.put(`/admin/tickets/${currentTicket.value.id}/status`, { status })
    await loadTickets()
  } catch { /* ignore */ }
}

const normalizeChatCurrent = (convOrObj) => {
  if (!convOrObj) return null
  if (convOrObj.conversation && convOrObj.messages) return convOrObj
  return {
    conversation: {
      id: convOrObj.id,
      user: convOrObj.user || convOrObj.userName || 'Usuário',
      userName: convOrObj.userName || convOrObj.user || 'Usuário',
      userEmail: convOrObj.userEmail || '',
      status: convOrObj.status || 'aberto'
    },
    messages: convOrObj.messages || []
  }
}

// --- Chat ao vivo (admin, WebSocket) ---
const chatConvs = ref([])
const chatCurrent = ref(null) // { conversation, messages }
const chatInput = ref('')
const chatThread = ref(null)
let chatSocket = null
let chatWired = false

const fmtChatDate = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '')

const scrollChat = async () => {
  await nextTick()
  if (chatThread.value) chatThread.value.scrollTop = chatThread.value.scrollHeight
}

const upsertConv = (conv) => {
  const i = chatConvs.value.findIndex((c) => c.id === conv.id)
  if (i === -1) chatConvs.value.unshift(conv)
  else chatConvs.value[i] = conv
  // reordena por atividade recente
  chatConvs.value.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
}

const onChatMessage = (payload) => {
  if (chatCurrent.value && payload.conversationId === (chatCurrent.value.conversation?.id || chatCurrent.value.id)) {
    if (!chatCurrent.value.messages) chatCurrent.value.messages = []
    chatCurrent.value.messages.push(payload.message)
    scrollChat()
  }
}

const loadChatConvs = async () => {
  try { 
    const res = await api.get('/admin/chat') 
    chatConvs.value = res || []
  } catch { 
    chatConvs.value = [] 
  }
}

const openChatTab = async () => {
  activeAdminTab.value = 'chat'
  await loadChatConvs()
  if (!chatCurrent.value && chatConvs.value.length > 0) {
    chatCurrent.value = normalizeChatCurrent(chatConvs.value[0])
  }
  try {
    chatSocket = getSocket()
    if (!chatWired && chatSocket) {
      chatSocket.on('chat:message', onChatMessage)
      chatSocket.on('chat:conversation', upsertConv)
      chatSocket.on('chat:purged', onChatPurged)
      chatWired = true
    }
  } catch (err) {
    console.warn('Socket connect skipped:', err)
  }
}

const openChatConv = async (id) => {
  try {
    const res = await api.get(`/admin/chat/${id}`)
    chatCurrent.value = normalizeChatCurrent(res)
    if (chatSocket) chatSocket.emit('chat:join', { conversationId: id })
    const c = chatConvs.value.find((x) => x.id === id)
    if (c) c.unreadForAdmin = 0
    scrollChat()
  } catch { 
    chatCurrent.value = null
    scrollChat()
  }
}

const sendChat = () => {
  const body = chatInput.value.trim()
  if (!body || !chatCurrent.value) return
  if (chatSocket) {
    chatSocket.emit('chat:send', { conversationId: chatCurrent.value.conversation?.id || chatCurrent.value.id, body })
  }
  if (!chatCurrent.value.messages) chatCurrent.value.messages = []
  chatCurrent.value.messages.push({
    id: `msg-${Date.now()}`,
    senderRole: 'admin',
    body,
    createdAt: new Date().toISOString()
  })
  chatInput.value = ''
  scrollChat()
}

// Admin encerra a conversa: marca fechada (usuário recebe aviso; some em ~1min).
const closeChat = () => {
  if (!chatCurrent.value) return
  const id = chatCurrent.value.conversation?.id || chatCurrent.value.id
  if (chatSocket) chatSocket.emit('chat:close', { conversationId: id })
  if (chatCurrent.value.conversation) chatCurrent.value.conversation.status = 'fechado'
  chatCurrent.value.status = 'fechado'
}

// Conversa apagada (após 1min): tira da lista e fecha o painel se estava aberta.
const onChatPurged = (payload) => {
  const id = payload?.conversationId
  chatConvs.value = chatConvs.value.filter((c) => c.id !== id)
  if (chatCurrent.value && (chatCurrent.value.conversation?.id === id || chatCurrent.value.id === id)) chatCurrent.value = null
}

onUnmounted(() => {
  if (chatSocket && chatWired) {
    chatSocket.off('chat:message', onChatMessage)
    chatSocket.off('chat:conversation', upsertConv)
    chatSocket.off('chat:purged', onChatPurged)
  }
})

// Histórico Financeiro do Admin (Renovações e Comissões)
const billingHistory = ref([])
const billingPage = ref(1)
const billingPageSize = ref(10)
const loadError = ref('')
const subStats = ref({ active: 0, pending: 0, canceled: 0, today: 0, todayActive: 0, todayPending: 0, todayCanceled: 0 })

const loadAdminData = async () => {
  try {
    const [usersData, configData, billing, subs] = await Promise.all([
      api.get('/admin/users').catch(() => []),
      api.get('/admin/config').catch(() => ({})),
      api.get('/admin/billing').catch(() => []),
      api.get('/admin/subscription-stats').catch(() => null),
    ])
    users.value = usersData || []
    applyConfig(configData)
    billingHistory.value = billing || []
    subStats.value = subs || { active: 0, pending: 0, canceled: 0, today: 0, todayActive: 0, todayPending: 0, todayCanceled: 0 }
  } catch (err) {
    loadError.value = 'Não foi possível carregar os dados administrativos.'
  }
}

onMounted(() => {
  loadAdminData()
})

// Coerção numérica — campos v-model.number podem virar '' / NaN durante a edição,
// e um .toFixed() nesses valores quebrava o render (tela branca). n() e money() blindam.
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const money = (v) => n(v).toFixed(2)

const isPaidBilling = (item) => {
  const status = String(item?.status ?? '').toLowerCase()
  return status === 'pago' || status.includes('pago') || status === 'paid'
}

const formatDateTime = (value) => {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// --- SAQUES (PEDIDOS DE RETIRADA DE COMISSÃO) ---
const withdrawals = ref([])
const withdrawalsTotal = ref(0)
const withdrawalsTotalPages = ref(1)
const withdrawalsPage = ref(1)
const withdrawalsLimit = ref(10)
const withdrawalsStatusFilter = ref('')
const withdrawalsPendingTotal = ref(0)
const withdrawalsLoading = ref(false)
const withdrawalPayingId = ref(null)

const withdrawalsPendingCount = computed(() => withdrawals.value.filter(w => w.status === 'pendente').length)

const loadWithdrawals = async () => {
  withdrawalsLoading.value = true
  try {
    const params = new URLSearchParams({
      page: String(withdrawalsPage.value),
      limit: String(withdrawalsLimit.value),
    })
    if (withdrawalsStatusFilter.value) params.set('status', withdrawalsStatusFilter.value)
    const data = await api.get(`/admin/withdrawals?${params.toString()}`)
    withdrawals.value = data?.items || []
    withdrawalsTotal.value = data?.total || 0
    withdrawalsTotalPages.value = data?.totalPages || 1
    withdrawalsPendingTotal.value = data?.pendingTotal || 0
  } catch {
    withdrawals.value = []
    withdrawalsTotal.value = 0
    withdrawalsTotalPages.value = 1
  } finally {
    withdrawalsLoading.value = false
  }
}

const openWithdrawalsTab = () => {
  activeAdminTab.value = 'saques'
  loadWithdrawals()
}

const goWithdrawalsPage = (page) => {
  withdrawalsPage.value = Math.min(Math.max(1, page), withdrawalsTotalPages.value)
  loadWithdrawals()
}

watch([withdrawalsStatusFilter, withdrawalsLimit], () => {
  withdrawalsPage.value = 1
  loadWithdrawals()
})

const copyPixKey = async (key) => {
  if (!key) return
  try {
    await navigator.clipboard.writeText(key)
    emit('triggerDevModal', { title: 'Chave copiada', message: `Chave PIX ${key} copiada para a área de transferência.` })
  } catch {
    emit('triggerDevModal', { title: 'Chave PIX', message: key })
  }
}

const payWithdrawal = async (w) => {
  const pixLine = w.pixKey ? `\nChave PIX (${w.pixKeyTypeLabel}): ${w.pixKey}` : ''
  if (!confirm(`Confirmar baixa do saque #${w.id}?\n\nCliente: ${w.user?.name || 'usuário'}\nValor: ${w.amountLabel}${pixLine}\n\nO usuário receberá um e-mail informando que o saque foi realizado.`)) return
  withdrawalPayingId.value = w.id
  try {
    await api.post(`/admin/withdrawals/${w.id}/pay`)
    emit('triggerDevModal', {
      title: 'Saque liberado',
      message: `O saque #${w.id} foi marcado como pago e o e-mail de confirmação foi enviado para ${w.user?.email || 'o usuário'}.`,
    })
    await loadWithdrawals()
  } catch (err) {
    emit('triggerDevModal', {
      title: 'Erro ao dar baixa',
      message: err?.message || 'Não foi possível liberar esse saque. Tente novamente.',
    })
  } finally {
    withdrawalPayingId.value = null
  }
}

const isPixBilling = (item) => {
  const text = `${item?.paymentMethod ?? ''} ${item?.gatewayProvider ?? ''}`.toLowerCase()
  return text.includes('pix') || text.includes('woovi') || text.includes('veenca')
}

const isCardBilling = (item) => {
  const text = `${item?.paymentMethod ?? ''} ${item?.gatewayProvider ?? ''}`.toLowerCase()
  return text.includes('cart') || text.includes('card') || text.includes('pagarme')
}

const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const billingDateKey = (item) => {
  const raw = item?.dateIso ?? item?.createdAt
  if (!raw) return ''
  return new Date(raw).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

const aggregateBilling = (items) => {
  const paid = items.filter(isPaidBilling)
  const gross = paid.reduce((acc, item) => acc + n(item.value), 0)
  const commission = paid.reduce((acc, item) => acc + n(item.commissionMmn), 0)
  const pix = paid.filter(isPixBilling).reduce((acc, item) => acc + n(item.value), 0)
  const card = paid.filter(isCardBilling).reduce((acc, item) => acc + n(item.value), 0)
  return { paidCount: paid.length, gross, commission, net: gross - commission, pix, card }
}

// Filtros do Histórico Financeiro
const billingSearchTerm = ref('')
const billingStatusFilter = ref('todos')
const billingMethodFilter = ref('todos')

watch([billingSearchTerm, billingStatusFilter, billingMethodFilter, billingPageSize], () => {
  billingPage.value = 1
})

const clearBillingFilters = () => {
  billingSearchTerm.value = ''
  billingStatusFilter.value = 'todos'
  billingMethodFilter.value = 'todos'
  billingPageSize.value = 10
  billingPage.value = 1
}

const filteredBillingHistory = computed(() => {
  const term = (billingSearchTerm.value || '').trim().toLowerCase()
  return billingHistory.value.filter(item => {
    const matchSearch = !term ||
      (item.user && item.user.toLowerCase().includes(term)) ||
      (item.userName && item.userName.toLowerCase().includes(term)) ||
      (item.userEmail && item.userEmail.toLowerCase().includes(term)) ||
      (item.plan && item.plan.toLowerCase().includes(term)) ||
      (item.transactionId && item.transactionId.toLowerCase().includes(term))
    
    const status = String(item.status || '').toLowerCase()
    const matchStatus = billingStatusFilter.value === 'todos' ||
      (billingStatusFilter.value === 'pago' && (status === 'pago' || status === 'paid')) ||
      (billingStatusFilter.value === 'pendente' && (status === 'pendente' || status === 'pending')) ||
      (billingStatusFilter.value === 'cancelado' && (status === 'cancelado' || status === 'falha' || status === 'inativo' || status === 'cancelled'))
    
    const matchMethod = billingMethodFilter.value === 'todos' ||
      (billingMethodFilter.value === 'pix' && isPixBilling(item)) ||
      (billingMethodFilter.value === 'cartao' && isCardBilling(item))

    return matchSearch && matchStatus && matchMethod
  })
})

const todayBillingHistory = computed(() => billingHistory.value.filter((item) => billingDateKey(item) === todayKey()))
const billingTotals = computed(() => aggregateBilling(billingHistory.value))
const todayBillingTotals = computed(() => aggregateBilling(todayBillingHistory.value))
const totalBillingPages = computed(() => Math.max(1, Math.ceil(filteredBillingHistory.value.length / n(billingPageSize.value || 10))))
const paginatedBillingHistory = computed(() => {
  const pageSize = n(billingPageSize.value || 10)
  const start = (billingPage.value - 1) * pageSize
  return filteredBillingHistory.value.slice(start, start + pageSize)
})
const billingRangeStart = computed(() => filteredBillingHistory.value.length ? ((billingPage.value - 1) * n(billingPageSize.value || 10)) + 1 : 0)
const billingRangeEnd = computed(() => Math.min(filteredBillingHistory.value.length, billingPage.value * n(billingPageSize.value || 10)))

watch([billingHistory, billingPageSize], () => {
  billingPage.value = 1
})

const billingStatusLabel = (status) => {
  const s = String(status ?? '').toLowerCase()
  if (s === 'pago' || s === 'paid') return 'Pago'
  if (s === 'pendente' || s === 'pending') return 'Pendente'
  if (s === 'cancelado' || s === 'cancelled') return 'Cancelado'
  return status || '-'
}

const billingStatusClass = (status) => {
  const s = String(status ?? '').toLowerCase()
  if (s === 'pago' || s === 'paid') return 'ativo'
  if (s === 'pendente' || s === 'pending') return 'pendente'
  return 'inativo'
}

const billingMethodLabel = (item) => {
  if (isCardBilling(item)) return 'Cartao'
  if (isPixBilling(item)) return 'Pix'
  return item?.paymentMethod || '-'
}

// Preço base do plano (mesma fórmula do backend — cada plano tem preço próprio configurável)
const basePriceForPlan = (planName) => {
  if (planName === 'Família') return n(config.value.planFamilyPrice)
  if (planName === 'Viva Mais Premium') return n(config.value.planPremiumPrice)
  return n(config.value.planIndividualPrice)
}

// Valor MMN (base de comissão) por plano — espelha common/pricing.ts do backend
const mmnForPlan = (planName) => {
  if (planName === 'Família') return n(config.value.planFamilyMmn)
  if (planName === 'Viva Mais Premium') return n(config.value.planPremiumMmn)
  return n(config.value.planIndividualMmn)
}

// Cálculo do preço dinâmico de um usuário com base nas configurações
const calculatePrice = (userAccess, planName) => {
  // Cobra o valor da tabela do plano (benefícios inclusos, sem somar módulos).
  return basePriceForPlan(planName)
}

// Cálculo recursivo de quanto o usuário está recebendo de comissão em 5 níveis
const calculateUserCommission = (user) => {
  let total = 0
  const lvl1 = users.value.filter(u => u.referredBy === user.name)
  lvl1.forEach(u1 => {
    const mmnVal = mmnForPlan(u1.plan)
    total += (mmnVal * config.value.percentages[0]) / 100
    
    const lvl2 = users.value.filter(u => u.referredBy === u1.name)
    lvl2.forEach(u2 => {
      const mmnVal2 = mmnForPlan(u2.plan)
      total += (mmnVal2 * config.value.percentages[1]) / 100
      
      const lvl3 = users.value.filter(u => u.referredBy === u2.name)
      lvl3.forEach(u3 => {
        const mmnVal3 = mmnForPlan(u3.plan)
        total += (mmnVal3 * config.value.percentages[2]) / 100
        
        const lvl4 = users.value.filter(u => u.referredBy === u3.name)
        lvl4.forEach(u4 => {
          const mmnVal4 = mmnForPlan(u4.plan)
          total += (mmnVal4 * config.value.percentages[3]) / 100
          
          const lvl5 = users.value.filter(u => u.referredBy === u4.name)
          lvl5.forEach(u5 => {
            const mmnVal5 = mmnForPlan(u5.plan)
            total += (mmnVal5 * config.value.percentages[4]) / 100
          })
        })
      })
    })
  })
  
  return total
}

// Retorna uma lista aninhada contendo a rede abaixo de um determinado usuário (Estrutura de Árvore/Pirâmide)
const getReferralTree = (userName, currentLevel = 1) => {
  if (currentLevel > 5) return []
  const directChildren = users.value.filter(u => u.referredBy === userName)
  
  return directChildren.map(child => {
    return {
      name: child.name,
      plan: child.plan,
      level: child.level,
      status: child.status,
      depth: currentLevel,
      children: getReferralTree(child.name, currentLevel + 1)
    }
  })
}

// Detalha os padrinhos que receberam a comissão de uma determinada renovação
const getCommissionReceivers = (userName, planName) => {
  const receivers = []
  let currentUser = users.value.find(u => u.name === userName)
  
  if (!currentUser) return receivers
  
  let currentReferrerName = currentUser.referredBy
  let depth = 0
  const mmnVal = mmnForPlan(planName)
  
  while (currentReferrerName && currentReferrerName !== 'Nenhum' && depth < 5) {
    const parent = users.value.find(u => u.name === currentReferrerName)
    const pct = config.value.percentages[depth]
    const gain = (mmnVal * pct) / 100
    
    receivers.push({
      level: depth + 1,
      name: currentReferrerName,
      gain: gain
    })
    
    if (parent) {
      currentReferrerName = parent.referredBy
    } else {
      break
    }
    depth++
  }
  
  return receivers
}

// Formulário de Cadastro
const BRAZIL_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function blankNewUser() {
  return {
    name: '',
    email: '',
    cpf: '',
    phone: '',
    birthDate: '',
    gender: '',
    address: '',
    neighborhood: '',
    complement: '',
    city: '',
    state: '',
    zipCode: '',
    plan: 'Individual',
    level: '1º Nível',
    referredBy: 'João Silva',
    access: {
      health: true,
      clube: true,
      pet: false,
      funeral: false
    },
    status: 'ativo'
  }
}

const newUser = ref(blankNewUser())

// Cálculo em tempo real do preço do novo usuário
const newUserPrice = computed(() => {
  return calculatePrice(newUser.value.access, newUser.value.plan)
})

/** Input nativo type="date" dá YYYY-MM-DD — Vencca exige DD/MM/AAAA. */
function toBrDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

const registerUser = async () => {
  if (!newUser.value.name || !newUser.value.email || !newUser.value.cpf) {
    emit('triggerDevModal', {
      title: 'Campos Obrigatórios',
      message: 'Por favor, preencha todos os campos cadastrais obrigatórios.'
    })
    return
  }

  try {
    const created = await api.post('/admin/users', {
      ...newUser.value,
      birthDate: toBrDate(newUser.value.birthDate),
    })
    users.value.push(created)
    billingHistory.value = await api.get('/admin/billing')

    emit('triggerDevModal', {
      title: 'Usuário Cadastrado!',
      message: `O usuário ${created.name} foi criado com sucesso com acesso aos módulos configurados.`
    })

    // Reset formulário e fecha modal
    newUser.value = blankNewUser()

    showRegisterModal.value = false
  } catch (err) {
    emit('triggerDevModal', {
      title: 'Erro ao Cadastrar',
      message: err.status === 409 ? 'Já existe um usuário com esse e-mail ou CPF.' : 'Não foi possível cadastrar o usuário agora.'
    })
  }
}

// Excluir usuário
const deleteUser = async (id) => {
  if (!confirm('Tem certeza que deseja remover este usuário?')) return
  try {
    await api.delete(`/admin/users/${id}`)
    users.value = users.value.filter(u => u.id !== id)
    emit('triggerDevModal', {
      title: 'Usuário Removido',
      message: 'O cadastro do usuário foi removido permanentemente do sistema.'
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível remover o usuário agora.' })
  }
}

// Gerar nova senha — envia por e-mail ao usuário e exibe pro admin.
const regeneratePassword = async (user) => {
  if (!confirm(`Gerar uma nova senha para ${user.name}? A senha será enviada por e-mail e exibida aqui.`)) return
  try {
    const { password } = await api.post(`/admin/users/${user.id}/reset-password`, {})
    emit('triggerDevModal', {
      title: 'Nova senha gerada',
      message: `Nova senha de ${user.name}: ${password}\n\nEnviada para ${user.email}. Anote antes de fechar.`
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível gerar uma nova senha agora.' })
  }
}

/** DD/MM/AAAA (formato salvo/Vencca) -> YYYY-MM-DD (formato do input type="date"). */
function toIsoDate(brDate) {
  if (!brDate) return ''
  const [d, m, y] = brDate.split('/')
  return `${y}-${m}-${d}`
}

// Edição rápida de acessos
const openEditAccess = (user) => {
  editingUser.value = JSON.parse(JSON.stringify(user))
  editingUser.value.birthDate = toIsoDate(editingUser.value.birthDate)
}

const saveEditAccess = async () => {
  try {
    const updated = await api.put(`/admin/users/${editingUser.value.id}`, {
      ...editingUser.value,
      birthDate: toBrDate(editingUser.value.birthDate),
    })
    const idx = users.value.findIndex(u => u.id === updated.id)
    if (idx !== -1) users.value[idx] = updated
    editingUser.value = null
    emit('triggerDevModal', {
      title: 'Usuário Atualizado',
      message: 'Os dados e acessos do usuário foram salvos com sucesso.'
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível salvar as alterações agora.' })
  }
}

// Salvar Regras de Comissão e Preços
const saveRules = async () => {
  try {
    applyConfig(await api.put('/admin/config', config.value))
    showConfigModal.value = false
    emit('triggerDevModal', {
      title: 'Regras Atualizadas!',
      message: 'Regras de planos, módulos e distribuição de comissões em 5 níveis foram salvas no sistema.'
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível salvar as regras agora.' })
  }
}

const openTreeModal = (user) => {
  selectedTreeUser.value = user
  showTreeModal.value = true
}

// Filtros e Paginação da Gestão de Usuários
const searchFilter = ref('')
const userStatusFilter = ref('todos')
const userPlanFilter = ref('todos')
const userPageSize = ref(10)
const userPage = ref(1)

watch([searchFilter, userStatusFilter, userPlanFilter, userPageSize], () => {
  userPage.value = 1
})

const clearUserFilters = () => {
  searchFilter.value = ''
  userStatusFilter.value = 'todos'
  userPlanFilter.value = 'todos'
  userPageSize.value = 10
  userPage.value = 1
}

const filteredUsers = computed(() => {
  const term = (searchFilter.value || '').trim().toLowerCase()
  return users.value.filter(u => {
    const matchSearch = !term ||
      (u.name && u.name.toLowerCase().includes(term)) ||
      (u.email && u.email.toLowerCase().includes(term)) ||
      (u.cpf && u.cpf.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
    
    const matchStatus = userStatusFilter.value === 'todos' || u.status === userStatusFilter.value
    const matchPlan = userPlanFilter.value === 'todos' || (u.plan && u.plan.toLowerCase().includes(userPlanFilter.value.toLowerCase()))

    return matchSearch && matchStatus && matchPlan
  })
})

const totalUserPages = computed(() => Math.max(1, Math.ceil(filteredUsers.value.length / n(userPageSize.value || 10))))
const paginatedUsers = computed(() => {
  const size = n(userPageSize.value || 10)
  const start = (userPage.value - 1) * size
  return filteredUsers.value.slice(start, start + size)
})
const userRangeStart = computed(() => filteredUsers.value.length ? ((userPage.value - 1) * n(userPageSize.value || 10)) + 1 : 0)
const userRangeEnd = computed(() => Math.min(filteredUsers.value.length, userPage.value * n(userPageSize.value || 10)))
</script>

<template>
  <div class="admin-panel" :class="[layoutMode]">
    
    <!-- Header Admin -->
    <header class="admin-header card animated-item" style="animation-delay: 0s;">
      <div class="header-main">
        <div>
          <span class="admin-badge"><i class="ph ph-shield-check" style="margin-right: 4px;"></i> PAINEL DO ADMINISTRADOR</span>
          <h2>Usuários, Preços e Comissões</h2>
          <p>Visão geral da rede de afiliados e controle de mensalidades baseadas em acessos.</p>
        </div>
        
        <div class="action-buttons-header">
          <button class="btn btn-secondary" @click="showRegisterModal = true">
            <i class="ph ph-user-plus"></i> Cadastrar Usuário
          </button>
          <button class="btn btn-outline" @click="showConfigModal = true">
            <i class="ph ph-sliders"></i> Regras & Comissões
          </button>
        </div>
      </div>
    </header>

    <p v-if="loadError" style="color:#ef4444; background:#fef2f2; border:1px solid #fecaca; padding:12px 16px; border-radius: var(--radius-sm); margin-bottom: 16px;">
      {{ loadError }}
    </p>

    <!-- Navegação de Abas do Admin -->
    <div class="admin-tabs-nav">
      <button 
        :class="['admin-tab-btn', { active: activeAdminTab === 'usuarios' }]" 
        @click="activeAdminTab = 'usuarios'"
      >
        <i class="ph ph-users"></i> Gestão de Usuários & Rede
      </button>
      <button
        :class="['admin-tab-btn', { active: activeAdminTab === 'financeiro' }]"
        @click="activeAdminTab = 'financeiro'"
      >
        <i class="ph ph-chart-line-up"></i> Histórico Financeiro (Renovações)
      </button>
      <button
        :class="['admin-tab-btn', { active: activeAdminTab === 'tickets' }]"
        @click="openTicketsTab"
      >
        <i class="ph ph-headset"></i> Tickets de Suporte
      </button>
      <button
        :class="['admin-tab-btn', { active: activeAdminTab === 'chat' }]"
        @click="openChatTab"
      >
        <i class="ph ph-chat-circle-dots"></i> Chat ao vivo
        <span v-if="chatConvs.some(c => c.unreadForAdmin > 0)" class="chat-nav-dot"></span>
      </button>
      <button
        :class="['admin-tab-btn', { active: activeAdminTab === 'saques' }]"
        @click="openWithdrawalsTab"
      >
        <i class="ph ph-hand-coins"></i> Saques
        <span v-if="withdrawalsPendingCount > 0" class="chat-nav-dot"></span>
      </button>
      <button
        :class="['admin-tab-btn', { active: activeAdminTab === 'teen' }]"
        @click="activeAdminTab = 'teen'"
      >
        <i class="ph ph-headphones" style="color: #2563eb;"></i> Viva Mais Teen (Idiomas)
      </button>
    </div>

    <!-- ABA 1: GESTÃO DE USUÁRIOS -->
    <div v-if="activeAdminTab === 'usuarios'" class="tab-content-admin">
      <!-- Barra de Filtros Dinâmicos de Usuários -->
      <div class="card animated-item" style="padding: 16px 20px; margin-bottom: 20px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; animation-delay: 0.05s;">
        <div style="position: relative; flex: 1; min-width: 220px;">
          <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-gray); font-size: 16px;"></i>
          <input 
            v-model="searchFilter" 
            type="text" 
            placeholder="Buscar usuário por nome, email ou CPF..." 
            class="form-control" 
            style="padding-left: 38px;" 
          />
        </div>

        <select v-model="userStatusFilter" class="form-control" style="width: auto; min-width: 140px;">
          <option value="todos">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="pendente">Pendente</option>
          <option value="inativo">Inativo</option>
        </select>

        <select v-model="userPlanFilter" class="form-control" style="width: auto; min-width: 140px;">
          <option value="todos">Todos os planos</option>
          <option value="Viva Mais Premium">Viva Mais Premium</option>
          <option value="Família">Família</option>
          <option value="Individual">Individual</option>
          <option value="Bronze">Bronze</option>
        </select>

        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size: 12px; color: var(--text-gray); white-space: nowrap;">Limite:</span>
          <select v-model.number="userPageSize" class="form-control" style="width: auto; min-width: 75px;">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
        </div>

        <button class="btn btn-outline" @click="clearUserFilters" title="Limpar todos os filtros">
          <i class="ph ph-arrow-counter-clockwise"></i> Limpar
        </button>
      </div>

      <!-- LISTA DE USUÁRIOS: DESKTOP -->
      <div v-if="layoutMode === 'desktop'" class="admin-content animated-item" style="animation-delay: 0.1s;">
        <div class="card" style="padding: 0; overflow-x: auto;">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Plano</th>
                <th>Nível Rede</th>
                <th>Indicado Por</th>
                <th>Acessos Ativos</th>
                <th>Mensalidade</th>
                <th>Comissão Recebida</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in paginatedUsers" :key="u.id">
                <td>
                  <div class="user-info-col">
                    <strong>{{ u.name }}</strong>
                    <span>{{ u.email }} • CPF: {{ u.cpf }}</span>
                  </div>
                </td>
                <td>{{ u.plan }}</td>
                <td>
                  <span class="badge badge-level">{{ u.level }}</span>
                </td>
                <td>
                  <span v-if="u.referredBy !== 'Nenhum'" class="referred-badge">
                    <i class="ph ph-arrow-bend-down-right"></i> {{ u.referredBy }}
                  </span>
                  <span v-else class="text-gray">-</span>
                </td>
                <td>
                  <div class="modules-badges">
                    <span :class="['module-badge-icon', { active: u.access?.health }]" :title="'Telemedicina: ' + (u.access?.health ? 'Ativo' : 'Inativo')">
                      <i class="ph ph-first-aid"></i>
                    </span>
                    <span :class="['module-badge-icon', { active: u.access?.clube }]" :title="'Clube de Descontos: ' + (u.access?.clube ? 'Ativo' : 'Inativo')">
                      <i class="ph ph-tag"></i>
                    </span>
                    <span :class="['module-badge-icon', { active: u.access?.pet }]" :title="'Veterinário (Pet): ' + (u.access?.pet ? 'Ativo' : 'Inativo')">
                      <i class="ph ph-dog"></i>
                    </span>
                  </div>
                </td>
                <td class="price-col">
                  R$ {{ calculatePrice(u.access, u.plan).toFixed(2) }}
                </td>
                <td style="font-weight: bold; color: #16a34a;">
                  R$ {{ calculateUserCommission(u).toFixed(2) }}
                </td>
                <td>
                  <span :class="['status-pill', u.status]">{{ u.status }}</span>
                </td>
                <td>
                  <div class="actions-buttons">
                    <button class="btn-action-edit" title="Editar Usuário" @click="openEditAccess(u)">
                      <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-action-tree" title="Visualizar Rede de Indicações" @click="openTreeModal(u)" style="color: #7c3aed; background: transparent; border: none; cursor: pointer; font-size: 16px; padding: 6px; border-radius: var(--radius-sm);">
                      <i class="ph ph-tree-structure"></i>
                    </button>
                    <button class="btn-action-edit" title="Gerar Nova Senha" @click="regeneratePassword(u)" style="color: #f59e0b;">
                      <i class="ph ph-key"></i>
                    </button>
                    <button class="btn-action-delete" title="Excluir Usuário" @click="deleteUser(u.id)">
                      <i class="ph ph-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
              <tr v-if="filteredUsers.length === 0">
                <td colspan="9" style="text-align: center; padding: 32px 16px; color: var(--text-gray);">
                  <i class="ph ph-magnifying-glass" style="font-size: 32px; display:block; margin-bottom: 8px; opacity: 0.5;"></i>
                  Nenhum usuário correspondente encontrado com os filtros aplicados.
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Barra de Paginação de Usuários -->
          <div v-if="filteredUsers.length > 0" class="table-pagination-footer">
            <div class="pagination-info">
              Mostrando <strong>{{ userRangeStart }}</strong> a <strong>{{ userRangeEnd }}</strong> de <strong>{{ filteredUsers.length }}</strong> usuários
            </div>

            <div class="pagination-actions">
              <button 
                class="btn-pagination-nav" 
                :disabled="userPage <= 1" 
                @click="userPage = 1" 
                title="Primeira Página"
              >
                <i class="ph ph-caret-double-left"></i>
              </button>

              <button 
                class="btn-pagination-nav" 
                :disabled="userPage <= 1" 
                @click="userPage--" 
                title="Página Anterior"
              >
                <i class="ph ph-caret-left"></i> Anterior
              </button>

              <div class="pagination-pages">
                <button 
                  v-for="page in totalUserPages" 
                  :key="page" 
                  :class="['btn-page-number', { active: page === userPage }]" 
                  @click="userPage = page"
                >
                  {{ page }}
                </button>
              </div>

              <button 
                class="btn-pagination-nav" 
                :disabled="userPage >= totalUserPages" 
                @click="userPage++" 
                title="Próxima Página"
              >
                Próxima <i class="ph ph-caret-right"></i>
              </button>

              <button 
                class="btn-pagination-nav" 
                :disabled="userPage >= totalUserPages" 
                @click="userPage = totalUserPages" 
                title="Última Página"
              >
                <i class="ph ph-caret-double-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- LISTA DE USUÁRIOS: MOBILE / PWA -->
      <div v-else class="admin-content-mobile animated-item" style="animation-delay: 0.1s;">
        <div v-for="u in filteredUsers" :key="u.id" class="mobile-user-card card">
          <div class="mobile-card-header">
            <div class="user-avatar-mini">{{ u.name.split(' ').filter(Boolean).slice(0, 2).map(n=>n[0]).join('') }}</div>
            <div class="mobile-card-title">
              <strong>{{ u.name }}</strong>
              <span>{{ u.email }}</span>
            </div>
            <span :class="['status-pill', u.status]">{{ u.status }}</span>
          </div>

          <div class="mobile-card-details">
            <div class="detail-row">
              <span class="label">CPF:</span>
              <span>{{ u.cpf }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Plano:</span>
              <strong>{{ u.plan }}</strong>
            </div>
            <div class="detail-row">
              <span class="label">Rede:</span>
              <span class="badge badge-level">{{ u.level }}</span>
            </div>
            <div class="detail-row">
              <span class="label">Indicador:</span>
              <span v-if="u.referredBy !== 'Nenhum'" class="referred-badge">
                {{ u.referredBy }}
              </span>
              <span v-else>-</span>
            </div>
            <div class="detail-row">
              <span class="label">Preço:</span>
              <strong class="price-col">R$ {{ calculatePrice(u.access, u.plan).toFixed(2) }}</strong>
            </div>
            <div class="detail-row">
              <span class="label">Comissão:</span>
              <strong style="color: #16a34a;">R$ {{ calculateUserCommission(u).toFixed(2) }}</strong>
            </div>
            <div class="detail-row" style="border: none; padding-top: 10px;">
              <span class="label">Serviços:</span>
              <div class="modules-badges">
                <span :class="['module-badge-icon', { active: u.access.health }]" :title="'Telemedicina: ' + (u.access.health ? 'Ativo' : 'Inativo')">
                  <i class="ph ph-first-aid"></i>
                </span>
                <span :class="['module-badge-icon', { active: u.access.clube }]" :title="'Clube de Descontos: ' + (u.access.clube ? 'Ativo' : 'Inativo')">
                  <i class="ph ph-tag"></i>
                </span>
                <span :class="['module-badge-icon', { active: u.access.pet }]" :title="'Veterinário (Pet): ' + (u.access.pet ? 'Ativo' : 'Inativo')">
                  <i class="ph ph-dog"></i>
                </span>
              </div>
            </div>
          </div>

          <div class="mobile-card-actions" style="display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-color); padding-top: 12px;">
            <button class="btn btn-outline btn-sm" @click="openEditAccess(u)" style="flex: 1; min-width: 70px; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <i class="ph ph-pencil-simple"></i> Editar
            </button>
            <button class="btn btn-outline btn-sm" @click="openTreeModal(u)" style="flex: 1; min-width: 70px; color: #7c3aed; border-color: #7c3aed; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <i class="ph ph-tree-structure"></i> Rede
            </button>
            <button class="btn btn-outline btn-sm" @click="regeneratePassword(u)" style="flex: 1; min-width: 70px; color: #f59e0b; border-color: #f59e0b; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <i class="ph ph-key"></i> Senha
            </button>
            <button class="btn btn-outline btn-sm text-red" @click="deleteUser(u.id)" style="flex: 1; min-width: 70px; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <i class="ph ph-trash"></i> Excluir
            </button>
          </div>
        </div>

        <div v-if="filteredUsers.length === 0" class="card" style="text-align: center; padding: 24px; color: var(--text-gray);">
          Nenhum usuário correspondente encontrado.
        </div>
      </div>
    </div>

    <!-- ABA 2: HISTÓRICO FINANCEIRO / RENOVAÇÕES -->
    <div v-else-if="activeAdminTab === 'financeiro'" class="tab-content-admin animated-item" style="animation-delay: 0s;">
      <!-- Grid de métricas rápidas de faturamento -->
      <div class="finance-metrics-grid">
        <div class="rules-col-box finance-metric-card">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">FATURAMENTO BRUTO</span>
          <strong style="font-size: 24px; color: var(--secondary);">R$ {{ money(billingTotals.gross) }}</strong>
          <small style="display:block; color:var(--text-gray); margin-top:4px;">{{ billingTotals.paidCount }} pago(s)</small>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #bfdbfe;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">PIX RECEBIDO</span>
          <strong style="font-size: 24px; color: var(--primary);">R$ {{ money(billingTotals.pix) }}</strong>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #ddd6fe;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">CARTAO RECEBIDO</span>
          <strong style="font-size: 24px; color: #7c3aed;">R$ {{ money(billingTotals.card) }}</strong>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #fbcfe8;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">COMISSÕES DISTRIBUÍDAS</span>
          <strong style="font-size: 24px; color: #db2777;">R$ {{ money(billingTotals.commission) }}</strong>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #bbf7d0;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">RECEITA LÍQUIDA DA EMPRESA</span>
          <strong style="font-size: 24px; color: #16a34a;">R$ {{ money(billingTotals.net) }}</strong>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #fde68a;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">CAIU HOJE</span>
          <strong style="font-size: 24px; color: #ca8a04;">R$ {{ money(todayBillingTotals.gross) }}</strong>
          <small style="display:block; color:var(--text-gray); margin-top:4px;">Pix R$ {{ money(todayBillingTotals.pix) }} - Cartao R$ {{ money(todayBillingTotals.card) }}</small>
        </div>
        <div class="rules-col-box finance-metric-card" style="border-color: #99f6e4;">
          <span style="font-size: 11px; color: var(--text-gray); font-weight: 700; display:block; margin-bottom: 4px;">ASSINATURAS HOJE</span>
          <strong style="font-size: 24px; color: #0d9488;">{{ subStats.today }} nova(s)</strong>
          <small style="display:block; color:var(--text-gray); margin-top:4px;">
            Ativas {{ subStats.todayActive }} · Pendentes {{ subStats.todayPending }} · Canceladas {{ subStats.todayCanceled }}
          </small>
        </div>
      </div>

      <!-- Barra de Filtros Dinâmicos do Financeiro -->
      <div class="card animated-item" style="padding: 16px 20px; margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; animation-delay: 0.05s;">
        <div style="position: relative; flex: 1; min-width: 220px;">
          <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-gray); font-size: 16px;"></i>
          <input 
            v-model="billingSearchTerm" 
            type="text" 
            placeholder="Buscar por usuário, e-mail, plano ou ID de transação..." 
            class="form-control" 
            style="padding-left: 38px;" 
          />
        </div>

        <select v-model="billingStatusFilter" class="form-control" style="width: auto; min-width: 140px;">
          <option value="todos">Todos os status</option>
          <option value="pago">Pago</option>
          <option value="pendente">Pendente</option>
          <option value="cancelado">Cancelado / Falha</option>
        </select>

        <select v-model="billingMethodFilter" class="form-control" style="width: auto; min-width: 140px;">
          <option value="todos">Todos os métodos</option>
          <option value="pix">PIX</option>
          <option value="cartao">Cartão de Crédito</option>
        </select>

        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size: 12px; color: var(--text-gray); white-space: nowrap;">Limite:</span>
          <select v-model.number="billingPageSize" class="form-control" style="width: auto; min-width: 75px;">
            <option :value="5">5</option>
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
        </div>

        <button class="btn btn-outline" @click="clearBillingFilters" title="Limpar todos os filtros">
          <i class="ph ph-arrow-counter-clockwise"></i> Limpar
        </button>
      </div>

      <div class="card animated-item" style="padding: 0; overflow-x: auto; animation-delay: 0.1s;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Plano</th>
              <th>Valor Cobrado</th>
              <th>Método</th>
              <th>Data Vencimento/Pago</th>
              <th>Status Renovação</th>
              <th>Comissão Distribuída</th>
              <th>Padrinhos Beneficiados (Detalhamento)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="b in paginatedBillingHistory" :key="b.id">
              <td>
                <div class="user-info-col">
                  <strong>{{ b.user || b.userName }}</strong>
                  <span style="font-size: 11px; color: var(--text-gray);">{{ b.userEmail }}</span>
                </div>
              </td>
              <td>{{ b.plan }}</td>
              <td class="price-col">R$ {{ money(b.value) }}</td>
              <td>{{ billingMethodLabel(b) }}</td>
              <td>{{ b.date }}</td>
              <td>
                <span :class="['status-pill', billingStatusClass(b.status)]">
                  {{ billingStatusLabel(b.status) }}
                </span>
              </td>
              <td style="font-weight: bold; color: #db2777;">R$ {{ money(b.commissionMmn) }}</td>
              <td>
                <div v-if="b.commissionMmn > 0 && getCommissionReceivers(b.user || b.userName, b.plan).length > 0" style="display:flex; flex-direction:column; gap:4px; font-size: 11px;">
                  <div v-for="recv in getCommissionReceivers(b.user || b.userName, b.plan)" :key="recv.name" style="background:#fdf2f8; border:1px solid #fbcfe8; padding: 4px 8px; border-radius: 4px; display:inline-flex; align-items:center; justify-content:space-between; gap:10px;">
                    <span>Nível {{ recv.level }}: <strong>{{ recv.name }}</strong></span>
                    <strong style="color: #db2777;">+ R$ {{ money(recv.gain) }}</strong>
                  </div>
                </div>
                <span v-else class="text-gray" style="font-size:11px;">Nenhuma comissão distribuída</span>
              </td>
            </tr>
            <tr v-if="filteredBillingHistory.length === 0">
              <td colspan="8" style="text-align: center; padding: 32px 16px; color: var(--text-gray);">
                <i class="ph ph-magnifying-glass" style="font-size: 32px; display:block; margin-bottom: 8px; opacity: 0.5;"></i>
                Nenhum registro financeiro encontrado com os filtros aplicados.
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Barra de Paginação do Financeiro -->
        <div v-if="filteredBillingHistory.length > 0" class="table-pagination-footer">
          <div class="pagination-info">
            Mostrando <strong>{{ billingRangeStart }}</strong> a <strong>{{ billingRangeEnd }}</strong> de <strong>{{ filteredBillingHistory.length }}</strong> registros
          </div>

          <div class="pagination-actions">
            <button 
              class="btn-pagination-nav" 
              :disabled="billingPage <= 1" 
              @click="billingPage = 1" 
              title="Primeira Página"
            >
              <i class="ph ph-caret-double-left"></i>
            </button>

            <button 
              class="btn-pagination-nav" 
              :disabled="billingPage <= 1" 
              @click="billingPage--" 
              title="Página Anterior"
            >
              <i class="ph ph-caret-left"></i> Anterior
            </button>

            <div class="pagination-pages">
              <button 
                v-for="page in totalBillingPages" 
                :key="page" 
                :class="['btn-page-number', { active: page === billingPage }]" 
                @click="billingPage = page"
              >
                {{ page }}
              </button>
            </div>

            <button 
              class="btn-pagination-nav" 
              :disabled="billingPage >= totalBillingPages" 
              @click="billingPage++" 
              title="Próxima Página"
            >
              Próxima <i class="ph ph-caret-right"></i>
            </button>

            <button 
              class="btn-pagination-nav" 
              :disabled="billingPage >= totalBillingPages" 
              @click="billingPage = totalBillingPages" 
              title="Última Página"
            >
              <i class="ph ph-caret-double-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ABA 3: TICKETS DE SUPORTE -->
    <div v-if="activeAdminTab === 'tickets'" class="tab-content-admin">
      <div class="tickets-admin-grid">
        <!-- Lista -->
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:14px 18px; border-bottom:1px solid var(--border-color); font-weight:700; color:var(--secondary);">
            Tickets ({{ adminTickets.length }})
          </div>
          <p v-if="!adminTickets.length" style="padding:24px; text-align:center; color:var(--text-gray);">Nenhum ticket.</p>
          <ul v-else style="list-style:none; margin:0; padding:0; max-height:60vh; overflow-y:auto;">
            <li v-for="t in adminTickets" :key="t.id"
              :class="['ticket-row', { active: currentTicket && currentTicket.id === t.id }]"
              @click="openAdminTicket(t.id)">
              <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">{{ t.title }}</strong>
                <span style="font-size:12px; color:var(--text-gray);">{{ t.user }} • {{ fmtTicketDate(t.updatedAt) }}</span>
              </div>
              <span :class="['badge', TICKET_STATUS_CLASS[t.status] || 'badge-muted']">{{ t.statusLabel }}</span>
            </li>
          </ul>
        </div>

        <!-- Chat -->
        <div class="card" style="display:flex; flex-direction:column;">
          <div v-if="!currentTicket" style="margin:auto; color:var(--text-gray); text-align:center; padding:40px;">
            Selecione um ticket para ver a conversa.
          </div>
          <template v-else>
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:12px; flex-wrap:wrap;">
              <div>
                <strong>{{ currentTicket.title }}</strong>
                <span :class="['badge', TICKET_STATUS_CLASS[currentTicket.status] || 'badge-muted']" style="margin-left:8px;">{{ currentTicket.statusLabel }}</span>
                <div style="font-size:12px; color:var(--text-gray);">{{ currentTicket.user }}</div>
              </div>
              <button v-if="currentTicket.status !== 'fechado'" class="btn btn-outline btn-sm text-red" @click="setTicketStatus('fechado')">
                <i class="ph ph-x-circle"></i> Fechar
              </button>
            </div>

            <div class="ticket-thread">
              <div v-for="m in currentTicket.messages" :key="m.id" :class="['t-msg', m.senderRole === 'admin' ? 'from-admin' : 'from-user']">
                <div class="t-bubble">
                  <span class="t-who">{{ m.senderRole === 'admin' ? 'Suporte' : currentTicket.user }}</span>
                  <p v-if="m.body">{{ m.body }}</p>
                  <a v-if="m.image && isImageUrl(m.image)" :href="m.image" target="_blank"><img :src="m.image" class="t-img" alt="Anexo" /></a>
                  <a v-else-if="m.image" :href="m.image" target="_blank" style="display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--secondary); margin-top:6px;"><i class="ph ph-paperclip"></i> Ver anexo</a>
                  <span class="t-time">{{ fmtTicketDate(m.createdAt) }}</span>
                </div>
              </div>
            </div>

            <div v-if="currentTicket.status !== 'fechado'" style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:12px;">
              <textarea v-model="ticketReply.body" class="form-control" rows="2" placeholder="Responder..."></textarea>
              <div style="display:flex; gap:8px; justify-content:flex-end; align-items:center; margin-top:8px;">
                <label class="btn btn-outline btn-sm" style="cursor:pointer;">
                  <i class="ph ph-paperclip"></i><span v-if="ticketReply.image"> 1</span>
                  <input type="file" accept="image/*,application/pdf" hidden @change="e => ticketUpload(e.target.files[0])" />
                </label>
                <button class="btn btn-secondary btn-sm" :disabled="ticketLoading" @click="replyTicket">Enviar resposta</button>
              </div>
            </div>
            <p v-else style="text-align:center; color:var(--text-gray); font-size:13px; margin-top:12px;">Ticket fechado.</p>
          </template>
        </div>
      </div>
    </div>

    <!-- ABA 4: CHAT AO VIVO -->
    <div v-if="activeAdminTab === 'chat'" class="tab-content-admin">
      <div class="tickets-admin-grid">
        <!-- Conversas -->
        <div class="card" style="padding:0; overflow:hidden;">
          <div style="padding:14px 18px; border-bottom:1px solid var(--border-color); font-weight:700; color:var(--secondary);">
            Conversas ({{ chatConvs.length }})
          </div>
          <p v-if="!chatConvs.length" style="padding:24px; text-align:center; color:var(--text-gray);">Nenhuma conversa.</p>
          <ul v-else style="list-style:none; margin:0; padding:0; max-height:60vh; overflow-y:auto;">
            <li v-for="c in chatConvs" :key="c.id"
              :class="['ticket-row', { active: chatCurrent && (chatCurrent.conversation?.id === c.id || chatCurrent.id === c.id) }]"
              @click="openChatConv(c.id)">
              <div style="display:flex; flex-direction:column; gap:2px; min-width:0;">
                <strong style="font-size:14px;">{{ c.user || c.userName || 'Usuário' }}
                  <span :class="['chat-status-pill', c.status === 'fechado' ? 'fechado' : 'aberto']">{{ c.status === 'fechado' ? 'Fechado' : 'Aberto' }}</span>
                </strong>
                <span style="font-size:12px; color:var(--text-gray); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:220px;">{{ c.lastMessage || 'Sem mensagens' }}</span>
              </div>
              <span v-if="c.unreadForAdmin > 0" class="chat-unread">{{ c.unreadForAdmin }}</span>
            </li>
          </ul>
        </div>

        <!-- Conversa aberta -->
        <div class="card" style="display:flex; flex-direction:column;">
          <div v-if="!chatCurrent" style="margin:auto; color:var(--text-gray); text-align:center; padding:40px;">
            Selecione uma conversa.
          </div>
          <template v-else>
            <div style="border-bottom:1px solid var(--border-color); padding-bottom:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
              <strong>{{ chatCurrent.conversation?.user || chatCurrent.conversation?.userName || chatCurrent.user || 'Usuário' }}
                <span :class="['chat-status-pill', (chatCurrent.conversation?.status || chatCurrent.status) === 'fechado' ? 'fechado' : 'aberto']">{{ (chatCurrent.conversation?.status || chatCurrent.status) === 'fechado' ? 'Fechado' : 'Aberto' }}</span>
              </strong>
              <button v-if="(chatCurrent.conversation?.status || chatCurrent.status) !== 'fechado'" class="btn btn-outline" style="padding:6px 12px; font-size:13px;" @click="closeChat">
                <i class="ph ph-x-circle"></i> Encerrar conversa
              </button>
            </div>
            <div ref="chatThread" class="ticket-thread">
              <div v-for="m in (chatCurrent.messages || [])" :key="m.id" :class="['t-msg', m.senderRole === 'admin' ? 'from-admin' : 'from-user']">
                <div class="t-bubble">
                  <span class="t-who">{{ m.senderRole === 'admin' ? 'Suporte' : (chatCurrent.conversation?.user || chatCurrent.user || 'Usuário') }}</span>
                  <p>{{ m.body }}</p>
                  <span class="t-time">{{ fmtChatDate(m.createdAt) }}</span>
                </div>
              </div>
            </div>
            <div v-if="(chatCurrent.conversation?.status || chatCurrent.status) !== 'fechado'" style="display:flex; gap:8px; border-top:1px solid var(--border-color); padding-top:12px; margin-top:12px;">
              <input v-model="chatInput" type="text" class="form-control" placeholder="Responder..." @keyup.enter="sendChat" />
              <button class="btn btn-secondary" @click="sendChat"><i class="ph ph-paper-plane-tilt"></i></button>
            </div>
            <p v-else style="border-top:1px solid var(--border-color); padding-top:12px; margin-top:12px; text-align:center; color:var(--text-gray); font-size:13px;">
              Conversa encerrada. Ela será removida em instantes; se o usuário escrever de novo, abre uma nova conversa.
            </p>
          </template>
        </div>
      </div>
    </div>

    <!-- ABA: SAQUES (PEDIDOS DE RETIRADA DE COMISSÃO) -->
    <div v-if="activeAdminTab === 'saques'" class="tab-content-admin">
      <div class="admin-filters-bar" style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:16px;">
        <div class="metric-card card" style="flex:1; min-width:200px; margin:0;">
          <div class="metric-header">
            <i class="ph ph-clock" style="color:#d97706; background:#fffbeb; border:1px solid #fde68a; padding:8px; border-radius:var(--radius-sm); font-size:20px;"></i>
            <span style="font-weight:700; color:#92400e;">PENDENTE DE PAGAMENTO</span>
          </div>
          <h3 style="color:#d97706;">R$ {{ money(withdrawalsPendingTotal) }}</h3>
          <p>{{ withdrawalsPendingCount }} pedido(s) aguardando baixa</p>
        </div>

        <div style="display:flex; gap:8px; align-items:center;">
          <select v-model="withdrawalsStatusFilter" class="form-control" style="width:auto; min-width:140px;">
            <option value="">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="pago">Pagos</option>
          </select>
          <select v-model.number="withdrawalsLimit" class="form-control" style="width:auto; min-width:75px;">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
          <button class="btn btn-outline" @click="loadWithdrawals()" :disabled="withdrawalsLoading">
            <i class="ph ph-arrow-clockwise"></i> Atualizar
          </button>
        </div>
      </div>

      <div class="card" style="padding: 0; overflow-x: auto;">
        <table class="admin-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Usuário</th>
              <th>CPF</th>
              <th>Chave PIX</th>
              <th>Valor</th>
              <th>Solicitado em</th>
              <th>Pago em</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in withdrawals" :key="w.id">
              <td><strong>#{{ w.id }}</strong></td>
              <td>
                <div class="user-info-col">
                  <strong>{{ w.user?.name || '—' }}</strong>
                  <span>{{ w.user?.email || '' }}</span>
                </div>
              </td>
              <td>{{ w.user?.cpf || '—' }}</td>
              <td>
                <div v-if="w.pixKey" style="display:flex; align-items:center; gap:6px;">
                  <div class="user-info-col">
                    <strong style="font-family: monospace; font-size:12px;">{{ w.pixKey }}</strong>
                    <span>{{ w.pixKeyTypeLabel }}</span>
                  </div>
                  <button
                    class="btn-pagination-nav"
                    style="padding:4px 8px;"
                    :title="'Copiar chave PIX'"
                    @click="copyPixKey(w.pixKey)"
                  >
                    <i class="ph ph-copy"></i>
                  </button>
                </div>
                <span v-else class="text-gray">—</span>
              </td>
              <td style="font-weight:bold; color:#16a34a;">{{ w.amountLabel }}</td>
              <td>{{ formatDateTime(w.createdAt) }}</td>
              <td>{{ w.paidAt ? formatDateTime(w.paidAt) : '—' }}</td>
              <td>
                <span :class="['status-pill', w.status === 'pago' ? 'ativo' : 'pendente']">
                  {{ w.status === 'pago' ? 'Pago' : 'Pendente' }}
                </span>
              </td>
              <td>
                <button
                  v-if="w.status === 'pendente'"
                  class="btn btn-primary"
                  style="padding: 6px 12px; font-size: 12px;"
                  :disabled="withdrawalPayingId === w.id"
                  @click="payWithdrawal(w)"
                >
                  <i v-if="withdrawalPayingId === w.id" class="mini-spinner"></i>
                  <i v-else class="ph ph-check-circle"></i>
                  {{ withdrawalPayingId === w.id ? 'Dando baixa...' : 'Dar baixa' }}
                </button>
                <span v-else class="text-gray" style="font-size:11px;">Liberado</span>
              </td>
            </tr>
            <tr v-if="!withdrawalsLoading && withdrawals.length === 0">
              <td colspan="9" style="text-align:center; padding:32px 16px; color:var(--text-gray);">
                <i class="ph ph-hand-coins" style="font-size:32px; display:block; margin-bottom:8px; opacity:0.5;"></i>
                Nenhum pedido de saque encontrado.
              </td>
            </tr>
            <tr v-if="withdrawalsLoading">
              <td colspan="9" style="text-align:center; padding:32px 16px; color:var(--text-gray);">Carregando...</td>
            </tr>
          </tbody>
        </table>

        <div v-if="withdrawalsTotal > 0" class="table-pagination-footer">
          <div class="pagination-info">
            Mostrando <strong>{{ withdrawals.length }}</strong> de <strong>{{ withdrawalsTotal }}</strong> pedidos
          </div>
          <div class="pagination-actions">
            <button class="btn-pagination-nav" :disabled="withdrawalsPage <= 1" @click="goWithdrawalsPage(1)" title="Primeira Página">
              <i class="ph ph-caret-double-left"></i>
            </button>
            <button class="btn-pagination-nav" :disabled="withdrawalsPage <= 1" @click="goWithdrawalsPage(withdrawalsPage - 1)" title="Página Anterior">
              <i class="ph ph-caret-left"></i> Anterior
            </button>
            <div class="pagination-pages">
              <button
                v-for="page in withdrawalsTotalPages"
                :key="page"
                :class="['btn-page-number', { active: page === withdrawalsPage }]"
                @click="goWithdrawalsPage(page)"
              >
                {{ page }}
              </button>
            </div>
            <button class="btn-pagination-nav" :disabled="withdrawalsPage >= withdrawalsTotalPages" @click="goWithdrawalsPage(withdrawalsPage + 1)" title="Próxima Página">
              Próxima <i class="ph ph-caret-right"></i>
            </button>
            <button class="btn-pagination-nav" :disabled="withdrawalsPage >= withdrawalsTotalPages" @click="goWithdrawalsPage(withdrawalsTotalPages)" title="Última Página">
              <i class="ph ph-caret-double-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ABA 5: VIVA MAIS TEEN (GESTÃO DE IDIOMAS, MÓDULOS, AULAS & MATERIAIS) -->
    <div v-if="activeAdminTab === 'teen'" class="tab-content-admin">
      <TeenAdminView 
        :layoutMode="layoutMode" 
        :embedded="false" 
        @triggerDevModal="(d) => emit('triggerDevModal', d)" 
      />
    </div>

    <!-- MODAL 1: CADASTRAR USUÁRIO -->
    <div v-if="showRegisterModal" class="custom-modal-overlay" @click.self="showRegisterModal = false">
      <div class="custom-modal-card modal-large">
        <div class="modal-header-container">
          <h3><i class="ph ph-user-plus"></i> Novo Cadastro</h3>
          <button class="btn-close-modal" @click="showRegisterModal = false">✕</button>
        </div>

        <div class="modal-grid-content">
          <form @submit.prevent="registerUser" class="admin-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome Completo</label>
                <input v-model="newUser.name" type="text" placeholder="Ex: Maria Oliveira" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">E-mail</label>
                <input v-model="newUser.email" type="email" placeholder="Ex: maria@email.com" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">CPF</label>
                <input v-model="newUser.cpf" type="text" placeholder="Ex: 000.000.000-00" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">Plano Comercial</label>
                <select v-model="newUser.plan" class="form-control">
                  <option value="Individual">Individual (Comissão R$ {{ money(config.planIndividualMmn) }})</option>
                  <option value="Família">Família (Comissão R$ {{ money(config.planFamilyMmn) }})</option>
                  <option value="Viva Mais Premium">Viva Mais Premium (Comissão R$ {{ money(mmnForPlan('Viva Mais Premium')) }})</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Celular</label>
                <input v-model="newUser.phone" type="tel" placeholder="(00) 00000-0000" class="form-control" />
              </div>
              <div class="form-group">
                <label class="form-label">Data de Nascimento</label>
                <input v-model="newUser.birthDate" type="date" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Sexo</label>
                <select v-model="newUser.gender" class="form-control" required>
                  <option value="" disabled>Selecione</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMININO">Feminino</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">CEP</label>
                <input v-model="newUser.zipCode" @input="onNewUserCep" type="text" placeholder="00000-000" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Endereço (rua e número)</label>
                <input v-model="newUser.address" type="text" placeholder="Rua Exemplo, 123" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">Bairro</label>
                <input v-model="newUser.neighborhood" type="text" placeholder="Bairro" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Complemento (opcional)</label>
                <input v-model="newUser.complement" type="text" placeholder="Apto, bloco..." class="form-control" />
              </div>
              <div class="form-group">
                <label class="form-label">Cidade</label>
                <input v-model="newUser.city" type="text" placeholder="Cidade" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Estado</label>
                <select v-model="newUser.state" class="form-control" required>
                  <option value="" disabled>UF</option>
                  <option v-for="uf in BRAZIL_STATES" :key="uf" :value="uf">{{ uf }}</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nível no Programa de Afiliados</label>
                <select v-model="newUser.level" class="form-control">
                  <option value="Sem Nível (Diretor)">Sem Nível (Diretor Comercial)</option>
                  <option value="1º Nível">1º Nível (Indicação Direta)</option>
                  <option value="2º Nível">2º Nível</option>
                  <option value="3º Nível">3º Nível</option>
                  <option value="4º Nível">4º Nível</option>
                  <option value="5º Nível">5º Nível</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Indicado Por (Quem o trouxe)</label>
                <select v-model="newUser.referredBy" class="form-control">
                  <option value="Nenhum">Nenhum (Direto da empresa)</option>
                  <option v-for="u in users" :key="u.id" :value="u.name">{{ u.name }}</option>
                </select>
              </div>
            </div>

            <h4 style="margin: 20px 0 10px; color: var(--secondary);">Módulos e Benefícios Ativos</h4>
            <div class="access-checklist scrollable-checklist">
              <label class="checklist-item">
                <input type="checkbox" v-model="newUser.access.health" />
                <div class="checklist-content">
                  <span class="checklist-title">Telemedicina</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.health.price) }}/mês</span>
                </div>
              </label>

              <label class="checklist-item">
                <input type="checkbox" v-model="newUser.access.clube" />
                <div class="checklist-content">
                  <span class="checklist-title">Clube de Descontos</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.clube.price) }}/mês</span>
                </div>
              </label>

              <label class="checklist-item">
                <input type="checkbox" v-model="newUser.access.pet" />
                <div class="checklist-content">
                  <span class="checklist-title">Veterinário (Pet)</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.pet.price) }}/mês</span>
                </div>
              </label>

            </div>

            <button type="submit" class="btn btn-secondary btn-full" style="margin-top: 20px;">
              <i class="ph ph-user-plus"></i> Salvar e Cadastrar
            </button>
          </form>

          <!-- Precificação ao lado -->
          <div class="modal-price-aside">
            <h4>Resumo do Preço</h4>
            <div class="price-summary-list">
              <div class="summary-row">
                <span>Preço do Plano Base</span>
                <strong>
                  R$ {{ basePriceForPlan(newUser.plan).toFixed(2) }}
                </strong>
              </div>
              <div v-if="newUser.access.health" class="summary-row">
                <span>+ Telemedicina</span>
                <strong>R$ {{ money(config.modules.health.price) }}</strong>
              </div>
              <div v-if="newUser.access.clube" class="summary-row">
                <span>+ Clube</span>
                <strong>R$ {{ money(config.modules.clube.price) }}</strong>
              </div>
              <div v-if="newUser.access.pet" class="summary-row">
                <span>+ Pet</span>
                <strong>R$ {{ money(config.modules.pet.price) }}</strong>
              </div>
            </div>
            <div class="total-price-badge">
              <span style="font-size: 11px; color: var(--text-gray);">Total Mensal</span>
              <strong>R$ {{ newUserPrice.toFixed(2) }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 2: CONFIGURAÇÃO DE REGRAS E COMISSÕES -->
    <div v-if="showConfigModal" class="custom-modal-overlay" @click.self="showConfigModal = false">
      <div class="custom-modal-card modal-large">
        <div class="modal-header-container">
          <h3><i class="ph ph-sliders"></i> Regras de Preços & Comissões</h3>
          <button class="btn-close-modal" @click="showConfigModal = false">✕</button>
        </div>

        <div class="modal-grid-content two-columns">
          <!-- Coluna 1: Preços dos Módulos -->
          <div class="rules-col-box">
            <h4>Preços dos Módulos Adicionais</h4>
            <form @submit.prevent="saveRules" class="admin-form">
              <div class="form-group">
                <label class="form-label">Telemedicina</label>
                <div class="input-icon-wrapper">
                  <span class="currency-prefix">R$</span>
                  <input v-model.number="config.modules.health.price" type="number" step="0.01" class="form-control with-icon" style="padding-left: 36px;" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Clube de Descontos</label>
                <div class="input-icon-wrapper">
                  <span class="currency-prefix">R$</span>
                  <input v-model.number="config.modules.clube.price" type="number" step="0.01" class="form-control with-icon" style="padding-left: 36px;" />
                </div>
              </div>
              <div class="form-group">
                <label class="form-label">Veterinário (Pet)</label>
                <div class="input-icon-wrapper">
                  <span class="currency-prefix">R$</span>
                  <input v-model.number="config.modules.pet.price" type="number" step="0.01" class="form-control with-icon" style="padding-left: 36px;" />
                </div>
              </div>
            </form>
          </div>

          <!-- Coluna 2: Preços e Comissões dos Planos -->
          <div class="rules-col-box">
            <h4>Preços & Comissões dos Planos</h4>
            <form @submit.prevent="saveRules" class="admin-form">
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Individual - Preço</label>
                  <input v-model.number="config.planIndividualPrice" type="number" step="0.01" class="form-control" />
                </div>
                <div class="form-group">
                  <label class="form-label">Individual - Comissão</label>
                  <input v-model.number="config.planIndividualMmn" type="number" step="0.01" class="form-control" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Familiar - Preço</label>
                  <input v-model.number="config.planFamilyPrice" type="number" step="0.01" class="form-control" />
                </div>
                <div class="form-group">
                  <label class="form-label">Familiar - Comissão</label>
                  <input v-model.number="config.planFamilyMmn" type="number" step="0.01" class="form-control" />
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Premium - Preço</label>
                  <input v-model.number="config.planPremiumPrice" type="number" step="0.01" class="form-control" />
                </div>
                <div class="form-group">
                  <label class="form-label">Premium - Comissão</label>
                  <input v-model.number="config.planPremiumMmn" type="number" step="0.01" class="form-control" />
                </div>
              </div>
              <h5 style="margin: 10px 0 5px; color: var(--secondary);">Limite de Dependentes por Plano</h5>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                <div class="form-group">
                  <label class="form-label" style="font-size: 10px; text-align: center;">Individual</label>
                  <input v-model.number="config.planIndividualDependents" type="number" min="0" class="form-control" style="padding: 4px; text-align: center;" />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size: 10px; text-align: center;">Familiar</label>
                  <input v-model.number="config.planFamilyDependents" type="number" min="0" class="form-control" style="padding: 4px; text-align: center;" />
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size: 10px; text-align: center;">Premium</label>
                  <input v-model.number="config.planPremiumDependents" type="number" min="0" class="form-control" style="padding: 4px; text-align: center;" />
                </div>
              </div>
              <h5 style="margin: 10px 0 5px; color: var(--secondary);">Percentuais de Distribuição (5 Níveis)</h5>
              <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px;">
                <div v-for="(pct, idx) in config.percentages" :key="idx" class="form-group">
                  <label class="form-label" style="font-size: 10px; text-align: center;">Nível {{ idx + 1 }} (%)</label>
                  <input v-model.number="config.percentages[idx]" type="number" class="form-control" style="padding: 4px; text-align: center;" />
                </div>
              </div>
            </form>
          </div>
        </div>

        <!-- Tabelas demonstrativas das comissões idênticas às imagens -->
        <h4 style="margin: 24px 0 12px; color: var(--secondary); text-align: center;">Demonstrativo de Comissão por Nível</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Tabela Familiar -->
          <div class="rules-col-box">
            <h5 style="margin: 0 0 10px; color: var(--secondary); text-align: center; font-size: 14px;">Plano Familiar (Comissão: R$ {{ money(config.planFamilyMmn) }})</h5>
            <table class="admin-table mini-table">
              <thead>
                <tr>
                  <th style="padding: 8px;">Nível</th>
                  <th style="padding: 8px;">%</th>
                  <th style="padding: 8px;">Familiar R$/pessoa</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(pct, idx) in config.percentages" :key="idx">
                  <td style="padding: 8px;"><strong>{{ idx + 1 }}</strong></td>
                  <td style="padding: 8px;">{{ pct }}%</td>
                  <td style="padding: 8px; font-weight: bold; color: #16a34a;">R$ {{ money(n(config.planFamilyMmn) * n(pct) / 100) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Tabela Individual -->
          <div class="rules-col-box">
            <h5 style="margin: 0 0 10px; color: var(--secondary); text-align: center; font-size: 14px;">Plano Individual (Comissão: R$ {{ money(config.planIndividualMmn) }})</h5>
            <table class="admin-table mini-table">
              <thead>
                <tr>
                  <th style="padding: 8px;">Nível</th>
                  <th style="padding: 8px;">%</th>
                  <th style="padding: 8px;">Individual R$/pessoa</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(pct, idx) in config.percentages" :key="idx">
                  <td style="padding: 8px;"><strong>{{ idx + 1 }}</strong></td>
                  <td style="padding: 8px;">{{ pct }}%</td>
                  <td style="padding: 8px; font-weight: bold; color: #16a34a;">R$ {{ money(n(config.planIndividualMmn) * n(pct) / 100) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
          <h4 style="margin-bottom: 4px;">Gateway de Pagamento (Veenca)</h4>
          <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">
            Enquanto estiver desligado, o checkout segue no fluxo simulado e nada é cobrado.
          </p>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input v-model="config.veencaPayEnabled" type="checkbox" />
              <span>Ativar cobrança real pelo gateway</span>
            </label>
          </div>

          <div class="form-group">
            <label>Chave pública (x-public-key)</label>
            <input v-model="config.veencaPublicKey" type="text" class="form-control" autocomplete="off" />
          </div>

          <div class="form-group">
            <label>Chave secreta (x-secret-key)</label>
            <input
              v-model="config.veencaSecretKey"
              type="password"
              class="form-control"
              autocomplete="new-password"
              :placeholder="config.veencaSecretKeySet ? 'Chave gravada — deixe vazio para manter' : 'Cole a chave secreta'"
            />
            <small style="color: var(--text-gray);">
              <template v-if="config.veencaSecretKeySet">
                Chave atual termina em <strong>{{ config.veencaSecretKeyLast4 }}</strong>. Digite só para substituir.
              </template>
              <template v-else>Nenhuma chave gravada ainda.</template>
            </small>
          </div>

          <div class="form-group">
            <label>Periodicidade da assinatura</label>
            <select v-model="config.veencaPeriodicityType" class="form-control">
              <option value="DAYS">Diária</option>
              <option value="WEEKS">Semanal</option>
              <option value="MONTHS">Mensal</option>
              <option value="YEARS">Anual</option>
            </select>
            <small style="color: var(--text-gray);">Cobrança a cada 1 período. Padrão: mensal.</small>
          </div>

          <div class="form-group">
            <label>ID do produto Veenca — Individual</label>
            <input v-model="config.veencaProductIndividual" type="text" class="form-control" autocomplete="off" placeholder="ID do produto da assinatura Individual" />
          </div>
          <div class="form-group">
            <label>ID do produto Veenca — Família</label>
            <input v-model="config.veencaProductFamily" type="text" class="form-control" autocomplete="off" placeholder="ID do produto da assinatura Família" />
          </div>
        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
          <h4 style="margin-bottom: 4px;">Pix Automático (Woovi/OpenPix)</h4>
          <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">
            Débito automático de verdade: o cliente autoriza a recorrência uma vez no banco e a mensalidade é debitada sozinha todo mês.
          </p>

          <div class="form-group">
            <label>Gateway ativo para novas assinaturas</label>
            <select v-model="config.activeGateway" class="form-control">
              <option value="veenca">Veenca (PIX por cobrança)</option>
              <option value="woovi">Woovi — Pix Automático (débito automático)</option>
            </select>
            <small style="color: var(--text-gray);">Define qual gateway o checkout usa. Assinaturas já criadas continuam no gateway de origem.</small>
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input v-model="config.wooviEnabled" type="checkbox" />
              <span>Ativar integração Woovi</span>
            </label>
          </div>

          <div class="form-group">
            <label>AppID Woovi</label>
            <input
              v-model="config.wooviAppId"
              type="password"
              class="form-control"
              autocomplete="new-password"
              :placeholder="config.wooviAppIdSet ? 'AppID gravado — deixe vazio para manter' : 'Cole o AppID (Authorization)'"
            />
            <small style="color: var(--text-gray);">
              <template v-if="config.wooviAppIdSet">
                AppID atual termina em <strong>{{ config.wooviAppIdLast4 }}</strong>. Digite só para substituir.
              </template>
              <template v-else>Nenhum AppID gravado ainda.</template>
            </small>
          </div>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input v-model="config.wooviSandbox" type="checkbox" />
              <span>Usar ambiente sandbox (api.woovi-sandbox.com)</span>
            </label>
          </div>
        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
          <h4 style="margin-bottom: 4px;">Cartão de Crédito (Pagar.me)</h4>
          <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">
            Habilita a opção de cartão (assinatura recorrente) em todos os checkouts. O cartão é tokenizado no navegador — o número nunca passa pelo nosso servidor.
          </p>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input v-model="config.pagarmeEnabled" type="checkbox" />
              <span>Ativar pagamento com cartão (Pagar.me)</span>
            </label>
          </div>

          <div class="form-group">
            <label>Public Key (pk_...)</label>
            <input v-model="config.pagarmePublicKey" type="text" class="form-control" autocomplete="off" placeholder="pk_..." />
            <small style="color: var(--text-gray);">Usada no checkout para tokenizar o cartão (não é segredo).</small>
          </div>

          <div class="form-group">
            <label>Secret Key (sk_...)</label>
            <input
              v-model="config.pagarmeSecretKey"
              type="password"
              class="form-control"
              autocomplete="new-password"
              :placeholder="config.pagarmeSecretKeySet ? 'Chave gravada — deixe vazio para manter' : 'Cole a secret key (sk_...)'"
            />
            <small style="color: var(--text-gray);">
              <template v-if="config.pagarmeSecretKeySet">Chave atual termina em <strong>{{ config.pagarmeSecretKeyLast4 }}</strong>. Digite só para substituir.</template>
              <template v-else>Nenhuma chave gravada ainda.</template>
            </small>
          </div>

          <p style="font-size:12px; color:var(--text-gray); background:#fff7ed; border:1px solid #fed7aa; padding:10px 12px; border-radius:8px;">
            <strong>Webhook:</strong> a Pagar.me v5 não permite cadastrar webhook via API. No painel Pagar.me → Configurações → Webhooks, adicione a URL
            <code>https://conta.vivamaisclub.com/api/billing/webhook/pagarme</code> (eventos: charge.paid, charge.payment_failed, subscription.charged). A confirmação também funciona por polling.
          </p>
        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--border-color); padding-top: 24px;">
          <h4 style="margin-bottom: 4px;">Clube de Descontos (Clube Certo)</h4>
          <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">
            Enquanto estiver desligado, a tela de Clube de Descontos mostra o conteúdo padrão.
          </p>

          <div class="form-group" style="margin-bottom: 16px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input v-model="config.clubeCertoEnabled" type="checkbox" />
              <span>Ativar integração Clube Certo</span>
            </label>
          </div>

          <div class="form-group">
            <label>CNPJ da empresa</label>
            <input v-model="config.clubeCertoCnpj" type="text" class="form-control" autocomplete="off" placeholder="Somente números" />
          </div>

          <div class="form-group">
            <label>Senha</label>
            <input
              v-model="config.clubeCertoPassword"
              type="password"
              class="form-control"
              autocomplete="new-password"
              :placeholder="config.clubeCertoPasswordSet ? 'Senha gravada — deixe vazio para manter' : 'Cole a senha'"
            />
            <small style="color: var(--text-gray);">
              <template v-if="config.clubeCertoPasswordSet">Senha gravada. Digite só para substituir.</template>
              <template v-else>Nenhuma senha gravada ainda.</template>
            </small>
          </div>

          <div class="form-group">
            <label>Company ID (cashback — opcional)</label>
            <input v-model="config.clubeCertoCompanyId" type="text" class="form-control" autocomplete="off" />
          </div>
        </div>

        <div style="margin-top: 24px; text-align: right;">
          <button class="btn btn-outline" @click="showConfigModal = false" style="margin-right: 12px;">Cancelar</button>
          <button class="btn btn-secondary" @click="saveRules">Salvar Tudo</button>
        </div>
      </div>
    </div>

    <!-- MODAL 3: VISUALIZAR REDE DE INDICAÇÕES (PIRÂMIDE / ÁRVORE) -->
    <div v-if="showTreeModal" class="custom-modal-overlay" @click.self="showTreeModal = false">
      <div class="custom-modal-card modal-large" style="max-width: 700px;">
        <div class="modal-header-container">
          <h3><i class="ph ph-tree-structure"></i> Rede de Afiliados (Árvore de Indicações)</h3>
          <button class="btn-close-modal" @click="showTreeModal = false">✕</button>
        </div>
        
        <div v-if="selectedTreeUser">
          <div style="background: #faf5ff; border-left: 4px solid #7c3aed; padding: 16px; border-radius: var(--radius-sm); margin-bottom: 24px;">
            <strong style="font-size: 16px; color: #4c1d95;">Usuário Raiz: {{ selectedTreeUser.name }}</strong>
            <div style="font-size: 13px; color: #6b21a8; margin-top: 4px; display:flex; justify-content:space-between;">
              <span>Plano: {{ selectedTreeUser.plan }} • Nível: {{ selectedTreeUser.level }}</span>
              <strong>Total Comissão Recebida: R$ {{ calculateUserCommission(selectedTreeUser).toFixed(2) }}</strong>
            </div>
          </div>
          
          <h4 style="margin-bottom: 12px; color: var(--secondary);">Estrutura Hierárquica (Até 5 Níveis)</h4>
          
          <div class="referral-tree-container" style="background: white; border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; max-height: 400px; overflow-y: auto;">
            <div v-if="getReferralTree(selectedTreeUser.name).length > 0">
              <div v-for="node1 in getReferralTree(selectedTreeUser.name)" :key="node1.name" class="tree-node depth-1">
                <div class="tree-item-box">
                  <span class="tree-badge l1">1º Nível</span>
                  <strong>{{ node1.name }}</strong>
                  <span class="tree-plan-name">({{ node1.plan }})</span>
                  <span :class="['status-pill', node1.status]" style="font-size: 10px; padding: 1px 6px;">{{ node1.status }}</span>
                  <span class="tree-gain-share">+ R$ {{ (mmnForPlan(node1.plan) * config.percentages[0] / 100).toFixed(2) }}</span>
                </div>
                
                <!-- Nível 2 -->
                <div v-if="node1.children.length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                  <div v-for="node2 in node1.children" :key="node2.name" class="tree-node depth-2">
                    <div class="tree-item-box">
                      <span class="tree-badge l2">2º Nível</span>
                      <strong>{{ node2.name }}</strong>
                      <span class="tree-plan-name">({{ node2.plan }})</span>
                      <span :class="['status-pill', node2.status]" style="font-size: 10px; padding: 1px 6px;">{{ node2.status }}</span>
                      <span class="tree-gain-share">+ R$ {{ (mmnForPlan(node2.plan) * config.percentages[1] / 100).toFixed(2) }}</span>
                    </div>
                    
                    <!-- Nível 3 -->
                    <div v-if="node2.children.length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                      <div v-for="node3 in node2.children" :key="node3.name" class="tree-node depth-3">
                        <div class="tree-item-box">
                          <span class="tree-badge l3">3º Nível</span>
                          <strong>{{ node3.name }}</strong>
                          <span class="tree-plan-name">({{ node3.plan }})</span>
                          <span :class="['status-pill', node3.status]" style="font-size: 10px; padding: 1px 6px;">{{ node3.status }}</span>
                          <span class="tree-gain-share">+ R$ {{ (mmnForPlan(node3.plan) * config.percentages[2] / 100).toFixed(2) }}</span>
                        </div>
                        
                        <!-- Nível 4 -->
                        <div v-if="node3.children.length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                          <div v-for="node4 in node3.children" :key="node4.name" class="tree-node depth-4">
                            <div class="tree-item-box">
                              <span class="tree-badge l4">4º Nível</span>
                              <strong>{{ node4.name }}</strong>
                              <span class="tree-plan-name">({{ node4.plan }})</span>
                              <span :class="['status-pill', node4.status]" style="font-size: 10px; padding: 1px 6px;">{{ node4.status }}</span>
                              <span class="tree-gain-share">+ R$ {{ (mmnForPlan(node4.plan) * config.percentages[3] / 100).toFixed(2) }}</span>
                            </div>
                            
                            <!-- Nível 5 -->
                            <div v-if="node4.children.length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                              <div v-for="node5 in node4.children" :key="node5.name" class="tree-node depth-5">
                                <div class="tree-item-box">
                                  <span class="tree-badge l5">5º Nível</span>
                                  <strong>{{ node5.name }}</strong>
                                  <span class="tree-plan-name">({{ node5.plan }})</span>
                                  <span :class="['status-pill', node5.status]" style="font-size: 10px; padding: 1px 6px;">{{ node5.status }}</span>
                                  <span class="tree-gain-share">+ R$ {{ (mmnForPlan(node5.plan) * config.percentages[4] / 100).toFixed(2) }}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else style="text-align: center; color: var(--text-gray); padding: 24px;">
              Este usuário ainda não possui indicações registradas na sua rede de afiliados.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE EDIÇÃO COMPLETO -->
    <div v-if="editingUser" class="custom-modal-overlay" @click.self="editingUser = null">
      <div class="custom-modal-card modal-large">
        <div class="modal-header-container">
          <h3><i class="ph ph-pencil-simple"></i> Editar Usuário</h3>
          <button class="btn-close-modal" @click="editingUser = null">✕</button>
        </div>

        <div class="modal-grid-content">
          <!-- Coluna 1: Campos Cadastrais -->
          <form @submit.prevent="saveEditAccess" class="admin-form">
            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nome Completo</label>
                <input v-model="editingUser.name" type="text" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">E-mail</label>
                <input v-model="editingUser.email" type="email" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">CPF</label>
                <input v-model="editingUser.cpf" type="text" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">Plano Comercial</label>
                <select v-model="editingUser.plan" class="form-control">
                  <option value="Individual">Individual (Comissão R$ {{ money(config.planIndividualMmn) }})</option>
                  <option value="Família">Família (Comissão R$ {{ money(config.planFamilyMmn) }})</option>
                  <option value="Viva Mais Premium">Viva Mais Premium (Comissão R$ {{ money(mmnForPlan('Viva Mais Premium')) }})</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Celular</label>
                <input v-model="editingUser.phone" type="tel" placeholder="(00) 00000-0000" class="form-control" />
              </div>
              <div class="form-group">
                <label class="form-label">Data de Nascimento</label>
                <input v-model="editingUser.birthDate" type="date" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Sexo</label>
                <select v-model="editingUser.gender" class="form-control" required>
                  <option value="" disabled>Selecione</option>
                  <option value="MASCULINO">Masculino</option>
                  <option value="FEMININO">Feminino</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">CEP</label>
                <input v-model="editingUser.zipCode" @input="onEditUserCep" type="text" placeholder="00000-000" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Endereço (rua e número)</label>
                <input v-model="editingUser.address" type="text" placeholder="Rua Exemplo, 123" class="form-control" required />
              </div>
              <div class="form-group">
                <label class="form-label">Bairro</label>
                <input v-model="editingUser.neighborhood" type="text" placeholder="Bairro" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Complemento (opcional)</label>
                <input v-model="editingUser.complement" type="text" placeholder="Apto, bloco..." class="form-control" />
              </div>
              <div class="form-group">
                <label class="form-label">Cidade</label>
                <input v-model="editingUser.city" type="text" placeholder="Cidade" class="form-control" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Estado</label>
                <select v-model="editingUser.state" class="form-control" required>
                  <option value="" disabled>UF</option>
                  <option v-for="uf in BRAZIL_STATES" :key="uf" :value="uf">{{ uf }}</option>
                </select>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label class="form-label">Nível no Programa de Afiliados</label>
                <select v-model="editingUser.level" class="form-control">
                  <option value="Sem Nível (Diretor)">Sem Nível (Diretor Comercial)</option>
                  <option value="1º Nível">1º Nível (Indicação Direta)</option>
                  <option value="2º Nível">2º Nível</option>
                  <option value="3º Nível">3º Nível</option>
                  <option value="4º Nível">4º Nível</option>
                  <option value="5º Nível">5º Nível</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Indicado Por (Quem o trouxe)</label>
                <select v-model="editingUser.referredBy" class="form-control">
                  <option value="Nenhum">Nenhum (Direto da empresa)</option>
                  <option v-for="u in users" :key="u.id" :value="u.name">{{ u.name }}</option>
                </select>
              </div>
            </div>

            <h4 style="margin: 20px 0 10px; color: var(--secondary);">Módulos e Benefícios Ativos</h4>
            <div class="access-checklist scrollable-checklist">
              <label class="checklist-item">
                <input type="checkbox" v-model="editingUser.access.health" />
                <div class="checklist-content">
                  <span class="checklist-title">Telemedicina</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.health.price) }}/mês</span>
                </div>
              </label>

              <label class="checklist-item">
                <input type="checkbox" v-model="editingUser.access.clube" />
                <div class="checklist-content">
                  <span class="checklist-title">Clube de Descontos</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.clube.price) }}/mês</span>
                </div>
              </label>

              <label class="checklist-item">
                <input type="checkbox" v-model="editingUser.access.pet" />
                <div class="checklist-content">
                  <span class="checklist-title">Veterinário (Pet)</span>
                  <span class="checklist-price">+ R$ {{ money(config.modules.pet.price) }}/mês</span>
                </div>
              </label>

            </div>

            <button type="submit" class="btn btn-secondary btn-full" style="margin-top: 20px;">
              <i class="ph ph-floppy-disk"></i> Salvar Alterações
            </button>
          </form>

          <!-- Coluna 2: Precificação ao lado -->
          <div class="modal-price-aside">
            <h4>Resumo da Cobrança</h4>
            <div class="price-summary-list">
              <div class="summary-row">
                <span>Preço do Plano Base</span>
                <strong>
                  R$ {{ basePriceForPlan(editingUser.plan).toFixed(2) }}
                </strong>
              </div>
              <div v-if="editingUser.access.health" class="summary-row">
                <span>+ Telemedicina</span>
                <strong>R$ {{ money(config.modules.health.price) }}</strong>
              </div>
              <div v-if="editingUser.access.clube" class="summary-row">
                <span>+ Clube</span>
                <strong>R$ {{ money(config.modules.clube.price) }}</strong>
              </div>
              <div v-if="editingUser.access.pet" class="summary-row">
                <span>+ Pet</span>
                <strong>R$ {{ money(config.modules.pet.price) }}</strong>
              </div>
            </div>
            <div class="total-price-badge">
              <span style="font-size: 11px; color: var(--text-gray);">Total Calculado</span>
              <strong>R$ {{ calculatePrice(editingUser.access, editingUser.plan).toFixed(2) }}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.admin-panel {
  width: 100%;
}

/* Tickets de suporte (admin) */
.tickets-admin-grid { display: grid; grid-template-columns: 340px 1fr; gap: 20px; align-items: start; }
@media (max-width: 860px) { .tickets-admin-grid { grid-template-columns: 1fr; } }
.ticket-row { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--border-color); cursor:pointer; transition: background .15s; }
.ticket-row:hover { background: var(--bg-gray, #f4f6f8); }
.ticket-row.active { background: var(--primary-light, #e6efff); }
.badge-muted { background:#e5e7eb; color:#6b7280; }
.finance-metrics-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.finance-metric-card {
  text-align: center;
  padding: 14px 10px;
  min-width: 0;
}
.finance-metric-card strong,
.finance-metric-card small,
.finance-metric-card span {
  overflow-wrap: anywhere;
}
@media (max-width: 1180px) {
  .finance-metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .finance-metrics-grid {
    grid-template-columns: 1fr;
  }
}
.ticket-thread { display:flex; flex-direction:column; gap:12px; max-height:52vh; overflow-y:auto; padding:4px; }
.t-msg { display:flex; }
.t-msg.from-admin { justify-content:flex-end; }
.t-bubble { max-width:78%; padding:10px 14px; border-radius:12px; background: var(--bg-gray,#f1f5f9); }
.from-admin .t-bubble { background: var(--primary-light,#e6efff); }
.t-who { font-size:11px; font-weight:700; color:var(--secondary); display:block; margin-bottom:2px; }
.t-bubble p { margin:0; font-size:14px; color:var(--text-dark); white-space:pre-wrap; }
.t-img { max-width:220px; border-radius:8px; margin-top:8px; display:block; }
.t-time { font-size:10px; color:var(--text-gray); display:block; margin-top:4px; text-align:right; }
.chat-unread { background:var(--primary); color:#fff; font-size:11px; font-weight:700; min-width:20px; height:20px; border-radius:10px; display:inline-flex; align-items:center; justify-content:center; padding:0 6px; }
.chat-nav-dot { display:inline-block; width:9px; height:9px; border-radius:50%; background:var(--primary); margin-left:6px; }

.admin-badge {
  background: var(--primary-light);
  color: var(--secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  display: inline-block;
  margin-bottom: 12px;
}

.admin-header {
  background: var(--bg-white);
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.action-buttons-header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: auto;
}

.action-buttons-header .btn {
  width: 100%;
  text-align: center;
  justify-content: center;
}

/* Navegação de Abas do Admin */
.admin-tabs-nav {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0;
}

.admin-tab-btn {
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-gray);
  padding: 10px 16px 12px 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: var(--transition);
}

.admin-tab-btn.active {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}

.admin-tab-btn:hover {
  color: var(--secondary);
}

/* Tabela de Usuários */
.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.admin-table th {
  background: #f8fafc;
  padding: 14px 16px;
  text-align: left;
  font-weight: 600;
  color: var(--secondary);
  border-bottom: 1px solid var(--border-color);
}

.admin-table td {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}

.user-info-col {
  display: flex;
  flex-direction: column;
}

.user-info-col strong {
  color: var(--text-dark);
  font-size: 14px;
}

.user-info-col span {
  font-size: 11px;
  color: var(--text-gray);
  margin-top: 2px;
}

.badge-level {
  background: #f1f5f9;
  color: var(--text-dark);
  border: 1px solid var(--border-color);
  font-weight: 500;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.referred-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-dark);
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}

.modules-badges {
  display: flex;
  gap: 6px;
}

.module-badge-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  color: #94a3b8;
  font-size: 14px;
  transition: var(--transition);
}

.module-badge-icon.active {
  background: #dcfce7 !important;
  color: #16a34a !important;
}

.price-col {
  font-weight: 700;
  color: var(--secondary);
}

.status-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  text-transform: capitalize;
}

.status-pill.ativo {
  background: #dcfce7;
  color: #15803d;
}

.status-pill.pendente {
  background: #fef3c7;
  color: #d97706;
}

.status-pill.inativo {
  background: #fee2e2;
  color: #b91c1c;
}

.chat-status-pill {
  display: inline-block; font-size: 10px; font-weight: 700;
  padding: 1px 7px; border-radius: var(--radius-full); margin-left: 6px; vertical-align: middle;
}
.chat-status-pill.aberto { background: #dcfce7; color: #15803d; }
.chat-status-pill.fechado { background: #fee2e2; color: #b91c1c; }

.actions-buttons {
  display: flex;
  gap: 8px;
}

.btn-action-edit, .btn-action-delete {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  transition: var(--transition);
  font-size: 16px;
}

.btn-action-edit {
  color: var(--primary);
}

.btn-action-edit:hover {
  background: var(--primary-light);
}

.btn-action-delete {
  color: #ef4444;
}

.btn-action-delete:hover {
  background: #fee2e2;
}

/* Modais Específicos */
.modal-large {
  max-width: 850px !important;
  width: 90% !important;
  max-height: 90vh;
  overflow-y: auto;
  padding: 24px !important;
}

.modal-header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 14px;
  margin-bottom: 20px;
}

.modal-header-container h3 {
  color: var(--secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}

.btn-close-modal {
  background: transparent;
  border: none;
  font-size: 20px;
  color: var(--text-gray);
  cursor: pointer;
  transition: var(--transition);
}

.btn-close-modal:hover {
  color: #ef4444;
}

.modal-grid-content {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

.modal-grid-content.two-columns {
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 768px) {
  .modal-grid-content, .modal-grid-content.two-columns {
    grid-template-columns: 1fr;
  }
}

.modal-price-aside {
  background: var(--primary-light);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.modal-price-aside h4 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--secondary);
}

.total-price-badge {
  border-top: 2px dashed var(--border-color);
  padding-top: 16px;
  margin-top: 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
}

.total-price-badge strong {
  font-size: 28px;
  color: var(--secondary);
}

.rules-col-box {
  background: #f8fafc;
  padding: 16px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
}

.rules-col-box h4 {
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--secondary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.mini-table {
  font-size: 12px;
}

.mini-table th {
  padding: 8px 12px;
}

.mini-table td {
  padding: 8px 12px;
}

/* Árvore Hierárquica de Indicações style */
.referral-tree-container {
  font-family: inherit;
}

.tree-node {
  margin-bottom: 12px;
  transition: var(--transition);
}

.tree-item-box {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: #f8fafc;
  border: 1px solid var(--border-color);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-dark);
}

.tree-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  color: white;
}

.tree-badge.l1 { background: #3b82f6; }
.tree-badge.l2 { background: #8b5cf6; }
.tree-badge.l3 { background: #ec4899; }
.tree-badge.l4 { background: #f59e0b; }
.tree-badge.l5 { background: #10b981; }

.tree-plan-name {
  font-size: 11px;
  color: var(--text-gray);
}

.tree-gain-share {
  font-weight: 700;
  color: #16a34a;
  margin-left: 8px;
}

/* Formulário e Checklist */
.admin-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

@media (max-width: 576px) {
  .form-row {
    grid-template-columns: 1fr;
  }
}

.access-checklist {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 576px) {
  .access-checklist {
    grid-template-columns: 1fr;
  }
}

.checklist-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: var(--transition);
}

.checklist-item:hover {
  background: #fafafa;
  border-color: #cbd5e1;
}

.checklist-item input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--secondary);
}

.checklist-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.checklist-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dark);
}

.checklist-price {
  font-size: 10px;
  color: var(--text-gray);
}

.price-summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-dark);
}

.summary-row span {
  color: var(--text-gray);
}

.input-icon-wrapper {
  position: relative;
  width: 100%;
}

.currency-prefix {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  font-weight: 600;
  color: var(--text-gray);
  z-index: 5;
}

/* LISTAGEM MOBILE (Cards) */
.admin-content-mobile {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mobile-user-card {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mobile-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.mobile-card-title {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.mobile-card-title strong {
  font-size: 15px;
  color: var(--text-dark);
}

.mobile-card-title span {
  font-size: 11px;
  color: var(--text-gray);
}

.mobile-card-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding-bottom: 6px;
  border-bottom: 1px dashed #f1f5f9;
}

.detail-row .label {
  color: var(--text-gray);
  font-weight: 500;
}

.mobile-card-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

/* Alinhamento dos modais e inputs */
.custom-modal-card {
  text-align: left !important;
}

.form-label {
  text-align: left !important;
  display: block;
}

.form-control {
  text-align: left !important;
}
</style>
