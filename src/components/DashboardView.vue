<script setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import QRCode from 'qrcode'
import { api, lookupCep, tokenizeCard } from '../services/api'

// Converte "MM/AA" (ou "MM/AAAA") em { exp_month, exp_year } p/ a Pagar.me.
function parseExpiry(raw) {
  const d = (raw || '').replace(/\D/g, '')
  const mm = d.slice(0, 2)
  const yy = d.slice(2)
  const year = yy.length === 2 ? `20${yy}` : yy.slice(0, 4)
  return { exp_month: Number(mm), exp_year: Number(year) }
}

// Gera um QR Code (dataURL) a partir do código PIX copia-e-cola.
const genQr = async (code) => {
  if (!code) return ''
  try {
    return await QRCode.toDataURL(code, { margin: 1, width: 220 })
  } catch {
    return ''
  }
}

// Polling de status de um lançamento: chama onPaid quando confirmar (webhook/reconsulta).
// Retorna função pra cancelar. Timeout ~10min (150 x 4s).
const pollTransaction = (txId, { onPaid, onCancelled } = {}) => {
  let tries = 0
  const timer = setInterval(async () => {
    tries += 1
    try {
      const { status } = await api.get(`/billing/transaction/${txId}/status`)
      if (status === 'paid') { clearInterval(timer); onPaid && onPaid() }
      else if (status === 'cancelled') { clearInterval(timer); onCancelled && onCancelled() }
    } catch { /* ignora falha de rede pontual, continua tentando */ }
    if (tries >= 150) clearInterval(timer)
  }, 4000)
  return () => clearInterval(timer)
}

const activePolls = []
const stopAllPolls = () => { while (activePolls.length) { const s = activePolls.pop(); s && s() } }
onUnmounted(stopAllPolls)

const SSO_BENEFIT_SLUGS = {
  'Telemedicina': 'telehealth',
  'Veterinário 24h': 'veterinario-24h',
  'Clube de Descontos': 'clube-descontos',
}

// Pet (Veterinário) não tem API/SSO — o usuário faz login direto no portal do parceiro.
const PET_PORTAL_URL = 'https://pet.consultastelemedicina.com.br/login_n'

function resolveBenefitSlug(title) {
  const key = Object.keys(SSO_BENEFIT_SLUGS).find((label) => title.includes(label))
  return key ? SSO_BENEFIT_SLUGS[key] : null
}

const props = defineProps({
  user: {
    type: Object,
    required: true
  },
  layoutMode: {
    type: String,
    default: 'desktop'
  },
  currentTab: {
    type: String,
    default: 'home'
  },
  activeRefTab: {
    type: String,
    default: 'visaoGeral'
  }
})

const emit = defineEmits(['updateUser', 'logout', 'triggerDevModal', 'changeTab', 'changeRefTab'])

// Carrossel Contínuo
const activeSlide = ref(0)
const DEFAULT_SLIDES = [
  {
    tag: 'SAÚDE',
    title: 'Consultas de Telemedicina 24h',
    description: 'Fale com um médico a qualquer hora, sem sair de casa.',
    image: '/telemedicina-banner.png',
    benefit: 'Telemedicina'
  },
  {
    tag: 'PET',
    title: 'Consultas Veterinárias 24h',
    description: 'Fale com um veterinário a qualquer hora, sem sair de casa.',
    image: '/pet-banner.png',
    benefit: 'Veterinário 24h'
  },
  {
    tag: 'ECONOMIA',
    title: 'Clube de Descontos Exclusivo',
    description: 'Economize até 50% em farmácias, compras, lazer e parceiros.',
    image: '/clube_banner.png',
    benefit: 'Clube de Descontos'
  },
  {
    tag: 'CONSULTAS & EXAMES',
    title: 'Consultas e Exames',
    description: 'Agende consultas e exames pelo app Nipomed no seu celular.',
    image: '/saude_banner.png',
    benefit: 'Consultas e exames'
  }
]
const slides = ref([...DEFAULT_SLIDES])

const nextSlide = () => {
  if (slides.value.length === 0) return
  activeSlide.value = (activeSlide.value + 1) % slides.value.length
}

const handleSlideAction = (slide) => {
  const benefit = slide.benefit || slide.title || ''
  if (benefit.toLowerCase().includes('consultas') || benefit.toLowerCase().includes('nipomed') || benefit.toLowerCase().includes('exames')) {
    showConsultasModal.value = true
  } else if (benefit.toLowerCase().includes('indicaç') || benefit.toLowerCase().includes('afilia')) {
    emit('changeTab', 'indicacoes')
  } else {
    triggerRedirect(benefit)
  }
}

onMounted(() => {
  setInterval(nextSlide, 6000)
})

// Modais de Redirecionamento
const activeRedirect = ref(null)
const showRedirectModal = ref(false)

// Consultas e exames (app Nipomed) — modal de seleção de plataforma + redirecionamento.
const showConsultasModal = ref(false)
const NIPOMED_STORE = {
  ios: 'https://apps.apple.com/br/app/nipomed/id6741690140',
  android: 'https://play.google.com/store/apps/details?id=com.br.nipomed.mobile&hl=pt_BR',
}
const openNipomedStore = (platform) => {
  const url = NIPOMED_STORE[platform]
  if (!url) return
  showConsultasModal.value = false
  // Abre a loja no clique (gesto do usuário evita bloqueio de popup).
  window.open(url, '_blank', 'noopener')
  emit('triggerDevModal', {
    title: 'Redirecionando…',
    message: `Você está sendo direcionado para a ${platform === 'ios' ? 'App Store' : 'Google Play'} para instalar o app Nipomed (Consultas e Exames).`,
  })
}

// Modal de Seleção de Paciente para Telemedicina
const showTelemedicinaModal = ref(false)
const selectedTelemedTarget = ref('titular')
const telemedLoading = ref(false)

// Só dependentes kids (até 10) ou teen (11-17) aparecem como opção de agendamento.
const telemedDependents = computed(() =>
  (depInfo.value?.dependents || []).filter((d) => d.ageGroup === 'kids' || d.ageGroup === 'teen')
)

const openTelemedicinaSelection = async () => {
  if (!depInfo.value?.dependents) {
    try {
      const d = await api.get('/dependents')
      depInfo.value = d || { limit: 0, used: 0, canAdd: false, dependents: [] }
    } catch {
      // segue
    }
  }

  // Sem dependente kid/teen: agenda direto pro titular, sem exibir o modal de escolha.
  if (telemedDependents.value.length === 0) {
    selectedTelemedTarget.value = 'titular'
    await confirmTelemedicina()
    return
  }

  selectedTelemedTarget.value = 'titular'
  showTelemedicinaModal.value = true
}

const confirmTelemedicina = async () => {
  telemedLoading.value = true
  const win = window.open('about:blank', '_blank')
  try {
    await api.post('/sso/telehealth') // auditoria
  } catch {
    // segue
  }
  try {
    const query = selectedTelemedTarget.value !== 'titular' ? `?dependentId=${selectedTelemedTarget.value}` : ''
    const { redirectUrl } = await api.get(`/telemedicina/sso${query}`)
    showTelemedicinaModal.value = false
    telemedLoading.value = false
    if (win) win.location.href = redirectUrl
    else window.open(redirectUrl, '_blank', 'noopener')
  } catch (err) {
    telemedLoading.value = false
    if (win) win.close()
    emit('triggerDevModal', {
      title: 'Telemedicina',
      message: err?.status === 503
        ? 'Seu acesso à Telemedicina ainda está sendo processado. Tente novamente em alguns minutos.'
        : 'Não foi possível conectar à Telemedicina agora. Tente novamente em instantes.',
    })
  }
}

const triggerRedirect = async (benefitName) => {
  // Bloqueia acesso aos serviços com pagamento pendente ou fatura atrasada.
  if (accessBlocked.value) {
    emit('triggerDevModal', {
      title: 'Acesso bloqueado',
      message: !props.user?.active
        ? 'Seu pagamento ainda está pendente. Ative seu plano para liberar os serviços.'
        : 'Sua fatura está atrasada. Regularize o pagamento para reativar o acesso aos serviços.',
    })
    return
  }

  const slug = resolveBenefitSlug(benefitName)

  // Pet: sem API — manda o usuário direto pro portal de login do parceiro.
  if (slug === 'veterinario-24h') {
    window.open(PET_PORTAL_URL, '_blank', 'noopener')
    return
  }

  // Clube de Descontos: SSO real — abre a aba no clique (evita bloqueio de popup) e
  // navega para o WebApp do Clube Certo (sessão gerada pela URL /webapp/{cpf}/{companyId}).
  if (slug === 'clube-descontos') {
    const win = window.open('about:blank', '_blank')
    try { await api.post(`/sso/${slug}`) } catch { /* auditoria opcional */ }
    try {
      const { url } = await api.get('/clube/access-url')
      if (url) {
        if (win) win.location.href = url
        else window.open(url, '_blank', 'noopener')
        return
      }
      if (win) win.close()
      emit('triggerDevModal', {
        title: 'Clube de Descontos',
        message: 'Seu acesso ao Clube de Descontos ainda está sendo processado. Tente novamente em alguns minutos.',
      })
    } catch {
      if (win) win.close()
      emit('triggerDevModal', { title: 'Clube de Descontos', message: 'Não foi possível abrir o Clube de Descontos agora. Tente novamente.' })
    }
    return
  }

  // Telemedicina abre o modal de seleção do paciente (titular ou dependente)
  if (slug === 'telehealth' || (benefitName && benefitName.toLowerCase().includes('telemedicina'))) {
    openTelemedicinaSelection()
    return
  }

  // Demais benefícios: simulação até haver integração real com o parceiro.
  activeRedirect.value = benefitName
  showRedirectModal.value = true
  try {
    if (slug) await api.post(`/sso/${slug}`)
  } catch {
    // acesso ao benefício segue mesmo se o registro de auditoria falhar
  }
  setTimeout(() => {
    showRedirectModal.value = false
    emit('triggerDevModal', {
      title: 'Redirecionamento Concluído',
      message: `Você foi direcionado de forma segura e autenticada para o portal da ${benefitName}.`
    })
  }, 2000)
}

// Configurações do Perfil
const name = ref(props.user.name)
const email = ref('')
const phone = ref('')
const cpf = ref('')
const memberSince = ref('')
const currentPasswordInput = ref('')
const newPasswordInput = ref('')
// Aba ativa dentro de "Minha Conta": 'basicas' | 'seguranca' | 'endereco'
const profileTab = ref('basicas')

// Endereço (exigido pela cobrança) — configurável em Minha Conta
const address = ref('')
const neighborhood = ref('')
const complement = ref('')
const city = ref('')
const uf = ref('')
const zipCode = ref('')

const loadProfile = async () => {
  try {
    const profile = await api.get('/users/me')
    name.value = profile.name
    email.value = profile.email
    phone.value = profile.phone ?? ''
    cpf.value = profile.cpf
    memberSince.value = profile.memberSince
    address.value = profile.address ?? ''
    neighborhood.value = profile.neighborhood ?? ''
    complement.value = profile.complement ?? ''
    city.value = profile.city ?? ''
    uf.value = profile.state ?? ''
    zipCode.value = profile.zipCode ?? ''
    refCodeInput.value = `${slugify(profile.name)}-${profile.id}`
  } catch {
    name.value = props.user?.name || ''
    email.value = props.user?.email || ''
    phone.value = props.user?.phone || ''
    cpf.value = props.user?.cpf || ''
    memberSince.value = props.user?.memberSince || ''
    refCodeInput.value = props.user?.name ? `${slugify(props.user.name)}-${props.user.id || ''}` : ''
  }
}

const saveProfile = async () => {
  try {
    const updated = await api.patch('/users/me', {
      name: name.value, email: email.value, phone: phone.value,
      address: address.value, neighborhood: neighborhood.value, complement: complement.value,
      city: city.value, state: uf.value, zipCode: zipCode.value,
    })
    emit('updateUser', { ...props.user, name: updated.name, plan: updated.plan, active: updated.active })
    emit('triggerDevModal', {
      title: 'Perfil Salvo',
      message: 'Seus dados de cadastro foram atualizados no sistema!'
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro ao salvar', message: 'Não foi possível atualizar seu perfil agora.' })
  }
}

const changePassword = async () => {
  try {
    await api.post('/users/me/password', {
      currentPassword: currentPasswordInput.value,
      newPassword: newPasswordInput.value,
    })
    currentPasswordInput.value = ''
    newPasswordInput.value = ''
    emit('triggerDevModal', { title: 'Senha Atualizada', message: 'Sua senha de acesso foi modificada com sucesso!' })
  } catch (err) {
    emit('triggerDevModal', {
      title: 'Erro',
      message: err.status === 409 ? 'Senha atual incorreta.' : 'Não foi possível atualizar a senha.',
    })
  }
}

// Carteirinha Digital
const showCardModal = ref(false)

// Financeiro
const invoices = ref([])
const billingSummary = ref({ plan: '', monthlyValue: '', nextBillingDate: '' })

// Dias até a próxima cobrança (a partir de nextBillingDate no formato DD/MM/AAAA).
const daysUntilRenewal = computed(() => {
  const s = billingSummary.value.nextBillingDate
  if (!s) return null
  const [d, m, y] = s.split('/').map(Number)
  if (!d || !m || !y) return null
  const due = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((due.getTime() - today.getTime()) / 86400000)
})
// Renovação só aparece a partir de 3 dias antes do vencimento (ou já vencida).
const canRenew = computed(() => daysUntilRenewal.value !== null && daysUntilRenewal.value <= 3)

// Acesso aos serviços bloqueado quando: pagamento pendente (conta não ativa) OU fatura atrasada.
const accessBlocked = computed(() => {
  if (!props.user?.active) return true
  if (daysUntilRenewal.value !== null && daysUntilRenewal.value < 0) return true
  return false
})

// Dependentes (contador/disponibilidade exibido no resumo, em todas as visualizações)
const depInfo = ref({ limit: 0, used: 0, canAdd: false })
const depAvailable = computed(() => depInfo.value.limit > 0)
const depRemaining = computed(() => Math.max(0, depInfo.value.limit - depInfo.value.used))

// Programa de Indicações (Afiliação)
const activeRefTab = ref('visaoGeral')
watch(() => props.activeRefTab, (newVal) => {
  if (newVal) activeRefTab.value = newVal
}, { immediate: true })

const LEVEL_COLORS = {
  '1': { bg: '#ecfdf5', border: '#10b981', text: '#065f46', badge: '#059669' },
  '2': { bg: '#f0f9ff', border: '#0284c7', text: '#075985', badge: '#0284c7' },
  '3': { bg: '#eef2ff', border: '#6366f1', text: '#3730a3', badge: '#4f46e5' },
  '4': { bg: '#f5f3ff', border: '#8b5cf6', text: '#5b21b6', badge: '#7c3aed' },
  '5': { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', badge: '#ea580c' },
}

const getLevelStyle = (lvlStr) => {
  const num = (lvlStr || '').charAt(0)
  return LEVEL_COLORS[num] || LEVEL_COLORS['1']
}

const refSearchName = ref('')
const refStatusFilter = ref('todos')
const refLevelFilter = ref('todos')
const showRefMenuDropdown = ref(false)

// Paginação da Tabela de Indicados
const itemsPerPage = ref(5)
const currentPage = ref(1)

const rawReferrals = ref([])

// Reseta para a primeira página sempre que alterar qualquer filtro ou limite por página
watch([refSearchName, refStatusFilter, refLevelFilter, itemsPerPage], () => {
  currentPage.value = 1
})

const clearRefFilters = () => {
  refSearchName.value = ''
  refStatusFilter.value = 'todos'
  refLevelFilter.value = 'todos'
  itemsPerPage.value = 5
  currentPage.value = 1
}

// Modal de hierarquia da rede (árvore) do próprio usuário.
const showReferralTreeModal = ref(false)
const referralTree = ref(null)
const referralTreeLoading = ref(false)
const openReferralTree = async () => {
  showReferralTreeModal.value = true
  if (referralTree.value) return
  referralTreeLoading.value = true
  try {
    const data = await api.get('/referrals/tree')
    referralTree.value = data || null
  } catch {
    referralTree.value = null
  } finally {
    referralTreeLoading.value = false
  }
}

const filteredReferrals = computed(() => {
  const term = (refSearchName.value || '').trim().toLowerCase()
  return rawReferrals.value.filter(item => {
    const matchSearch = !term ||
      (item.name && item.name.toLowerCase().includes(term)) ||
      (item.email && item.email.toLowerCase().includes(term)) ||
      (item.phone && item.phone.replace(/\D/g, '').includes(term.replace(/\D/g, '')))
    const matchStatus = refStatusFilter.value === 'todos' || item.status === refStatusFilter.value
    const matchLevel = refLevelFilter.value === 'todos' || (item.level && item.level.includes(refLevelFilter.value))
    return matchSearch && matchStatus && matchLevel
  })
})

const totalPages = computed(() => Math.ceil(filteredReferrals.value.length / itemsPerPage.value) || 1)

const paginatedReferrals = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredReferrals.value.slice(start, start + itemsPerPage.value)
})

const paginationInfo = computed(() => {
  const total = filteredReferrals.value.length
  if (total === 0) return { start: 0, end: 0, total: 0 }
  const start = (currentPage.value - 1) * itemsPerPage.value + 1
  const end = Math.min(currentPage.value * itemsPerPage.value, total)
  return { start, end, total }
})

const setPage = (p) => {
  if (p >= 1 && p <= totalPages.value) {
    currentPage.value = p
  }
}

// Árvore achatada (com profundidade) p/ renderizar a hierarquia indentada no modal.
const referralTreeFlat = computed(() => {
  const out = []
  const walk = (node, depth) => {
    if (!node) return
    out.push({ name: node.name, plan: node.plan, level: node.level, depth })
    ;(node.children || []).forEach(c => walk(c, depth + 1))
  }
  if (referralTree.value) walk(referralTree.value, 0)
  return out
})

function parseGain(gain) {
  if (!gain || gain === '-') return 0
  return parseFloat(gain.replace('R$ ', '').replace(/\./g, '').replace(',', '.')) || 0
}

function formatCurrency(value) {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getUserInitials(fullName) {
  if (!fullName) return '?'
  const clean = fullName.trim().replace(/\s+(da|de|do|das|dos|e)\s+/gi, ' ')
  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// Estatísticas do programa de indicações, derivadas 100% dos indicados reais (rawReferrals)
const referralStats = computed(() => {
  const total = rawReferrals.value.length
  const ativos = rawReferrals.value.filter(r => r.status === 'ativo').length
  const ganhosTotais = rawReferrals.value.reduce((sum, r) => sum + parseGain(r.gain), 0)
  const bonusTotal = rawReferrals.value.reduce((sum, r) => sum + parseGain(r.bonus), 0)
  const bonusCount = rawReferrals.value.filter(r => r.bonus).length
  return {
    totalIndicados: total,
    ativos,
    taxaAtivacao: total > 0 ? Math.round((ativos / total) * 100) : 0,
    ganhosTotais,
    bonusTotal,
    bonusCount,
  }
})

// --- SAQUE DE COMISSÕES ---
const withdrawSummary = ref({
  earnedLabel: 'R$ 0,00',
  availableLabel: 'R$ 0,00',
  pendingLabel: 'R$ 0,00',
  paidLabel: 'R$ 0,00',
  available: 0,
  pending: 0,
  minWithdrawal: 20,
  canRequest: false,
  hasPending: false,
  history: [],
})
const withdrawLoading = ref(false)
const showWithdrawModal = ref(false)

const loadWithdrawSummary = async () => {
  try {
    const data = await api.get('/withdrawals/summary')
    if (data) withdrawSummary.value = data
  } catch {
    // mantém o estado atual — o botão fica desabilitado por canRequest = false
  }
}

const openWithdrawModal = () => {
  if (withdrawSummary.value.hasPending) {
    emit('triggerDevModal', {
      title: 'Saque pendente',
      message: `Você já tem um saque de ${withdrawSummary.value.pendingLabel} aguardando liberação. Assim que ele for pago, você poderá solicitar outro.`,
    })
    return
  }
  if (!withdrawSummary.value.canRequest) {
    emit('triggerDevModal', {
      title: 'Saldo insuficiente',
      message: `O valor mínimo para saque é R$ ${Number(withdrawSummary.value.minWithdrawal).toFixed(2).replace('.', ',')}. Seu saldo disponível é ${withdrawSummary.value.availableLabel}.`,
    })
    return
  }
  showWithdrawModal.value = true
}

const confirmWithdraw = async () => {
  withdrawLoading.value = true
  try {
    const data = await api.post('/withdrawals')
    if (data?.summary) withdrawSummary.value = data.summary
    showWithdrawModal.value = false
    emit('triggerDevModal', {
      title: 'Saque solicitado!',
      message: `Seu pedido de ${data?.withdrawal?.amountLabel ?? 'saque'} foi registrado e está pendente de liberação. Você receberá um e-mail assim que o pagamento for realizado.`,
    })
  } catch (err) {
    emit('triggerDevModal', {
      title: 'Não foi possível solicitar',
      message: err?.message || 'Falha ao solicitar o saque. Tente novamente em instantes.',
    })
  } finally {
    withdrawLoading.value = false
  }
}

const REFERRAL_LEVELS = ['1º Nível', '2º Nível', '3º Nível', '4º Nível', '5º Nível']

const levelBreakdown = computed(() => {
  return REFERRAL_LEVELS.map(level => {
    const people = rawReferrals.value.filter(r => r.level === level)
    const ativos = people.filter(r => r.status === 'ativo').length
    const total = people.reduce((sum, r) => sum + parseGain(r.gain), 0)
    return { level, people, count: people.length, ativos, total }
  }).filter(lvl => lvl.count > 0)
})

const latestReferrals = computed(() => {
  return [...rawReferrals.value]
    .sort((a, b) => {
      const [da, ma, ya] = a.date.split('/').map(Number)
      const [db, mb, yb] = b.date.split('/').map(Number)
      return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da)
    })
    .slice(0, 3)
})

const copyLink = (text) => {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
  }
  emit('triggerDevModal', {
    title: 'Link Copiado!',
    message: 'Link de afiliação copiado para sua área de transferência com sucesso.'
  })
}

// Copia texto genérico (PIX copia-e-cola) sem alterar mensagem de link
const copyText = (text) => {
  if (navigator.clipboard) navigator.clipboard.writeText(text)
  emit('triggerDevModal', {
    title: 'Copiado!',
    message: 'Código PIX copiado para sua área de transferência.'
  })
}

// --- Pagamento avulso da assinatura (botões PIX / Cartão no card de assinatura) ---
const payLoading = ref(false)
const payError = ref('')
const showPayCardModal = ref(false)
const showPayPixModal = ref(false)
const showPaySuccessModal = ref(false)
const payPixCode = ref('')
const payPixImage = ref('')
const payPixStatus = ref('')
const payTxId = ref(null)
const payCardNumber = ref('')
const payCardName = ref('')
const payCardExpiry = ref('')
const payCardCvv = ref('')

const refreshBilling = async () => {
  try {
    invoices.value = await api.get('/billing/invoices')
    billingSummary.value = await api.get('/billing/summary')
  } catch { /* silencioso */ }
}

// Atualiza o usuário logado (ex.: active após ativar o plano) — reflete no card sem recarregar.
const refreshCurrentUser = async () => {
  try {
    emit('updateUser', await api.get('/users/me'))
  } catch { /* silencioso */ }
}

const startPixPayment = async () => {
  payError.value = ''
  payLoading.value = true
  payPixCode.value = ''
  payPixImage.value = ''
  try {
    const res = await api.post('/billing/pay', { paymentMethod: 'pix' })
    payPixCode.value = res?.pixCode || ''
    payPixImage.value = payPixCode.value ? await genQr(payPixCode.value) : (res?.pixImage || '')
    payPixStatus.value = res?.status || 'pending'
    payTxId.value = res?.transactionId || null
    showPayPixModal.value = true
    if (payPixStatus.value === 'pending' && payTxId.value) {
      activePolls.push(pollTransaction(payTxId.value, {
        onPaid: () => { showPayPixModal.value = false; showPaySuccessModal.value = true; refreshBilling(); refreshCurrentUser() },
      }))
    }
    await refreshBilling()
  } catch (err) {
    emit('triggerDevModal', {
      title: 'Pagamento indisponível',
      message: err.message || 'Não foi possível gerar o PIX agora.'
    })
  } finally {
    payLoading.value = false
  }
}

const submitCardPayment = async () => {
  payError.value = ''
  payLoading.value = true
  try {
    if (!cardPublicKey.value) throw new Error('Pagamento com cartão indisponível no momento.')
    const { exp_month, exp_year } = parseExpiry(payCardExpiry.value)
    const u = props.user || {}
    const cardToken = await tokenizeCard(cardPublicKey.value, {
      number: (payCardNumber.value || '').replace(/\D/g, ''),
      holder_name: payCardName.value,
      exp_month, exp_year,
      cvv: (payCardCvv.value || '').replace(/\D/g, ''),
    }, {
      line_1: `${u.address || ''}, ${u.neighborhood || ''}`.trim().replace(/^,|,$/g, '') || 'S/N',
      zip_code: (u.zipCode || '').replace(/\D/g, ''),
      city: u.city || '',
      state: u.state || '',
      country: 'BR',
    })
    const res = await api.post('/billing/pay', { paymentMethod: 'card', cardToken })
    showPayCardModal.value = false
    payCardNumber.value = payCardName.value = payCardExpiry.value = payCardCvv.value = ''
    await refreshBilling()
    if (res?.status === 'paid') {
      showPaySuccessModal.value = true
      refreshCurrentUser()
    } else if (res?.transactionId) {
      // cartão em análise — confirma via polling
      activePolls.push(pollTransaction(res.transactionId, {
        onPaid: () => { showPaySuccessModal.value = true; refreshBilling(); refreshCurrentUser() },
      }))
      emit('triggerDevModal', { title: 'Pagamento em processamento', message: 'Recebemos seu pagamento; a confirmação chega em instantes.' })
    }
  } catch (err) {
    payError.value = err.message || 'Não foi possível processar o cartão.'
  } finally {
    payLoading.value = false
  }
}

// Lógica de Gerador de Links de Checkout
const showCreateLinkModal = ref(false)
const selectedPlan = ref('Individual')
const refCodeInput = ref('')
const selectedPayment = ref('ambos')

function maskCpf(value) {
  if (!value) return '—'
  const digits = String(value).replace(/\D/g, '')
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return value.replace(/^(\d{3}\.)\d{3}\.\d{3}(-\d{2})$/, '$1***.***$2')
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
}

const userLinks = ref([])
const planPrices = ref({ Individual: '', Família: '' })

const generateNewLink = async () => {
  try {
    const link = await api.post('/referrals/links', {
      planType: selectedPlan.value,
      refCode: refCodeInput.value,
      paymentMethod: selectedPayment.value,
    })
    userLinks.value.unshift(link)
    showCreateLinkModal.value = false
    emit('triggerDevModal', {
      title: 'Link Gerado!',
      message: `Seu link de indicação para o Plano ${selectedPlan.value} foi gerado e adicionado à lista.`
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível gerar o link agora.' })
  }
}

// Lógica de Tela de Checkout Simulado Real
const showCheckoutModal = ref(false)
const checkoutPlan = ref(null)
const checkoutSelectedPlanType = ref('Individual')
const checkoutStep = ref(1) // 1: preencher dados, 2: sucesso
const checkoutName = ref('')
const checkoutEmail = ref('')
const checkoutCpf = ref('')
const checkoutPhone = ref('')
const checkoutBirthDate = ref('')
const checkoutGender = ref('')
const checkoutAddress = ref('')
const checkoutNeighborhood = ref('')
const checkoutComplement = ref('')
const checkoutCity = ref('')
const checkoutState = ref('')
const checkoutZipCode = ref('')
// Cartão de crédito oculto por enquanto — só PIX. Trocar para true reativa o cartão.
// Cartão (Pagar.me) — habilitado/public key vêm do backend (/billing/card-config).
const cardEnabled = ref(false)
const cardPublicKey = ref('')
const loadCardConfig = async () => {
  try {
    const c = await api.get('/billing/card-config')
    cardEnabled.value = !!c?.enabled
    cardPublicKey.value = c?.publicKey || ''
  } catch { cardEnabled.value = false }
}
loadCardConfig()
const checkoutPaymentMethod = ref('pix')

const BRAZIL_STATES = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

const checkoutCardNumber = ref('')
const checkoutCardName = ref('')
const checkoutCardExpiry = ref('')
const checkoutCardCvv = ref('')

const formatCPF = (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 11) value = value.slice(0, 11)
  value = value.replace(/(\d{3})(\d)/, '$1.$2')
  value = value.replace(/(\d{3})(\d)/, '$1.$2')
  value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  checkoutCpf.value = value
}

const formatPhone = (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 11) value = value.slice(0, 11)
  value = value.replace(/^(\d{2})(\d)/g, '($1) $2')
  value = value.replace(/(\d{5})(\d)/, '$1-$2')
  checkoutPhone.value = value
}

const formatCardNumber = (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 16) value = value.slice(0, 16)
  value = value.replace(/(\d{4})(?=\d)/g, '$1 ')
  checkoutCardNumber.value = value
}

const formatCardExpiry = (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 4) value = value.slice(0, 4)
  if (value.length > 2) {
    value = value.replace(/(\d{2})(\d)/, '$1/$2')
  }
  checkoutCardExpiry.value = value
}

const formatCardCvv = (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 4) value = value.slice(0, 4)
  checkoutCardCvv.value = value
}

const formatName = (e) => {
  let value = e.target.value
  checkoutName.value = value.replace(/(^\w|\s\w)/g, m => m.toUpperCase())
}

const formatEmail = (e) => {
  checkoutEmail.value = e.target.value.toLowerCase().replace(/\s/g, '')
}

const formatCEP = async (e) => {
  let value = e.target.value.replace(/\D/g, '')
  if (value.length > 8) value = value.slice(0, 8)
  const digits = value
  value = value.replace(/(\d{5})(\d)/, '$1-$2')
  checkoutZipCode.value = value
  if (digits.length === 8) {
    const r = await lookupCep(digits)
    if (r) {
      if (r.street) checkoutAddress.value = r.street
      if (r.neighborhood) checkoutNeighborhood.value = r.neighborhood
      if (r.city) checkoutCity.value = r.city
      if (r.state) checkoutState.value = r.state
    }
  }
}

// CEP do perfil (Minha Conta) → preenche endereço.
const onProfileCep = async () => {
  const r = await lookupCep(zipCode.value)
  if (!r) return
  if (r.street) address.value = r.street
  if (r.neighborhood) neighborhood.value = r.neighborhood
  if (r.city) city.value = r.city
  if (r.state) uf.value = r.state
}

/** Input nativo type="date" dá YYYY-MM-DD — Vencca exige DD/MM/AAAA. */
function toBrDate(isoDate) {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

const openCheckout = (linkItem) => {
  checkoutPlan.value = linkItem || userLinks.value[0] || null
  checkoutSelectedPlanType.value = checkoutPlan.value?.planType ?? 'Individual'
  checkoutStep.value = 1
  checkoutError.value = ''
  checkoutName.value = ''
  checkoutEmail.value = ''
  checkoutCpf.value = ''
  checkoutPhone.value = ''
  checkoutBirthDate.value = ''
  checkoutGender.value = ''
  checkoutAddress.value = ''
  checkoutNeighborhood.value = ''
  checkoutComplement.value = ''
  checkoutCity.value = ''
  checkoutState.value = ''
  checkoutZipCode.value = ''
  checkoutCardNumber.value = ''
  checkoutCardName.value = ''
  checkoutCardExpiry.value = ''
  checkoutCardCvv.value = ''
  showCheckoutModal.value = true
}

const updateCheckoutPlanDetails = () => {
  const own = userLinks.value.find(l => l.planType === checkoutSelectedPlanType.value)
  checkoutPlan.value = own || {
    name: `Checkout - Plano ${checkoutSelectedPlanType.value}`,
    planType: checkoutSelectedPlanType.value,
    desc: `Link de checkout para indicação do Plano ${checkoutSelectedPlanType.value}`,
    price: planPrices.value[checkoutSelectedPlanType.value],
    url: `https://conta.vivamaisclub.com/plano-${slugify(checkoutSelectedPlanType.value)}?ref=${refCodeInput.value}`,
  }
}

const checkoutError = ref('')
const checkoutStatus = ref('')      // 'paid' | 'pending'
const checkoutPixCode = ref('')     // copia-e-cola (PIX pendente)
const checkoutPixImage = ref('')    // QR gerado do código (dataURL)
const checkoutLoading = ref(false)
const checkoutTxId = ref(null)

const finishCheckout = async () => {
  if (!checkoutPlan.value) return
  const match = checkoutPlan.value.url.match(/ref=([^&]+)/)
  const refCode = match ? match[1] : refCodeInput.value

  checkoutError.value = ''
  checkoutLoading.value = true
  try {
    // Cartão: tokeniza na Pagar.me (o número não passa pelo nosso backend).
    let cardToken
    if (checkoutPaymentMethod.value === 'card') {
      if (!cardPublicKey.value) throw new Error('Pagamento com cartão indisponível no momento.')
      const { exp_month, exp_year } = parseExpiry(checkoutCardExpiry.value)
      cardToken = await tokenizeCard(cardPublicKey.value, {
        number: (checkoutCardNumber.value || '').replace(/\D/g, ''),
        holder_name: checkoutCardName.value,
        exp_month, exp_year,
        cvv: (checkoutCardCvv.value || '').replace(/\D/g, ''),
      }, {
        line_1: `${checkoutAddress.value}, ${checkoutNeighborhood.value}`.trim().replace(/^,|,$/g, ''),
        zip_code: (checkoutZipCode.value || '').replace(/\D/g, ''),
        city: checkoutCity.value,
        state: checkoutState.value,
        country: 'BR',
      })
    }
    const res = await api.post('/billing/checkout', {
      refCode,
      planType: checkoutPlan.value.planType,
      name: checkoutName.value,
      email: checkoutEmail.value,
      cpf: checkoutCpf.value,
      phone: checkoutPhone.value,
      birthDate: toBrDate(checkoutBirthDate.value),
      gender: checkoutGender.value,
      address: checkoutAddress.value,
      neighborhood: checkoutNeighborhood.value,
      complement: checkoutComplement.value || undefined,
      city: checkoutCity.value,
      state: checkoutState.value,
      zipCode: checkoutZipCode.value,
      paymentMethod: checkoutPaymentMethod.value,
      cardToken,
    })
    checkoutStatus.value = res?.status || 'paid'
    checkoutPixCode.value = res?.pixCode || ''
    checkoutTxId.value = res?.transactionId || null
    // QR sempre gerado a partir do código (não depende da imagem da Veenca).
    checkoutPixImage.value = checkoutPixCode.value ? await genQr(checkoutPixCode.value) : (res?.pixImage || '')
    checkoutStep.value = 2
    // PIX pendente: faz polling até o pagamento confirmar (complementa o webhook).
    if (checkoutStatus.value === 'pending' && checkoutTxId.value) {
      activePolls.push(pollTransaction(checkoutTxId.value, {
        onPaid: () => { checkoutStatus.value = 'paid' },
      }))
    }
    userLinks.value = await api.get('/referrals/my-links')
  } catch (err) {
    checkoutError.value = err.message || 'Não foi possível concluir a assinatura agora.'
  } finally {
    checkoutLoading.value = false
  }
}

// MODAIS INTERATIVOS DE LINKS
const showShareModal = ref(false)
const showReportModal = ref(false)
const showEditLinkModal = ref(false)
const selectedLink = ref(null)

// Parâmetros de Edição
const editLinkName = ref('')
const editLinkPlanType = ref('Individual')
const editLinkRefCode = ref('')
const editLinkStatus = ref('Ativo')

const openShare = (linkItem) => {
  selectedLink.value = linkItem
  // Copiar link automaticamente
  if (navigator.clipboard) {
    navigator.clipboard.writeText(linkItem.url)
  }
  showShareModal.value = true
}

const openReport = (linkItem) => {
  selectedLink.value = linkItem
  showReportModal.value = true
}

const openEdit = (linkItem) => {
  selectedLink.value = linkItem
  editLinkName.value = linkItem.name
  editLinkPlanType.value = linkItem.planType
  const match = linkItem.url.match(/ref=([^&]+)/)
  editLinkRefCode.value = match ? match[1] : refCodeInput.value
  editLinkStatus.value = linkItem.status
  showEditLinkModal.value = true
}

const saveEditedLink = async () => {
  if (!selectedLink.value) return
  try {
    const updated = await api.put(`/referrals/links/${selectedLink.value.id}`, {
      name: editLinkName.value,
      planType: editLinkPlanType.value,
      refCode: editLinkRefCode.value,
      status: editLinkStatus.value,
    })
    const idx = userLinks.value.findIndex(l => l.id === selectedLink.value.id)
    if (idx !== -1) userLinks.value[idx] = updated
    showEditLinkModal.value = false
    emit('triggerDevModal', {
      title: 'Link Atualizado!',
      message: 'As alterações do link de indicação foram salvas com sucesso.'
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível salvar as alterações do link.' })
  }
}

// Controla scroll do body quando qualquer modal do cliente está aberto
watch([showCardModal, showCheckoutModal, showShareModal, showReportModal, showEditLinkModal, showCreateLinkModal], (vals) => {
  const isOpen = vals.some(v => !!v)
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

onMounted(async () => {
  try {
    const [slidesData, referrals, links, invoicesData, summary, prices] = await Promise.all([
      api.get('/content/slides').catch(() => DEFAULT_SLIDES),
      api.get('/referrals').catch(() => []),
      api.get('/referrals/my-links').catch(() => []),
      api.get('/billing/invoices').catch(() => []),
      api.get('/billing/summary').catch(() => ({ plan: '', monthlyValue: '', nextBillingDate: '' })),
      api.get('/content/pricing').catch(() => ({ Individual: '', Família: '' })),
    ])
    slides.value = DEFAULT_SLIDES
    rawReferrals.value = referrals || []
    userLinks.value = links || []
    invoices.value = invoicesData || []
    billingSummary.value = summary || { plan: '', monthlyValue: '', nextBillingDate: '' }
    planPrices.value = prices || { Individual: '', Família: '' }
    await loadProfile()
    try {
      const d = await api.get('/dependents')
      depInfo.value = d || { limit: 0, used: 0, canAdd: false }
    } catch {
      depInfo.value = { limit: 0, used: 0, canAdd: false }
    }
    await loadWithdrawSummary()
  } catch (err) {
    rawReferrals.value = []
    userLinks.value = []
    invoices.value = []
    billingSummary.value = { plan: '', monthlyValue: '', nextBillingDate: '' }
    depInfo.value = { limit: 0, used: 0, canAdd: false }
  }
})
</script>

<template>
  <div class="dashboard-wrapper" :class="[layoutMode]">
    
    <!-- ABA 1: VISÃO GERAL (HOME) -->
    <div v-if="currentTab === 'home'" class="tab-content">
      <header class="welcome-section animated-item" style="animation-delay: 0s;">
        <div class="welcome-text">
          <h1>Olá, {{ user.name }}</h1>
          <p>Confira o andamento da sua conta e acesse seus benefícios de saúde.</p>
        </div>
        <div class="plan-pill">
          <span class="badge badge-success">Assinatura Ativa</span>
          <span class="plan-name">{{ user.plan }}</span>
        </div>
      </header>

      <!-- Assinatura própria (PIX): não-pago mostra sempre "Ativar plano"; pago só nos 3 dias antes do vencimento. Oculta p/ dependentes -->
      <section v-if="!user?.isDependent && (!user?.active || canRenew)" class="renew-card animated-item" style="animation-delay: 0.05s;">
        <div class="renew-info">
          <i class="ph ph-wallet"></i>
          <div>
            <strong>Minha Assinatura — {{ user.plan }}</strong>
            <span v-if="!user?.active">Ative seu plano com o pagamento para liberar os benefícios.<template v-if="billingSummary.monthlyValue"> {{ billingSummary.monthlyValue }}.</template></span>
            <span v-else-if="billingSummary.monthlyValue">{{ billingSummary.monthlyValue }}<template v-if="billingSummary.nextBillingDate"> · próxima cobrança em {{ billingSummary.nextBillingDate }}</template></span>
            <span v-else>Renove sua assinatura via PIX, sem preencher dados de novo.</span>
          </div>
        </div>
        <button class="btn btn-secondary" @click="startPixPayment" :disabled="payLoading">
          <i class="ph ph-qr-code"></i> {{ payLoading ? 'Gerando…' : (user?.active ? 'Renovar via PIX' : 'Ativar plano') }}
        </button>
      </section>

      <!-- Slider Ampliado Contínuo (Sem piscar em branco) -->
      <section class="banner-slider animated-item" style="animation-delay: 0.1s;">
        <div class="slider-track" :style="{ transform: `translateX(-${activeSlide * 100}%)` }">
          <div 
            v-for="(slide, idx) in slides" 
            :key="idx" 
            class="slide-item"
            :style="{ backgroundImage: `url('${slide.image || slide.fallbackImage || '/telemedicina-banner.png'}')` }"
          >
            <div class="slide-content">
              <span class="badge badge-warning">{{ slide.tag }}</span>
              <h2>{{ slide.title }}</h2>
              <p>{{ slide.description }}</p>
              <button class="btn btn-primary" @click="handleSlideAction(slide)">Acessar Benefício</button>
            </div>
          </div>
        </div>
        <div class="slide-indicator-container">
          <span 
            v-for="(s, idx) in slides" 
            :key="idx" 
            :class="['indicator-dot', { active: activeSlide === idx }]"
            @click="activeSlide = idx"
          ></span>
        </div>
      </section>

      <!-- Grade de Métricas -->
      <section class="metrics-grid animated-item" style="animation-delay: 0.2s;">
        <div class="metric-card card">
          <div class="metric-header">
            <i class="ph ph-piggy-bank"></i>
            <span>Economia Acumulada</span>
          </div>
          <h3>—</h3>
          <p>Será exibido quando você tiver algum desconto.</p>
        </div>
        <div class="metric-card card">
          <div class="metric-header">
            <i class="ph ph-video-camera"></i>
            <span>Telemedicina</span>
          </div>
          <h3>Ilimitada</h3>
          <p>Consultas virtuais 24h sem custo adicional</p>
        </div>
        <div
          v-if="!user?.isDependent"
          class="metric-card card"
          :class="{ 'metric-clickable': depAvailable }"
          @click="depAvailable ? emit('changeTab', 'dependentes') : null"
        >
          <div class="metric-header">
            <i class="ph ph-users"></i>
            <span>Dependentes</span>
          </div>
          <h3 v-if="depAvailable">{{ depInfo.used }} de {{ depInfo.limit }}</h3>
          <h3 v-else>Indisponível</h3>
          <p v-if="!depAvailable">Não incluído no seu plano atual</p>
          <p v-else-if="depRemaining > 0">{{ depRemaining }} vaga(s) disponível(is) — toque para gerenciar</p>
          <p v-else>Limite do plano atingido</p>
        </div>
      </section>

      <!-- Painel Principal de Dois Lados -->
      <div class="dashboard-grid">
        <!-- Lado Esquerdo: Atalhos com entrada staggered -->
        <div class="left-side">
          <h2 class="section-title animated-item" style="animation-delay: 0.3s;">Atalhos Rápidos de Benefícios</h2>
          <div class="shortcuts-list">

            <div class="shortcut-card animated-item" style="animation-delay: 0.35s;" @click="showConsultasModal = true">
              <div class="shortcut-icon icon-pink">
                <i class="ph ph-clipboard-text"></i>
              </div>
              <div class="shortcut-details">
                <h3>Consultas e exames</h3>
                <p>Agende consultas e exames pelo app Nipomed no seu celular</p>
              </div>
              <i class="ph ph-caret-right action-arrow"></i>
            </div>

            <div class="shortcut-card animated-item" :class="{ 'shortcut-locked': accessBlocked }" style="animation-delay: 0.4s;" @click="triggerRedirect('Telemedicina')">
              <div class="shortcut-icon icon-teal">
                <i class="ph ph-first-aid"></i>
              </div>
              <div class="shortcut-details">
                <h3>Telemedicina</h3>
                <p>Consultas de clínico geral ou especialista por vídeo 24h</p>
              </div>
              <i class="ph ph-caret-right action-arrow"></i>
            </div>


            <div class="shortcut-card animated-item" :class="{ 'shortcut-locked': accessBlocked }" style="animation-delay: 0.6s;" @click="triggerRedirect('Veterinário 24h')">
              <div class="shortcut-icon icon-green">
                <i class="ph ph-paw-print"></i>
              </div>
              <div class="shortcut-details">
                <h3>Veterinário 24h</h3>
                <p>Orientação e pronto-socorro veterinário a qualquer hora</p>
              </div>
              <i class="ph ph-caret-right action-arrow"></i>
            </div>

            <div class="shortcut-card animated-item" :class="{ 'shortcut-locked': accessBlocked }" style="animation-delay: 0.7s;" @click="triggerRedirect('Clube de Descontos')">
              <div class="shortcut-icon icon-orange">
                <i class="ph ph-tag"></i>
              </div>
              <div class="shortcut-details">
                <h3>Clube de Descontos</h3>
                <p>Economia em farmácias, cinemas, lazer e lojas parceiras</p>
              </div>
              <i class="ph ph-caret-right action-arrow"></i>
            </div>


            <div class="shortcut-card animated-item" style="animation-delay: 0.7s;" @click="emit('changeTab', 'indicacoes')">
              <div class="shortcut-icon icon-teal">
                <i class="ph ph-users-three"></i>
              </div>
              <div class="shortcut-details">
                <h3>Programa de Indicações</h3>
                <p>Indique amigos e ganhe descontos e comissões em dinheiro</p>
              </div>
              <i class="ph ph-caret-right action-arrow"></i>
            </div>

          </div>
        </div>

        <!-- Lado Direito: Carteirinha Digital e Histórico -->
        <div class="right-side">
          <!-- Carteirinha Digital -->
          <h2 class="section-title animated-item" style="animation-delay: 0.35s;">Carteirinha Digital</h2>
          <div class="digital-card-preview card animated-item" style="animation-delay: 0.45s;" @click="showCardModal = true">
            <div class="dcard-header">
              <!-- Logotipo da carteirinha em container com contraste -->
              <div class="dcard-logo-box">
                <img src="/logo.png" alt="Logo Viva Mais" class="dcard-logo" />
              </div>
              <span class="badge badge-success">Premium</span>
            </div>
            <div class="dcard-body">
              <h3>{{ user.name }}</h3>
              <p class="dcard-plan">Plano: {{ user.plan }}</p>
              <p class="dcard-cpf">CPF: {{ maskCpf(cpf) }}</p>
            </div>
            <div class="dcard-footer">
              <span>Clique para ver QR Code</span>
              <i class="ph ph-qr-code"></i>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ABA 2: MINHA CONTA -->
    <div v-if="currentTab === 'perfil'" class="tab-content animated-item" style="animation-delay: 0s;">
      <header class="tab-header" style="margin-bottom: 24px;">
        <h2>Minha Conta</h2>
        <p>Atualize seus dados pessoais e de contato para comunicação.</p>
      </header>
      <!-- Abas de Minha Conta -->
      <div class="account-tabs">
        <button :class="['account-tab', { active: profileTab === 'basicas' }]" @click="profileTab = 'basicas'">
          <i class="ph ph-user"></i> <span>Informações Básicas</span>
        </button>
        <button :class="['account-tab', { active: profileTab === 'seguranca' }]" @click="profileTab = 'seguranca'">
          <i class="ph ph-lock-key"></i> <span>Segurança</span>
        </button>
        <button :class="['account-tab', { active: profileTab === 'endereco' }]" @click="profileTab = 'endereco'">
          <i class="ph ph-map-pin"></i> <span>Endereço</span>
        </button>
      </div>

      <!-- Informações Básicas -->
      <div v-show="profileTab === 'basicas'" class="card form-card">
        <form @submit.prevent="saveProfile" class="profile-form">
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Nome Completo (Inalterável)</label>
              <input type="text" class="form-control" :value="name" disabled style="background:#f1f5f9; cursor:not-allowed;" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">CPF (Inalterável)</label>
              <input type="text" class="form-control" :value="cpf" disabled style="background:#f1f5f9; cursor:not-allowed;" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">E-mail</label>
              <input v-model="email" type="email" class="form-control" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Celular</label>
              <input v-model="phone" type="text" class="form-control" />
            </div>
          </div>
          <button type="submit" class="btn btn-secondary">Salvar</button>
        </form>
      </div>

      <!-- Segurança -->
      <div v-show="profileTab === 'seguranca'" class="card form-card">
        <h3 style="margin-bottom: 16px; color: var(--secondary);">Alterar Senha</h3>
        <form @submit.prevent="changePassword" class="profile-form">
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Senha Atual</label>
              <input v-model="currentPasswordInput" type="password" class="form-control" placeholder="••••••••" required />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Nova Senha</label>
              <input v-model="newPasswordInput" type="password" class="form-control" required minlength="6" />
            </div>
          </div>
          <button type="submit" class="btn btn-outline">Atualizar Senha</button>
        </form>
      </div>

      <!-- Endereço -->
      <div v-show="profileTab === 'endereco'" class="card form-card">
        <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 14px;">Necessário para o pagamento da assinatura. Digite o CEP para preencher automaticamente.</p>
        <form @submit.prevent="saveProfile" class="profile-form">
          <div class="form-row">
            <div class="form-group" style="flex: 0 0 160px;">
              <label class="form-label">CEP</label>
              <input v-model="zipCode" @input="onProfileCep" type="text" class="form-control" placeholder="Somente números" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Endereço (rua e número)</label>
              <input v-model="address" type="text" class="form-control" placeholder="Rua Exemplo, 123" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Bairro</label>
              <input v-model="neighborhood" type="text" class="form-control" />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Complemento (opcional)</label>
              <input v-model="complement" type="text" class="form-control" placeholder="Apto, bloco…" />
            </div>
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Cidade</label>
              <input v-model="city" type="text" class="form-control" />
            </div>
            <div class="form-group" style="flex: 0 0 120px;">
              <label class="form-label">Estado</label>
              <select v-model="uf" class="form-control">
                <option value="" disabled>UF</option>
                <option v-for="s in BRAZIL_STATES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-secondary">Salvar</button>
        </form>
      </div>
    </div>

    <!-- ABA 3: FINANCEIRO (Layout Melhorado e Profissional) -->
    <div v-if="currentTab === 'financeiro'" class="tab-content animated-item" style="animation-delay: 0s;">
      <header class="tab-header" style="margin-bottom: 24px;">
        <h2>Financeiro & Faturamento</h2>
        <p>Gerencie sua assinatura.</p>
        <p style="margin-top: 6px; opacity: 0.85;">Consulte boletos/PIX ativos e histórico de cobranças.</p>
      </header>

      <div class="financial-grid">
        <!-- Detalhes do Plano e Ações Rápidas -->
        <div class="card financial-main-card">
          <div class="billing-header">
            <div>
              <span class="badge badge-success">Assinatura Ativa</span>
              <h3 class="plan-title">{{ user.plan }}</h3>
            </div>
            <div class="price-block">
              <span class="price-val">{{ billingSummary.monthlyValue }}</span>
            </div>
          </div>

          <div class="billing-details-list">
            <div class="detail-row">
              <span>Próxima cobrança automática:</span>
              <strong>{{ billingSummary.nextBillingDate }}</strong>
            </div>
            <div class="detail-row">
              <span>Cadastrado em:</span>
              <strong>{{ memberSince }}</strong>
            </div>
          </div>

          <!-- Não-pago: ativar sempre. Pago: renovar só nos 3 dias antes do vencimento. -->
          <div v-if="!user?.active || canRenew" class="billing-actions">
            <button v-if="cardEnabled" class="btn btn-primary" @click="showPayCardModal = true" :disabled="payLoading">
              <i class="ph ph-credit-card"></i> Cartão de Crédito
            </button>
            <button class="btn btn-outline" @click="startPixPayment" :disabled="payLoading">
              <i class="ph ph-qr-code"></i> {{ payLoading ? 'Gerando...' : (user?.active ? 'Pagar via PIX' : 'Ativar plano (PIX)') }}
            </button>
          </div>
          <p v-else style="font-size: 13px; color: var(--text-gray); margin-top: 8px;">
            A renovação fica disponível a partir de 3 dias antes do vencimento.
          </p>
        </div>

        <!-- Histórico e faturamento anteriores -->
        <div class="card financial-history-card">
          <h3>Histórico de Mensalidades</h3>
          <div class="invoices-list-v2">
            <div class="invoice-item-v2" v-for="invoice in invoices" :key="invoice.id">
              <div class="inv-info">
                <i class="ph ph-check-circle text-green icon-large"></i>
                <div>
                  <strong>Fatura #{{ invoice.id }}</strong>
                  <span>{{ invoice.status === 'pago' ? 'Pago' : invoice.status }} em {{ invoice.date }} via {{ invoice.method }}</span>
                </div>
              </div>
              <div class="inv-value">
                <span>{{ invoice.value }}</span>
              </div>
            </div>
            <p v-if="invoices.length === 0" style="text-align:center; color: var(--text-gray); padding: 16px 0;">
              Nenhuma fatura registrada ainda.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ABA 5: PROGRAMA DE INDICAÇÕES -->
    <div v-if="currentTab === 'indicacoes'" class="tab-content animated-item" style="animation-delay: 0s;">
      
      <!-- Sub-Abas do Programa de Indicações -->
      <nav class="referral-tabs">
        <button 
          :class="['ref-tab-btn', { active: activeRefTab === 'visaoGeral' }]"
          @click="activeRefTab = 'visaoGeral'"
        >
          <i class="ph ph-squares-four"></i> Visão Geral
        </button>
        <button 
          :class="['ref-tab-btn', { active: activeRefTab === 'indicados' }]"
          @click="activeRefTab = 'indicados'"
        >
          <i class="ph ph-users"></i> Meus Indicados
        </button>
        <button 
          :class="['ref-tab-btn', { active: activeRefTab === 'financeiroRef' }]"
          @click="activeRefTab = 'financeiroRef'"
        >
          <i class="ph ph-hand-coins"></i> Financeiro
        </button>
        <button 
          :class="['ref-tab-btn', { active: activeRefTab === 'links' }]"
          @click="activeRefTab = 'links'"
        >
          <i class="ph ph-link"></i> Meus Links
        </button>
      </nav>

      <!-- SUB-ABA 1: VISÃO GERAL -->
      <div v-if="activeRefTab === 'visaoGeral'" class="ref-sub-content">
        <header class="tab-header animated-item" style="animation-delay: 0.05s; display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
          <div>
            <h2>Seu Programa de Indicações</h2>
            <p>Acompanhe seus ganhos, indicados e performance em tempo real.</p>
          </div>

          <div style="text-align:right; margin-left:auto;">
            <button
              class="btn btn-primary"
              :disabled="withdrawLoading || !withdrawSummary.canRequest"
              @click="openWithdrawModal"
            >
              <i v-if="withdrawLoading" class="mini-spinner"></i>
              <i v-else class="ph ph-hand-coins"></i>
              {{ withdrawLoading ? 'Solicitando...' : 'Solicitar Saque' }}
            </button>
            <div style="font-size: 12px; color: var(--text-gray); margin-top: 6px;">
              <template v-if="withdrawSummary.hasPending">
                <i class="ph ph-clock" style="color:#d97706;"></i>
                Saque de <strong style="color:#d97706;">{{ withdrawSummary.pendingLabel }}</strong> pendente
              </template>
              <template v-else>
                Disponível: <strong style="color:#059669;">{{ withdrawSummary.availableLabel }}</strong>
              </template>
            </div>
          </div>
        </header>

        <!-- Cards de Resumo de Ganhos/Indicados (derivados dos indicados reais) -->
        <section class="metrics-grid">
          <div class="metric-card card animated-item" style="animation-delay: 0.1s;">
            <div class="metric-header">
              <i class="ph ph-coins" style="color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #065f46;">GANHOS TOTAIS</span>
            </div>
            <h3 style="color: #059669;">{{ formatCurrency(referralStats.ganhosTotais) }}</h3>
            <p>Recorrente enquanto os indicados estiverem ativos</p>
          </div>
          <div class="metric-card card animated-item" style="animation-delay: 0.15s;">
            <div class="metric-header">
              <i class="ph ph-users" style="color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #1e40af;">TOTAL INDICADOS</span>
            </div>
            <h3 style="color: #1e3a8a;">{{ referralStats.totalIndicados }}</h3>
            <p>Pessoas na sua rede</p>
          </div>
          <div class="metric-card card animated-item" style="animation-delay: 0.2s;">
            <div class="metric-header">
              <i class="ph ph-trend-up" style="color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #5b21b6;">TAXA DE ATIVAÇÃO</span>
            </div>
            <h3 style="color: #6d28d9;">{{ referralStats.taxaAtivacao }}%</h3>
            <p>{{ referralStats.ativos }} de {{ referralStats.totalIndicados }} indicados ativos</p>
          </div>
          <div class="metric-card card animated-item" style="animation-delay: 0.25s;">
            <div class="metric-header">
              <i class="ph ph-gift" style="color: #d97706; background: #fffbeb; border: 1px solid #fde68a; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #92400e;">BÔNUS DE INDICAÇÕES NOVAS</span>
            </div>
            <h3 style="color: #d97706;">{{ formatCurrency(referralStats.bonusTotal) }}</h3>
            <p>+R$30 no 1º mês de cada indicação nova ({{ referralStats.bonusCount }})</p>
          </div>
        </section>

        <!-- Grid de Crescimento e Ganhos por Nível -->
        <div class="dashboard-grid" style="margin-top: 24px;">
          <!-- Lado Esquerdo: Crescimento da Rede -->
          <div class="card animated-item" style="padding: 24px; animation-delay: 0.3s;">
            <h3 style="font-size: 18px; color: var(--secondary); margin-bottom: 20px;">Crescimento da Rede</h3>

            <div class="level-row" v-for="lvl in levelBreakdown" :key="lvl.level">
              <div class="level-row-header">
                <div class="level-label">
                  <span class="level-badge" :class="`lvl-${lvl.level.charAt(0)}`">{{ lvl.level.charAt(0) }}</span>
                  <span style="font-weight: 600;">{{ lvl.level }}</span>
                </div>
                <span class="level-count">{{ lvl.count }} {{ lvl.count === 1 ? 'pessoa' : 'pessoas' }}</span>
              </div>
              <div class="progress-track">
                <div class="progress-bar" :class="`lvl-${lvl.level.charAt(0)}`" :style="{ width: (lvl.count ? (lvl.ativos / lvl.count) * 100 : 0) + '%' }"></div>
              </div>
              <span class="level-footer">{{ lvl.count ? Math.round((lvl.ativos / lvl.count) * 100) : 0 }}% ativas</span>
            </div>
            <p v-if="levelBreakdown.length === 0" style="color: var(--text-gray); font-size: 13px;">Você ainda não tem indicados.</p>
          </div>

          <!-- Lado Direito: Ganhos por Nível -->
          <div class="card animated-item" style="padding: 24px; display: flex; flex-direction: column; gap: 14px; animation-delay: 0.35s;">
            <h3 style="font-size: 18px; color: var(--secondary);">Ganhos por Nível</h3>

            <div v-for="lvl in levelBreakdown" :key="lvl.level" :style="{ background: getLevelStyle(lvl.level).bg, borderLeft: '4px solid ' + getLevelStyle(lvl.level).border }" style="padding: 12px 16px; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,0.03);">
              <div>
                <strong :style="{ color: getLevelStyle(lvl.level).text }" style="font-size: 14px; display:block;">{{ lvl.level }}</strong>
                <span style="font-size: 12px; color: var(--text-gray);">{{ lvl.count }} {{ lvl.count === 1 ? 'pessoa' : 'pessoas' }} • {{ lvl.ativos }} ativa(s)</span>
              </div>
              <strong :style="{ color: getLevelStyle(lvl.level).text }" style="font-size: 15px;">{{ formatCurrency(lvl.total) }}</strong>
            </div>
            <p v-if="levelBreakdown.length === 0" style="color: var(--text-gray); font-size: 13px;">Nenhum ganho registrado ainda.</p>

            <div style="background: linear-gradient(135deg, #f0fdf4 0%, #eff6ff 100%); padding: 16px; border-radius: var(--radius-md); text-align: center; border: 1px solid #bbf7d0; margin-top: auto;">
              <span style="font-size: 12px; color: #475569; display:block; margin-bottom: 4px; font-weight: 600;">Total recorrente</span>
              <strong style="font-size: 24px; color: #059669; font-weight: 800;">{{ formatCurrency(referralStats.ganhosTotais) }}</strong>
            </div>
          </div>
        </div>

        <!-- Últimas Indicações -->
        <div class="card animated-item" style="padding: 24px; margin-top: 24px; animation-delay: 0.4s;">
          <h3 style="font-size: 18px; color: var(--secondary); margin-bottom: 16px;">Últimas Indicações</h3>
          <div class="activities-list" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="activity-item" v-for="ref in latestReferrals" :key="ref.name + ref.date" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div class="user-avatar-mini">{{ getUserInitials(ref.name) }}</div>
                <div>
                  <strong style="color: var(--text-dark); display:block; font-size: 14px;">{{ ref.name }}</strong>
                  <span style="font-size: 12px; color: var(--text-gray); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
                    Indicado(a) em {{ ref.date }} • {{ ref.level }} •
                    <span :class="['status-badge-ref', ref.status]">{{ ref.status.charAt(0).toUpperCase() + ref.status.slice(1) }}</span>
                  </span>
                </div>
              </div>
              <div style="text-align: right;">
                <span style="font-size: 13px; font-weight: 600; color: var(--text-dark); display: block;">Plano {{ ref.plan }}</span>
                <strong :style="{ color: ref.gain !== '-' ? '#16a34a' : 'var(--text-gray)' }" style="font-size: 12px; margin-top: 2px; display: block;">{{ ref.gain !== '-' ? '+ ' + ref.gain + '/mês' : 'Pendente' }}</strong>
              </div>
            </div>
            <p v-if="latestReferrals.length === 0" style="color: var(--text-gray); font-size: 13px; text-align:center;">Você ainda não indicou ninguém.</p>
          </div>
        </div>
      </div>

      <!-- SUB-ABA 2: MEUS INDICADOS -->
      <div v-if="activeRefTab === 'indicados'" class="ref-sub-content">
        <header class="tab-header animated-item" style="animation-delay: 0.05s; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
          <div>
            <h2>Meus Indicados</h2>
            <p>Lista completa de todas as pessoas da sua rede.</p>
          </div>
          <button class="btn btn-secondary" @click="openReferralTree">
            <i class="ph ph-tree-structure"></i> Ver hierarquia
          </button>
        </header>

        <!-- Filtros Dinâmicos -->
        <div class="card animated-item" style="padding: 16px 20px; margin-bottom: 24px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; animation-delay: 0.1s;">
          <div style="position: relative; flex: 1; min-width: 220px;">
            <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-gray); font-size: 16px;"></i>
            <input 
              v-model="refSearchName" 
              type="text" 
              placeholder="Buscar por nome, email ou telefone..." 
              class="form-control" 
              style="padding-left: 38px;" 
            />
          </div>

          <select v-model="refStatusFilter" class="form-control" style="width: auto; min-width: 140px;">
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativo</option>
            <option value="pendente">Pendente</option>
            <option value="inativo">Inativo</option>
          </select>

          <select v-model="refLevelFilter" class="form-control" style="width: auto; min-width: 140px;">
            <option value="todos">Todos os níveis</option>
            <option value="1">1º Nível</option>
            <option value="2">2º Nível</option>
            <option value="3">3º Nível</option>
            <option value="4">4º Nível</option>
            <option value="5">5º Nível</option>
          </select>

          <div style="display:flex; align-items:center; gap:6px;">
            <span style="font-size: 12px; color: var(--text-gray); white-space: nowrap;">Limite:</span>
            <select v-model="itemsPerPage" class="form-control" style="width: auto; min-width: 75px;">
              <option :value="5">5</option>
              <option :value="10">10</option>
              <option :value="20">20</option>
              <option :value="50">50</option>
            </select>
          </div>

          <button class="btn btn-outline" @click="clearRefFilters" title="Limpar todos os filtros">
            <i class="ph ph-arrow-counter-clockwise"></i> Limpar
          </button>
        </div>

        <!-- Tabela com Paginação -->
        <div class="card animated-item" style="overflow-x: auto; padding: 20px 0 0; animation-delay: 0.15s;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin: 0 20px 16px; flex-wrap:wrap; gap:10px;">
            <p style="font-size: 13px; color: var(--text-gray); margin: 0; padding: 0;">
              Clique em uma linha para ver a hierarquia completa da rede.
            </p>
            <span style="font-size: 12px; color: var(--text-gray); font-weight: 600;">
              Total filtrado: {{ filteredReferrals.length }} {{ filteredReferrals.length === 1 ? 'indicado' : 'indicados' }}
            </span>
          </div>

          <table class="referral-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>Email</th>
                <th>Nível</th>
                <th>Indicado por</th>
                <th>Status</th>
                <th>Data</th>
                <th>Ganho/Mês</th>
                <th>Bônus</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(refItem, index) in paginatedReferrals" :key="index" class="animated-item ref-row-clickable" :style="{ 'animation-delay': (0.1 + index * 0.03) + 's' }" @click="openReferralTree">
                <td>
                  <div class="referral-user">
                    <div class="user-avatar-mini">{{ getUserInitials(refItem.name) }}</div>
                    <strong style="color: var(--text-dark);">{{ refItem.name }}</strong>
                  </div>
                </td>
                <td>{{ refItem.phone || '—' }}</td>
                <td>{{ refItem.email }}</td>
                <td><span class="badge badge-outline" style="font-size:11px;">{{ refItem.level }}</span></td>
                <td>{{ refItem.referredBy || '—' }}</td>
                <td>
                  <span :class="['status-badge-ref', refItem.status]">
                    {{ refItem.status.charAt(0).toUpperCase() + refItem.status.slice(1) }}
                  </span>
                </td>
                <td>{{ refItem.date }}</td>
                <td :style="{ color: refItem.gain !== '-' && refItem.gain !== 'R$ 0,00' ? '#16a34a' : 'inherit', fontWeight: 'bold' }">
                  {{ refItem.gain }}
                </td>
                <td>
                  <span v-if="refItem.bonus" class="badge" style="font-size:11px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; font-weight:700;">
                    <i class="ph ph-gift"></i> +{{ refItem.bonus }}
                  </span>
                  <span v-else style="color: var(--text-gray);">—</span>
                </td>
              </tr>
              <tr v-if="filteredReferrals.length === 0">
                <td colspan="9" style="text-align: center; padding: 32px 16px; color: var(--text-gray);">
                  <i class="ph ph-magnifying-glass" style="font-size: 32px; display:block; margin-bottom: 8px; opacity: 0.5;"></i>
                  Nenhum indicado encontrado com os filtros aplicados.
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Barra de Paginação -->
          <div v-if="filteredReferrals.length > 0" class="table-pagination-footer">
            <div class="pagination-info">
              Mostrando <strong>{{ paginationInfo.start }}</strong> a <strong>{{ paginationInfo.end }}</strong> de <strong>{{ paginationInfo.total }}</strong> registros
            </div>

            <div class="pagination-actions">
              <button 
                class="btn-pagination-nav" 
                :disabled="currentPage === 1" 
                @click="setPage(1)" 
                title="Primeira Página"
              >
                <i class="ph ph-caret-double-left"></i>
              </button>
              
              <button 
                class="btn-pagination-nav" 
                :disabled="currentPage === 1" 
                @click="setPage(currentPage - 1)" 
                title="Página Anterior"
              >
                <i class="ph ph-caret-left"></i> Anterior
              </button>

              <div class="pagination-pages">
                <button 
                  v-for="page in totalPages" 
                  :key="page" 
                  :class="['btn-page-number', { active: page === currentPage }]" 
                  @click="setPage(page)"
                >
                  {{ page }}
                </button>
              </div>

              <button 
                class="btn-pagination-nav" 
                :disabled="currentPage === totalPages" 
                @click="setPage(currentPage + 1)" 
                title="Próxima Página"
              >
                Próxima <i class="ph ph-caret-right"></i>
              </button>

              <button 
                class="btn-pagination-nav" 
                :disabled="currentPage === totalPages" 
                @click="setPage(totalPages)" 
                title="Última Página"
              >
                <i class="ph ph-caret-double-right"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- SUB-ABA 3: FINANCEIRO -->
      <div v-if="activeRefTab === 'financeiroRef'" class="ref-sub-content">
        <header class="tab-header animated-item" style="animation-delay: 0.05s;">
          <h2>Histórico Financeiro</h2>
          <p>Acompanhe todas as suas comissões e ganhos obtidos através do programa.</p>
        </header>

        <section class="metrics-grid">
          <div class="metric-card card animated-item" style="animation-delay: 0.1s;">
            <div class="metric-header">
              <i class="ph ph-hand-coins" style="color: #059669; background: #ecfdf5; border: 1px solid #a7f3d0; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #065f46;">GANHOS ACUMULADOS</span>
            </div>
            <h3 style="color: #059669;">{{ formatCurrency(referralStats.ganhosTotais) }}</h3>
            <p>Recorrente enquanto os indicados estiverem ativos</p>
          </div>
          <div class="metric-card card animated-item" style="animation-delay: 0.15s;">
            <div class="metric-header">
              <i class="ph ph-users" style="color: #2563eb; background: #eff6ff; border: 1px solid #bfdbfe; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #1e40af;">INDICADOS ATIVOS</span>
            </div>
            <h3 style="color: #1e3a8a;">{{ referralStats.ativos }}</h3>
            <p>De {{ referralStats.totalIndicados }} indicados no total</p>
          </div>
          <div class="metric-card card animated-item" style="animation-delay: 0.2s;">
            <div class="metric-header">
              <i class="ph ph-trend-up" style="color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 8px; border-radius: var(--radius-sm); font-size: 20px;"></i>
              <span style="font-weight: 700; color: #5b21b6;">TAXA DE ATIVAÇÃO</span>
            </div>
            <h3 style="color: #6d28d9;">{{ referralStats.taxaAtivacao }}%</h3>
            <p>Dos seus indicados estão ativos</p>
          </div>
        </section>

        <!-- Detalhamento por Nível -->
        <div class="card animated-item" style="padding: 24px; margin-top: 24px; animation-delay: 0.25s;">
          <h3 style="font-size: 18px; color: var(--secondary); margin-bottom: 20px;">Ganhos por Nível</h3>
          <div class="invoices-list-v2">
            <div class="invoice-item-v2 animated-item" v-for="lvl in levelBreakdown" :key="lvl.level" style="animation-delay: 0.3s;">
              <div class="inv-info">
                <i class="ph ph-calendar text-teal icon-large"></i>
                <div>
                  <strong>{{ lvl.level }}</strong>
                  <span>{{ lvl.count }} {{ lvl.count === 1 ? 'pessoa' : 'pessoas' }} • {{ lvl.ativos }} ativa(s)</span>
                </div>
              </div>
              <div class="inv-value">
                <span style="color: #16a34a;">{{ formatCurrency(lvl.total) }}</span>
                <span class="badge badge-success" style="font-size: 11px;">Recorrente</span>
              </div>
            </div>
            <p v-if="levelBreakdown.length === 0" style="color: var(--text-gray); text-align:center; padding: 12px 0;">Nenhuma comissão registrada ainda.</p>
        </div>

        <!-- Detalhamento de Comissões -->
        <div class="card animated-item" style="padding: 24px; margin-top: 24px; animation-delay: 0.45s;">
          <h3 style="font-size: 18px; color: var(--secondary); margin-bottom: 20px;">Detalhamento de Comissões</h3>

          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div v-for="lvl in levelBreakdown" :key="lvl.level" style="border-bottom: 1px solid #f1f5f9; padding-bottom: 12px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div>
                  <strong style="display: block; font-size: 14px; color: var(--text-dark);">{{ lvl.level }}</strong>
                  <span style="font-size: 12px; color: var(--text-gray);">{{ lvl.ativos }} de {{ lvl.count }} ativa(s)</span>
                </div>
                <strong style="color: var(--primary); font-size: 16px;">{{ formatCurrency(lvl.total) }}</strong>
              </div>
              <div style="background: var(--primary-light); border-left: 3px solid var(--primary); padding: 8px 12px; border-radius: 4px; display: flex; flex-direction: column; gap: 6px; font-size: 12px; margin-top: 8px;">
                <div v-for="person in lvl.people" :key="person.email" style="display: flex; justify-content: space-between; color: var(--text-dark);">
                  <span>{{ person.name }} ({{ person.plan }})</span>
                  <strong>{{ person.gain !== '-' ? '+ ' + person.gain : 'Pendente' }}</strong>
                </div>
              </div>
            </div>
            <p v-if="levelBreakdown.length === 0" style="color: var(--text-gray); text-align:center; padding: 12px 0;">Nenhuma comissão registrada ainda.</p>
          </div>
        </div>
      </div>
    </div>

      <!-- SUB-ABA 4: MEUS LINKS (Dinâmico) -->
      <div v-if="activeRefTab === 'links'" class="ref-sub-content">
        <header class="tab-header animated-item" style="margin-bottom: 24px; animation-delay: 0.05s;">
          <div>
            <h2>Seus Links de Indicação</h2>
            <p style="margin-bottom: 0;">Compartilhe o link do plano desejado. Quem clicar preenche os próprios dados e assina — a comissão entra quando o pagamento é confirmado.</p>
          </div>
        </header>

        <div v-for="(linkItem, index) in userLinks" :key="index" class="card link-sharing-card animated-item" :style="{ 'animation-delay': (0.15 + index * 0.1) + 's' }">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
            <div>
              <h4 style="font-size: 17px; font-weight: 700; color: var(--secondary); margin-bottom: 2px;">{{ linkItem.name }}</h4>
              <p style="font-size: 12px; color: var(--text-gray); margin-bottom: 0;">{{ linkItem.desc }}</p>
            </div>
            <div style="text-align: right;">
              <span class="badge badge-success" style="font-size: 11px; margin-bottom: 4px; display: inline-block;">{{ linkItem.status }}</span>
              <div style="font-size: 12px; color: var(--text-gray);">Pagamento: <strong>{{ linkItem.payment }}</strong></div>
            </div>
          </div>

          <div class="link-input-group">
            <input type="text" class="link-input" :value="linkItem.url" readonly />
            <button class="btn btn-primary" @click="copyLink(linkItem.url)">
              <i class="ph ph-copy"></i> Copiar
            </button>
          </div>
          <div v-if="linkItem.urlAlt" class="link-input-group" style="margin-top: 6px;">
            <input type="text" class="link-input" :value="linkItem.urlAlt" readonly style="font-size: 12px; opacity: 0.8;" />
            <button class="btn btn-outline" @click="copyLink(linkItem.urlAlt)">
              <i class="ph ph-copy"></i> Copiar
            </button>
          </div>

          <div class="sharing-metrics">
            <div class="sharing-metric-box">
              <span>Valor do Plano</span>
              <strong style="color: var(--secondary);">{{ linkItem.price }}</strong>
            </div>
            <div class="sharing-metric-box">
              <span>Cliques</span>
              <strong>{{ linkItem.cliques }}</strong>
            </div>
            <div class="sharing-metric-box">
              <span>Conversões</span>
              <strong>{{ linkItem.conversoes }}</strong>
            </div>
            <div class="sharing-metric-box">
              <span>Comissão Gerada</span>
              <strong style="color: #16a34a;">{{ linkItem.comissao }}</strong>
            </div>
            <div class="sharing-metric-box" v-if="linkItem.bonus && linkItem.bonus !== 'R$ 0,00'">
              <span>Bônus Indicações Novas</span>
              <strong style="color: #d97706;">{{ linkItem.bonus }}</strong>
            </div>
          </div>

          <div class="sharing-actions" style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-outline" style="flex:1; min-width: 120px;" @click="openShare(linkItem)"><i class="ph ph-share"></i> Compartilhar</button>
            <button class="btn btn-outline" style="flex:1; min-width: 120px;" @click="openReport(linkItem)"><i class="ph ph-chart-bar"></i> Ver Relatório</button>
          </div>
        </div>
      </div>

    </div>

    <!-- TELA DE CHECKOUT REAL SIMULADO -->
    <div v-if="showCheckoutModal" class="checkout-overlay" @click.self="showCheckoutModal = false">
      <div class="checkout-box">
        <header class="checkout-header">
          <h3><i class="ph ph-shield-check text-green"></i> Checkout Seguro - Viva Mais</h3>
          <div class="modal-close" @click="showCheckoutModal = false" style="position:static; cursor:pointer;"><i class="ph ph-x"></i></div>
        </header>

        <div class="checkout-body">
          <!-- Passo 1: Informações e Pagamento -->
          <div v-if="checkoutStep === 1" class="checkout-grid">
            <div class="checkout-left">
              <form @submit.prevent="finishCheckout">
                <div class="checkout-section-title">1. Plano de Assinatura</div>
                <div class="form-group" style="margin-bottom: 20px;">
                  <label class="form-label" style="color: var(--text-dark) !important;">Selecione o Plano</label>
                  <select v-model="checkoutSelectedPlanType" class="form-control" @change="updateCheckoutPlanDetails" required>
                    <option value="Individual">Plano Individual — {{ planPrices.Individual }}</option>
                    <option value="Família">Plano Família — {{ planPrices['Família'] }}</option>
                  </select>
                </div>

                <div class="checkout-section-title">2. Informações Pessoais</div>
                <div class="form-group" style="margin-bottom: 12px;">
                  <label class="form-label" style="color: var(--text-dark) !important;">Nome Completo</label>
                  <input v-model="checkoutName" type="text" class="form-control" placeholder="Digite seu nome completo" @input="formatName" required />
                </div>
                <div class="form-group" style="margin-bottom: 12px;">
                  <label class="form-label" style="color: var(--text-dark) !important;">E-mail</label>
                  <input v-model="checkoutEmail" type="email" class="form-control" placeholder="nome@exemplo.com" @input="formatEmail" required />
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">CPF</label>
                    <input v-model="checkoutCpf" type="text" class="form-control" placeholder="000.000.000-00" @input="formatCPF" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Celular</label>
                    <input v-model="checkoutPhone" type="tel" class="form-control" placeholder="(00) 00000-0000" @input="formatPhone" required />
                  </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Data de Nascimento</label>
                    <input v-model="checkoutBirthDate" type="date" class="form-control" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Sexo</label>
                    <select v-model="checkoutGender" class="form-control" required>
                      <option value="" disabled>Selecione</option>
                      <option value="MASCULINO">Masculino</option>
                      <option value="FEMININO">Feminino</option>
                    </select>
                  </div>
                </div>

                <div class="checkout-section-title">3. Endereço</div>
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Endereço (rua e número)</label>
                    <input v-model="checkoutAddress" type="text" class="form-control" placeholder="Rua Exemplo, 123" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">CEP</label>
                    <input v-model="checkoutZipCode" type="text" class="form-control" placeholder="00000-000" @input="formatCEP" required />
                  </div>
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Bairro</label>
                    <input v-model="checkoutNeighborhood" type="text" class="form-control" placeholder="Bairro" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Complemento (opcional)</label>
                    <input v-model="checkoutComplement" type="text" class="form-control" placeholder="Apto, bloco..." />
                  </div>
                </div>
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 20px;">
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Cidade</label>
                    <input v-model="checkoutCity" type="text" class="form-control" placeholder="Cidade" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label" style="color: var(--text-dark) !important;">Estado</label>
                    <select v-model="checkoutState" class="form-control" required>
                      <option value="" disabled>UF</option>
                      <option v-for="uf in BRAZIL_STATES" :key="uf" :value="uf">{{ uf }}</option>
                    </select>
                  </div>
                </div>

                <div class="checkout-section-title">4. Forma de Pagamento</div>
                <div class="payment-methods-select">
                  <div v-if="cardEnabled" :class="['pay-select-card', { active: checkoutPaymentMethod === 'card' }]" @click="checkoutPaymentMethod = 'card'">
                    <i class="ph ph-credit-card"></i> Cartão de Crédito
                  </div>
                  <div :class="['pay-select-card', { active: checkoutPaymentMethod === 'pix' }]" @click="checkoutPaymentMethod = 'pix'">
                    <i class="ph ph-qr-code"></i> Pix Automático
                  </div>
                </div>

                <!-- Formulário de Cartão -->
                <div v-if="cardEnabled && checkoutPaymentMethod === 'card'" style="display:flex; flex-direction:column; gap:12px;">
                  <div class="form-group">
                    <label class="form-label">Número do Cartão</label>
                    <input v-model="checkoutCardNumber" type="text" class="form-control" placeholder="4444 5555 6666 7777" @input="formatCardNumber" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Nome do Titular (como no cartão)</label>
                    <input v-model="checkoutCardName" type="text" class="form-control" placeholder="JOAO H SILVA" required />
                  </div>
                  <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    <div class="form-group">
                      <label class="form-label">Validade</label>
                      <input v-model="checkoutCardExpiry" type="text" class="form-control" placeholder="MM/AA" @input="formatCardExpiry" required />
                    </div>
                    <div class="form-group">
                      <label class="form-label">CVV</label>
                      <input v-model="checkoutCardCvv" type="text" class="form-control" placeholder="123" @input="formatCardCvv" required />
                    </div>
                  </div>
                </div>

                <!-- Formulário de Pix -->
                <div v-else style="background: var(--bg-gray); padding: 16px; border-radius: var(--radius-sm); border: 1px dashed var(--border-color); text-align: center;">
                  <i class="ph ph-qr-code" style="font-size: 80px; color: var(--secondary); display:block; margin-bottom: 8px;"></i>
                  <strong style="color: var(--secondary); display:block; margin-bottom: 4px;">Pix Automático — QR de autorização após confirmar</strong>
                  <p style="font-size: 12px; color: var(--text-gray); margin-bottom: 0;">Você autoriza a recorrência uma vez no app do banco; a mensalidade é debitada automaticamente todo mês.</p>
                </div>

                <p v-if="checkoutError" style="color:#ef4444; font-size:13px; margin-top:12px;">{{ checkoutError }}</p>

                <p v-if="checkoutError" style="color:#ef4444; font-size:13px; margin:12px 0 0; text-align:center;">{{ checkoutError }}</p>
                <button type="submit" class="btn btn-secondary btn-full" style="margin-top: 24px; font-weight: 700; height: 48px;" :disabled="checkoutLoading">
                  {{ checkoutLoading ? 'Processando...' : 'Confirmar e Ativar Plano' }}
                </button>
              </form>
            </div>

            <!-- Coluna Direita: Resumo do Pedido -->
            <div class="checkout-right" v-if="checkoutPlan">
              <div class="order-summary-box">
                <h4 style="font-size: 15px; color: var(--secondary); margin-bottom: 16px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">Resumo do Pedido</h4>
                <div class="summary-row">
                  <span>Plano Selecionado:</span>
                  <strong>{{ checkoutPlan.planType }}</strong>
                </div>
                <div class="summary-row">
                  <span>Periodicidade:</span>
                  <strong>Mensal</strong>
                </div>
                <div class="summary-row">
                  <span>Forma de Pagamento:</span>
                  <strong>{{ checkoutPaymentMethod === 'card' ? 'Cartão de Crédito' : 'Pix Automático' }}</strong>
                </div>
                <div class="summary-row total">
                  <span>Total a Pagar:</span>
                  <span>{{ checkoutPlan.price }}</span>
                </div>

                <div style="margin-top: 20px; text-align: center; font-size: 12px; color: var(--text-gray);">
                  <i class="ph ph-lock-key" style="margin-right: 4px;"></i> Ambiente 100% criptografado e seguro.
                </div>
              </div>
            </div>
          </div>

          <!-- Passo 2a: Pix Automático pendente (aguardando autorização no banco) -->
          <div v-else-if="checkoutStatus === 'pending' && checkoutPixCode" class="checkout-success-view">
            <i class="ph ph-qr-code" style="font-size: 56px; color: var(--primary); display:block; margin-bottom: 12px;"></i>
            <h2 style="color: var(--secondary); font-size: 22px; font-weight: 800; margin-bottom: 8px;">Autorize o débito automático</h2>
            <p style="color: var(--text-gray); font-size: 14px; max-width: 500px; margin: 0 auto 20px; line-height: 1.6;">
              Escaneie o QR Code (ou use o Copia e Cola) e <strong>autorize a recorrência no app do seu banco</strong>. Você autoriza uma única vez — a mensalidade passa a ser debitada automaticamente todo mês. A assinatura é ativada assim que a autorização for confirmada.
            </p>
            <img v-if="checkoutPixImage" :src="checkoutPixImage" alt="QR Code Pix Automático" style="width: 200px; height: 200px; margin: 0 auto 16px; display:block; border-radius: 8px;" />
            <div class="link-input-group" style="max-width: 460px; margin: 0 auto;">
              <input type="text" class="link-input" :value="checkoutPixCode" readonly />
              <button class="btn btn-primary" @click="copyText(checkoutPixCode)">
                <i class="ph ph-copy"></i> Copiar
              </button>
            </div>
            <p style="font-size:13px; color:var(--text-gray); display:flex; align-items:center; justify-content:center; gap:8px; margin-top:16px;">
              <span class="mini-spinner"></span> Aguardando autorização no banco...
            </p>
            <button class="btn btn-outline" style="min-width: 180px; margin-top: 12px;" @click="showCheckoutModal = false">
              Fechar
            </button>
          </div>

          <!-- Passo 2b: Sucesso (pago na hora — cartão ou fluxo simulado) -->
          <div v-else class="checkout-success-view">
            <i class="ph ph-check-circle success-icon-check" style="font-size: 64px; color: var(--primary); display:block; margin-bottom: 16px;"></i>
            <h2 style="color: var(--secondary); font-size: 24px; font-weight: 800; margin-bottom: 8px;">Parabéns! Assinatura Confirmada!</h2>
            <p style="color: var(--text-gray); font-size: 14px; max-width: 500px; margin: 0 auto 24px; line-height: 1.6;">
              Obrigado, <strong>{{ checkoutName }}</strong>! Seu plano <strong>{{ checkoutPlan?.planType }}</strong> foi ativado com sucesso. Os dados de login e instruções de telemedicina foram enviados para <strong>{{ checkoutEmail }}</strong>.
            </p>
            <button class="btn btn-secondary" style="min-width: 180px;" @click="showCheckoutModal = false">
              Voltar ao Portal
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: CONSULTAS E EXAMES (escolher plataforma -> app Nipomed) -->
    <div v-if="showConsultasModal" class="sso-overlay-custom" @click.self="showConsultasModal = false">
      <div class="consultas-modal">
        <div class="consultas-close" @click="showConsultasModal = false"><i class="ph ph-x"></i></div>
        <i class="ph ph-clipboard-text consultas-hero-icon"></i>
        <h2 class="consultas-title">Consultas e Exames</h2>
        <p class="consultas-subtitle">Baixe o app Nipomed. Selecione o sistema do seu celular:</p>
        <div class="consultas-options">
          <button class="consultas-opt" @click="openNipomedStore('android')">
            <i class="ph ph-android-logo"></i>
            <span>Android</span>
            <small>Google Play</small>
          </button>
          <button class="consultas-opt" @click="openNipomedStore('ios')">
            <i class="ph ph-apple-logo"></i>
            <span>iPhone (iOS)</span>
            <small>App Store</small>
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: PAGAR ASSINATURA COM CARTÃO -->
    <div v-if="showPayCardModal" class="sso-overlay-custom" @click.self="showPayCardModal = false">
      <div class="card-details-modal pay-modal" style="max-width: 440px;">
        <div class="modal-close" @click="showPayCardModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; margin-bottom: 4px;">Pagar com Cartão de Crédito</h3>
        <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 20px;">
          Renovação da assinatura <strong>{{ billingSummary.plan }}</strong> — {{ billingSummary.monthlyValue }}.
        </p>
        <form @submit.prevent="submitCardPayment" style="display:flex; flex-direction:column; gap:12px;">
          <div class="form-group">
            <label class="form-label">Número do cartão</label>
            <input v-model="payCardNumber" type="text" inputmode="numeric" placeholder="0000 0000 0000 0000" class="form-control" required />
          </div>
          <div class="form-group">
            <label class="form-label">Nome impresso no cartão</label>
            <input v-model="payCardName" type="text" placeholder="Como está no cartão" class="form-control" required />
          </div>
          <div style="display:flex; gap:12px;">
            <div class="form-group" style="flex:1;">
              <label class="form-label">Validade (MM/AA)</label>
              <input v-model="payCardExpiry" type="text" placeholder="MM/AA" maxlength="5" class="form-control" required />
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">CVV</label>
              <input v-model="payCardCvv" type="text" inputmode="numeric" placeholder="123" maxlength="4" class="form-control" required />
            </div>
          </div>
          <p v-if="payError" style="color:#ef4444; font-size:13px; margin:0;">{{ payError }}</p>
          <button type="submit" class="btn btn-primary btn-full" :disabled="payLoading">
            <i class="ph ph-lock-key"></i> {{ payLoading ? 'Processando...' : `Pagar ${billingSummary.monthlyValue}` }}
          </button>
          <p style="font-size:11px; color:var(--text-gray); text-align:center; margin:0;">
            <i class="ph ph-lock-key"></i> Pagamento processado com segurança pela Veenca.
          </p>
        </form>
      </div>
    </div>

    <!-- MODAL: PIX DA ASSINATURA (copia-e-cola) -->
    <div v-if="showPayPixModal" class="sso-overlay-custom" @click.self="showPayPixModal = false">
      <div class="card-details-modal pay-modal" style="max-width: 440px; text-align:center;">
        <div class="modal-close" @click="showPayPixModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; margin-bottom: 4px;">Pague via PIX</h3>
        <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">
          A confirmação é automática assim que o pagamento cair.
        </p>
        <img v-if="payPixImage" :src="payPixImage" alt="QR Code PIX" style="width: 200px; height: 200px; margin: 0 auto 16px; display:block; border-radius: 8px;" />
        <div v-if="payPixCode" class="link-input-group" style="margin-bottom: 12px;">
          <input type="text" class="link-input" :value="payPixCode" readonly style="color: var(--text-dark);" />
          <button class="btn btn-primary" @click="copyText(payPixCode)"><i class="ph ph-copy"></i> Copiar</button>
        </div>
        <p v-else style="color:#ef4444; font-size:13px;">Não foi possível obter o código PIX. Tente novamente.</p>
        <p v-if="payPixCode" style="font-size:12px; color:var(--text-gray); display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:12px;">
          <span class="mini-spinner"></span> Aguardando confirmação do pagamento...
        </p>
        <button class="btn btn-outline btn-full" @click="showPayPixModal = false">Fechar</button>
      </div>
    </div>

    <!-- MODAL: HIERARQUIA DA REDE (mesma aparência do admin) -->
    <div v-if="showReferralTreeModal" class="sso-overlay-custom" @click.self="showReferralTreeModal = false">
      <div class="tree-modal-card" style="max-width: 700px; max-height: 85vh; overflow-y: auto;">
        <div class="modal-close" @click="showReferralTreeModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; margin-bottom: 4px;"><i class="ph ph-tree-structure"></i> Rede de Afiliados (Árvore de Indicações)</h3>
        <p style="font-size: 13px; color: var(--text-gray); margin-bottom: 16px;">Sua rede de indicações, até 5 níveis.</p>

        <p v-if="referralTreeLoading" style="color: var(--text-gray); font-size: 13px;">Carregando…</p>
        <template v-else-if="referralTree">
          <div style="background: #fff; border: 1px solid var(--border-color); border-left: 4px solid var(--secondary); padding: 16px; border-radius: var(--radius-sm); margin-bottom: 20px;">
            <strong style="font-size: 16px; color: var(--secondary);">Usuário Raiz: {{ referralTree.name }} (você)</strong>
            <div style="font-size: 13px; color: var(--text-gray); margin-top: 4px;">Plano: {{ referralTree.plan }}</div>
          </div>

          <div class="referral-tree-container" style="background: white; border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 20px; max-height: 400px; overflow-y: auto;">
            <div v-if="(referralTree.children || []).length > 0">
              <div v-for="node1 in referralTree.children" :key="node1.name" class="tree-node depth-1">
                <div class="tree-item-box">
                  <span class="tree-badge l1">1º Nível</span>
                  <strong>{{ node1.name }}</strong>
                  <span class="tree-plan-name">({{ node1.plan }})</span>
                  <span :class="['status-pill', node1.status]" style="font-size: 10px; padding: 1px 6px;">{{ node1.status }}</span>
                </div>
                <div v-if="(node1.children || []).length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                  <div v-for="node2 in node1.children" :key="node2.name" class="tree-node depth-2">
                    <div class="tree-item-box">
                      <span class="tree-badge l2">2º Nível</span>
                      <strong>{{ node2.name }}</strong>
                      <span class="tree-plan-name">({{ node2.plan }})</span>
                      <span :class="['status-pill', node2.status]" style="font-size: 10px; padding: 1px 6px;">{{ node2.status }}</span>
                    </div>
                    <div v-if="(node2.children || []).length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                      <div v-for="node3 in node2.children" :key="node3.name" class="tree-node depth-3">
                        <div class="tree-item-box">
                          <span class="tree-badge l3">3º Nível</span>
                          <strong>{{ node3.name }}</strong>
                          <span class="tree-plan-name">({{ node3.plan }})</span>
                          <span :class="['status-pill', node3.status]" style="font-size: 10px; padding: 1px 6px;">{{ node3.status }}</span>
                        </div>
                        <div v-if="(node3.children || []).length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                          <div v-for="node4 in node3.children" :key="node4.name" class="tree-node depth-4">
                            <div class="tree-item-box">
                              <span class="tree-badge l4">4º Nível</span>
                              <strong>{{ node4.name }}</strong>
                              <span class="tree-plan-name">({{ node4.plan }})</span>
                              <span :class="['status-pill', node4.status]" style="font-size: 10px; padding: 1px 6px;">{{ node4.status }}</span>
                            </div>
                            <div v-if="(node4.children || []).length > 0" style="margin-left: 24px; border-left: 2px dashed #e2e8f0; padding-left: 16px; margin-top: 8px;">
                              <div v-for="node5 in node4.children" :key="node5.name" class="tree-node depth-5">
                                <div class="tree-item-box">
                                  <span class="tree-badge l5">5º Nível</span>
                                  <strong>{{ node5.name }}</strong>
                                  <span class="tree-plan-name">({{ node5.plan }})</span>
                                  <span :class="['status-pill', node5.status]" style="font-size: 10px; padding: 1px 6px;">{{ node5.status }}</span>
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
              Você ainda não possui indicações registradas na sua rede.
            </div>
          </div>
        </template>

        <button class="btn btn-outline btn-full" style="margin-top:16px;" @click="showReferralTreeModal = false">Fechar</button>
      </div>
    </div>

    <!-- MODAL: PAGAMENTO CONFIRMADO (renovação) -->
    <div v-if="showPaySuccessModal" class="sso-overlay-custom" @click.self="showPaySuccessModal = false">
      <div class="card-details-modal pay-modal" style="max-width: 420px; text-align:center;">
        <div class="modal-close" @click="showPaySuccessModal = false"><i class="ph ph-x"></i></div>
        <i class="ph ph-check-circle" style="font-size: 64px; color: var(--primary); display:block; margin-bottom: 12px;"></i>
        <h3 style="font-size: 22px; margin-bottom: 8px;">Pagamento confirmado!</h3>
        <p style="font-size: 14px; color: var(--text-gray); margin-bottom: 20px;">
          Sua assinatura <strong>{{ billingSummary.plan }}</strong> foi renovada com sucesso.
        </p>
        <button class="btn btn-primary btn-full" @click="showPaySuccessModal = false">Concluir</button>
      </div>
    </div>

    <!-- MODAL DE COMPARTILHAMENTO -->
    <div v-if="showShareModal && selectedLink" class="sso-overlay-custom" @click.self="showShareModal = false">
      <div class="card-details-modal" style="max-width: 480px;">
        <div class="modal-close" @click="showShareModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; color: #ffffff !important; margin-bottom: 8px;">Compartilhar Link</h3>
        <p style="font-size: 13px; color: #cbd5e1 !important; margin-bottom: 20px;">
          O link foi copiado para sua área de transferência! Escolha um canal abaixo para enviar:
        </p>

        <div style="display:flex; flex-direction:column; gap:16px;">
          <!-- Campo Copiar Link -->
          <div class="link-input-group">
            <input type="text" class="link-input" :value="selectedLink.url" readonly />
            <button class="btn btn-primary" @click="copyLink(selectedLink.url)">
              <i class="ph ph-copy"></i> Copiar
            </button>
          </div>
          <div v-if="selectedLink.urlAlt" class="link-input-group">
            <input type="text" class="link-input" :value="selectedLink.urlAlt" readonly style="font-size: 12px; opacity: 0.8;" />
            <button class="btn btn-outline" @click="copyLink(selectedLink.urlAlt)">
              <i class="ph ph-copy"></i> Copiar
            </button>
          </div>

          <!-- Canais Rápidos -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <a :href="`https://api.whatsapp.com/send?text=Olá! Veja as vantagens do Viva Mais: ${selectedLink.url}`" target="_blank" class="btn btn-outline" style="display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; background:#22c55e; color:white; border-color:#22c55e; font-weight:600;">
              <i class="ph ph-whatsapp-logo" style="font-size: 20px;"></i> WhatsApp
            </a>
            <a :href="`mailto:?subject=Indicação Viva Mais&body=Olá! Conheça o plano do Viva Mais que estou te indicando: ${selectedLink.url}`" class="btn btn-outline" style="display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; color:white; font-weight:600;">
              <i class="ph ph-envelope" style="font-size: 20px;"></i> E-mail
            </a>
          </div>

          <!-- QR Code Simulado -->
          <div style="background: #334155; border-radius: var(--radius-md); padding: 16px; border: 1px solid #475569; text-align: center; margin-top: 8px;">
            <i class="ph ph-qr-code" style="font-size: 100px; color: #ffffff !important; display:block; margin: 0 auto 8px;"></i>
            <span style="font-size: 12px; color: #cbd5e1 !important; font-weight:600;">QR Code de Afiliado</span>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE RELATÓRIO DO LINK -->
    <div v-if="showReportModal && selectedLink" class="sso-overlay-custom" @click.self="showReportModal = false">
      <div class="card-details-modal" style="max-width: 520px;">
        <div class="modal-close" @click="showReportModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; color: #ffffff !important; margin-bottom: 4px;">Relatório de Desempenho</h3>
        <p style="font-size: 13px; color: #cbd5e1 !important; margin-bottom: 20px;">
          Métricas de conversão para: <strong>{{ selectedLink.name }}</strong>
        </p>

        <div style="display:flex; flex-direction:column; gap:20px;">
          <!-- Grid de Métricas -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <div style="background:#334155; padding:16px; border-radius:var(--radius-md); border:1px solid #475569; text-align:center;">
              <span style="font-size: 12px; color: #cbd5e1 !important; display:block; margin-bottom: 4px; font-weight:500;">Cliques Totais</span>
              <strong style="font-size: 24px; color: #ffffff !important;">{{ selectedLink.cliques }}</strong>
            </div>
            <div style="background:#334155; padding:16px; border-radius:var(--radius-md); border:1px solid #475569; text-align:center;">
              <span style="font-size: 12px; color: #cbd5e1 !important; display:block; margin-bottom: 4px; font-weight:500;">Conversões</span>
              <strong style="font-size: 24px; color: #4ade80 !important;">{{ selectedLink.conversoes }}</strong>
            </div>
          </div>

          <!-- Detalhamento de Comissões -->
          <div style="background:#334155; padding:16px; border-radius:var(--radius-md); border:1px solid #475569;">
            <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #cbd5e1 !important; font-weight:500;">Comissão Gerada:</span>
              <strong style="font-size: 14px; color: #4ade80 !important;">{{ selectedLink.comissao }}</strong>
            </div>
            <div v-if="selectedLink.bonus && selectedLink.bonus !== 'R$ 0,00'" style="display:flex; justify-content:space-between; margin-bottom: 8px;">
              <span style="font-size: 13px; color: #cbd5e1 !important; font-weight:500;">Bônus Indicações Novas:</span>
              <strong style="font-size: 14px; color: #fbbf24 !important;">{{ selectedLink.bonus }}</strong>
            </div>
            <div style="display:flex; justify-content:space-between;">
              <span style="font-size: 13px; color: #cbd5e1 !important; font-weight:500;">Taxa de Conversão:</span>
              <strong style="font-size: 14px; color: #ffffff !important;">{{ selectedLink.cliques > 0 ? ((selectedLink.conversoes / selectedLink.cliques) * 100).toFixed(1) : '0.0' }}%</strong>
            </div>
          </div>

          <!-- Histórico de Conversões Simuladas -->
          <div>
            <h4 style="font-size: 14px; color: #f1f5f9 !important; margin-bottom: 12px; font-weight:600;">Histórico de Clientes Convertidos</h4>
            <div v-if="selectedLink.conversoes > 0" style="display:flex; flex-direction:column; gap:8px; max-height:160px; overflow-y:auto; padding-right:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:var(--radius-sm); font-size:12px;">
                <span style="color:white; font-weight:500;">Carlos Silva</span>
                <span style="color:#94a3b8 !important;">Há 3 dias • Ativo</span>
              </div>
              <div v-if="selectedLink.conversoes > 1" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:var(--radius-sm); font-size:12px;">
                <span style="color:white; font-weight:500;">Ana Martins</span>
                <span style="color:#94a3b8 !important;">Há 5 dias • Ativo</span>
              </div>
              <div v-if="selectedLink.conversoes > 2" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:8px 12px; border-radius:var(--radius-sm); font-size:12px;">
                <span style="color:white; font-weight:500;">Simulação Cliente #{{ selectedLink.conversoes }}</span>
                <span style="color:#94a3b8 !important;">Hoje • Ativo</span>
              </div>
            </div>
            <p v-else style="font-size:12px; color:#cbd5e1 !important; text-align:center; padding:12px 0; border:1px dashed rgba(255,255,255,0.1); border-radius:var(--radius-sm);">
              Nenhuma conversão registrada para este link ainda.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE EDIÇÃO DE LINK -->
    <div v-if="showEditLinkModal && selectedLink" class="sso-overlay-custom" @click.self="showEditLinkModal = false">
      <div class="card-details-modal" style="max-width: 480px;">
        <div class="modal-close" @click="showEditLinkModal = false"><i class="ph ph-x"></i></div>
        <h3 style="font-size: 20px; color: #ffffff !important; margin-bottom: 8px;">Editar Link de Indicação</h3>
        <p style="font-size: 13px; color: #cbd5e1 !important; margin-bottom: 20px;">
          Modifique as informações de identificação do seu link.
        </p>

        <form @submit.prevent="saveEditedLink" style="display:flex; flex-direction:column; gap:16px;">
          <div class="form-group">
            <label class="form-label">Nome do Link</label>
            <input v-model="editLinkName" type="text" class="form-control" required />
          </div>

          <div class="form-group">
            <label class="form-label">Plano Viva Mais</label>
            <select v-model="editLinkPlanType" class="form-control" required>
              <option value="Individual">Plano Individual — {{ planPrices.Individual }}</option>
              <option value="Família">Plano Família — {{ planPrices['Família'] }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Código de Indicação (Ref)</label>
            <input v-model="editLinkRefCode" type="text" class="form-control" required />
          </div>

          <div class="form-group">
            <label class="form-label">Status do Link</label>
            <select v-model="editLinkStatus" class="form-control" required>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
            </select>
          </div>

          <div style="display:flex; gap:12px; margin-top: 12px;">
            <button type="button" class="btn btn-outline" style="flex:1;" @click="showEditLinkModal = false">Cancelar</button>
            <button type="submit" class="btn btn-secondary" style="flex:1;">Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL DE CARTEIRINHA DIGITAL DETALHADA -->
    <div v-if="showCardModal" class="sso-overlay-custom" @click.self="showCardModal = false">
      <div class="card-details-modal">
        <div class="modal-close" @click="showCardModal = false"><i class="ph ph-x"></i></div>
        <div class="digital-card-preview full-size">
          <div class="dcard-header">
            <div class="dcard-logo-box">
              <img src="/logo.png" alt="Logo Viva Mais" class="dcard-logo" />
            </div>
            <span class="badge badge-success">Premium</span>
          </div>
          <div class="dcard-body">
            <h3>{{ user.name }}</h3>
            <p class="dcard-plan">Plano: {{ user.plan }}</p>
            <p class="dcard-cpf">CPF: {{ cpf }}</p>
          </div>
          <div class="qr-code-area">
            <i class="ph ph-qr-code large-qr"></i>
            <p>Apresente este código para atendimento nos parceiros.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL: CONFIRMAR SOLICITAÇÃO DE SAQUE -->
    <div v-if="showWithdrawModal" class="sso-overlay-custom" @click.self="showWithdrawModal = false">
      <div class="telemed-modal-card">
        <div class="modal-close" @click="showWithdrawModal = false"><i class="ph ph-x"></i></div>

        <div class="telemed-modal-header">
          <div class="telemed-icon-badge" style="background:#fffbeb; border-color:#fde68a; color:#d97706;">
            <i class="ph ph-hand-coins"></i>
          </div>
          <div>
            <h3 class="telemed-title">Solicitar Saque</h3>
            <p class="telemed-subtitle">Confirme o valor que deseja retirar:</p>
          </div>
        </div>

        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:var(--radius-md); padding:16px; margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:13px; color:var(--text-gray);">Ganhos acumulados:</span>
            <strong style="font-size:14px;">{{ withdrawSummary.earnedLabel }}</strong>
          </div>
          <div v-if="withdrawSummary.paid > 0" style="display:flex; justify-content:space-between; margin-bottom:8px;">
            <span style="font-size:13px; color:var(--text-gray);">Já sacado:</span>
            <strong style="font-size:14px;">- {{ withdrawSummary.paidLabel }}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; padding-top:8px; border-top:1px dashed #cbd5e1;">
            <span style="font-size:14px; font-weight:600;">Valor do saque:</span>
            <strong style="font-size:20px; color:#059669;">{{ withdrawSummary.availableLabel }}</strong>
          </div>
        </div>

        <p style="font-size:13px; color:var(--text-gray); margin-bottom:20px;">
          O valor ficará <strong>pendente</strong> até a liberação pela equipe financeira. Você receberá um e-mail assim que o pagamento for realizado.
        </p>

        <div class="telemed-modal-footer">
          <button class="btn btn-outline" @click="showWithdrawModal = false" :disabled="withdrawLoading">
            Cancelar
          </button>
          <button class="btn btn-primary" @click="confirmWithdraw" :disabled="withdrawLoading">
            <i v-if="withdrawLoading" class="mini-spinner"></i>
            <i v-else class="ph ph-check"></i>
            {{ withdrawLoading ? 'Solicitando...' : 'Confirmar Saque' }}
          </button>
        </div>
      </div>
    </div>

    <!-- MODAL: SELEÇÃO DE PACIENTE (TELEMEDICINA 24H) -->
    <div v-if="showTelemedicinaModal" class="sso-overlay-custom" @click.self="showTelemedicinaModal = false">
      <div class="telemed-modal-card">
        <div class="modal-close" @click="showTelemedicinaModal = false"><i class="ph ph-x"></i></div>
        
        <div class="telemed-modal-header">
          <div class="telemed-icon-badge">
            <i class="ph ph-first-aid"></i>
          </div>
          <div>
            <h3 class="telemed-title">Agendar Telemedicina 24h</h3>
            <p class="telemed-subtitle">Selecione quem passará pelo atendimento médico:</p>
          </div>
        </div>

        <div class="telemed-beneficiaries-list">
          <!-- Titular -->
          <div 
            class="telemed-patient-card" 
            :class="{ active: selectedTelemedTarget === 'titular' }"
            @click="selectedTelemedTarget = 'titular'"
          >
            <div class="patient-avatar-circle">
              {{ (user?.name || 'U').split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('') }}
            </div>
            <div class="patient-info">
              <div class="patient-name-row">
                <strong>{{ user?.name }}</strong>
                <span class="patient-role-badge holder">Titular</span>
              </div>
              <span class="patient-doc">CPF: {{ maskCpf(cpf || user?.cpf) }}</span>
            </div>
            <div class="patient-radio">
              <i v-if="selectedTelemedTarget === 'titular'" class="ph ph-check-circle-fill" style="color: #00b9b5; font-size: 24px;"></i>
              <div v-else class="radio-circle"></div>
            </div>
          </div>

          <!-- Dependentes (só kids/teen) -->
          <template v-if="telemedDependents.length > 0">
            <div
              v-for="dep in telemedDependents"
              :key="dep.id"
              class="telemed-patient-card"
              :class="{ active: selectedTelemedTarget === dep.id }"
              @click="selectedTelemedTarget = dep.id"
            >
              <div class="patient-avatar-circle dep">
                {{ (dep.name || 'D').split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('') }}
              </div>
              <div class="patient-info">
                <div class="patient-name-row">
                  <strong>{{ dep.name }}</strong>
                  <span class="patient-role-badge">{{ dep.ageGroup === 'kids' ? 'Kids' : 'Teen' }}</span>
                </div>
                <span class="patient-doc">CPF: {{ maskCpf(dep.cpf) }}</span>
              </div>
              <div class="patient-radio">
                <i v-if="selectedTelemedTarget === dep.id" class="ph ph-check-circle-fill" style="color: #00b9b5; font-size: 24px;"></i>
                <div v-else class="radio-circle"></div>
              </div>
            </div>
          </template>
        </div>

        <div class="telemed-modal-footer">
          <button class="btn btn-outline" @click="showTelemedicinaModal = false" :disabled="telemedLoading">
            Cancelar
          </button>
          <button class="btn btn-primary" @click="confirmTelemedicina" :disabled="telemedLoading">
            <i v-if="telemedLoading" class="mini-spinner"></i>
            <i v-else class="ph ph-video-camera"></i>
            {{ telemedLoading ? 'Conectando...' : 'Iniciar Atendimento' }}
          </button>
        </div>

        <div class="telemed-security-note">
          <i class="ph ph-shield-check"></i>
          <span>Atendimento médico 100% online, seguro e confidencial.</span>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.dashboard-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-wrapper.desktop .tab-content {
  min-width: 0;
}

.welcome-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.welcome-text h1 {
  font-size: 26px;
  color: var(--secondary);
}

.dashboard-wrapper.desktop .welcome-section {
  margin: 8px 0 24px;
}

.dashboard-wrapper.desktop .welcome-text h1 {
  color: var(--primary);
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.045em;
}

.dashboard-wrapper.desktop .welcome-text h1::after {
  content: ' 👋';
  font-size: 25px;
  letter-spacing: 0;
}

.dashboard-wrapper.desktop .welcome-text p {
  max-width: 380px;
  font-size: 13px;
  line-height: 1.55;
}

.welcome-text p {
  font-size: 14px;
  color: var(--text-gray);
}

.plan-pill {
  background: white;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.dashboard-wrapper.desktop .plan-pill {
  padding: 11px 15px;
  border-color: #edf0f4;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(15, 58, 74, 0.04);
}

.plan-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-dark);
}

/* Slider Ampliado Contínuo */
.banner-slider {
  position: relative;
  border-radius: var(--radius-lg);
  overflow: hidden;
  height: 385px;
  box-shadow: var(--shadow-md);
  background-color: #031d44;
}

.slider-track {
  display: flex;
  height: 100%;
  width: 100%;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-item {
  min-width: 100%;
  height: 100%;
  background-size: cover;
  background-position: right center;
  background-repeat: no-repeat;
  background-color: #031d44;
  padding: 46px 44px;
  display: flex;
  align-items: center;
  color: white;
  flex-shrink: 0;
}

.slide-content {
  max-width: 44%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  z-index: 2;
}

.slide-content h2 {
  font-size: 32px;
  color: white;
  margin-top: 4px;
}

.slide-content p {
  font-size: 15px;
  opacity: 0.92;
  line-height: 1.6;
}

.dashboard-wrapper.desktop .slide-item {
  background-position: right center;
}

.dashboard-wrapper.desktop .slide-content .badge {
  background: var(--primary);
  color: #fff;
  font-size: 10px;
}

.dashboard-wrapper.desktop .slide-content h2 {
  max-width: 420px;
  line-height: 1.18;
}

.dashboard-wrapper.desktop .slide-content h2::first-line {
  color: #fff;
}

.dashboard-wrapper.desktop .slide-content p {
  max-width: 390px;
  line-height: 1.5;
}

.dashboard-wrapper.desktop .slide-content .btn {
  padding: 11px 20px;
  background: var(--primary);
  border-radius: 11px;
}

.slide-indicator-container {
  position: absolute;
  bottom: 20px;
  right: 20px;
  display: flex;
  gap: 8px;
  z-index: 10;
}

.indicator-dot {
  width: 8px;
  height: 8px;
  background: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  cursor: pointer;
  transition: var(--transition);
}

.indicator-dot.active {
  background: white;
  transform: scale(1.3);
}

/* Grade de Métricas */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin: 28px 0 32px;
}

.dashboard-wrapper.desktop .metrics-grid {
  margin: 28px 0 34px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dashboard-wrapper.desktop .metric-card {
  min-height: 170px;
  padding: 19px;
  border-radius: 13px;
  border-color: #eef1f5;
  box-shadow: 0 4px 14px rgba(15, 58, 74, 0.035);
}

.dashboard-wrapper.desktop .metric-card h3 {
  color: var(--primary);
  font-size: 24px;
}

.dashboard-wrapper.desktop .metric-card p {
  line-height: 1.5;
}

.renew-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: white;
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--secondary);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}
.renew-info { display: flex; align-items: center; gap: 14px; }
.renew-info i { font-size: 28px; color: var(--secondary); }
.renew-info strong { display: block; color: var(--text-dark); font-size: 15px; }
.renew-info span { font-size: 13px; color: var(--text-gray); }

.metric-clickable {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.metric-clickable:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.metric-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-gray);
  font-weight: 500;
}

.metric-header i {
  font-size: 18px;
  color: var(--primary-hover);
}

.metric-card h3 {
  font-size: 24px;
  color: var(--secondary);
  margin: 4px 0 2px;
}

.metric-card p {
  font-size: 12px;
  color: var(--text-light-gray);
}

/* Layout Grid Principal */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1.18fr 0.9fr;
  gap: 30px;
}

@media (max-width: 992px) {
  .dashboard-grid {
    grid-template-columns: 1fr;
  }
}

.section-title {
  font-size: 18px;
  margin-bottom: 16px;
  color: var(--secondary);
}

.dashboard-wrapper.desktop .section-title {
  color: var(--primary);
  font-size: 17px;
  font-weight: 700;
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.shortcut-locked {
  opacity: 0.55;
  filter: grayscale(0.5);
}

/* Sub-Abas do Programa de Indicações */
.referral-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid #e2e8f0;
  margin-bottom: 24px;
  position: relative;
}

.ref-tab-btn {
  border: none;
  background: transparent;
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-gray);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: color 0.15s ease;
  white-space: nowrap;
  position: relative;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
}

.ref-tab-btn:hover {
  color: var(--secondary);
}

.ref-tab-btn.active {
  color: var(--primary) !important;
  font-weight: 700;
  border-bottom: 2px solid var(--primary) !important;
  margin-bottom: -2px;
}

/* Abas de "Minha Conta" */
.account-tabs {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0;
  overflow-x: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
}
.account-tabs::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.account-tab {
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-gray);
  padding: 10px 16px 12px 16px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: var(--transition);
  white-space: nowrap;
}
.account-tab i {
  font-size: 16px;
}
.account-tab.active {
  color: var(--secondary);
  border-bottom-color: var(--secondary);
}
.account-tab:hover {
  color: var(--secondary);
}

.shortcut-card {
  background: white;
  border: 1px solid var(--border-color);
  padding: 18px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: var(--transition);
}

.dashboard-wrapper.desktop .shortcut-card {
  min-height: 76px;
  padding: 14px 16px;
  gap: 14px;
  border-color: #edf0f4;
  border-radius: 10px;
  box-shadow: none;
}

.shortcut-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.shortcut-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.dashboard-wrapper.desktop .shortcut-icon {
  width: 44px;
  height: 44px;
  font-size: 20px;
}

.icon-teal { background: var(--secondary-light); color: var(--secondary-hover); }
.icon-pink { background: var(--primary-light); color: var(--primary); }
.icon-green { background: #EDF8F8; color: var(--secondary-hover); }
.icon-orange { background: #F1F6FC; color: var(--primary); }

.shortcut-details {
  flex-grow: 1;
}

.shortcut-details h3 {
  font-size: 15px;
  color: var(--text-dark);
  margin-bottom: 2px;
}

.dashboard-wrapper.desktop .shortcut-details h3 {
  color: var(--primary);
  font-size: 15px;
  margin-bottom: 2px;
}

.shortcut-details p {
  font-size: 12px;
  color: var(--text-gray);
  margin-bottom: 0;
}

.dashboard-wrapper.desktop .shortcut-details p {
  font-size: 12px;
  line-height: 1.4;
}

.action-arrow {
  color: var(--text-light-gray);
  transition: var(--transition);
}

.shortcut-card:hover .action-arrow {
  transform: translateX(4px);
  color: var(--primary-hover);
}

/* Carteirinha Digital */
.digital-card-preview {
  background: var(--primary);
  color: white;
  padding: 24px;
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 20px;
  cursor: pointer;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-md);
}

.dashboard-wrapper.desktop .digital-card-preview {
  min-height: 240px;
  padding: 24px;
  border: 0;
  border-radius: 14px;
  box-shadow: 0 10px 24px rgba(8, 44, 99, 0.16);
}

.digital-card-preview::before {
  content: '';
  position: absolute;
  top: -50%;
  right: -20%;
  width: 250px;
  height: 250px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 50%;
}

.digital-card-preview:hover {
  transform: scale(1.02);
  box-shadow: var(--shadow-lg);
}

.dcard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dcard-logo-box {
  background: #ffffff; /* Fundo totalmente branco para realçar o logotipo */
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
}

.dashboard-wrapper.desktop .dcard-logo-box {
  padding: 5px 9px;
  border-radius: 7px;
}

.dcard-logo {
  max-height: 24px;
}

.dashboard-wrapper.desktop .dcard-logo {
  max-height: 22px;
}

.dcard-body h3 {
  color: white;
  font-size: 18px;
  margin-bottom: 6px;
}

.dcard-plan, .dcard-cpf {
  font-size: 13px;
  opacity: 0.8;
}

.dcard-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 12px;
  font-size: 12px;
  opacity: 0.8;
}

/* Margem Aumentada nas Atividades Recentes */
.activities-wrapper {
  margin-top: 40px;
}

.activities-card {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.activity-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.activity-dot.health { background: #3b82f6; }
.activity-dot.clube { background: #f59e0b; }
.activity-dot.pet { background: #10b981; }

.activity-text p {
  font-size: 13px;
  color: var(--text-dark);
}

.activity-text span {
  font-size: 11px;
  color: var(--text-light-gray);
}

/* Modal Carteirinha */
.card-details-modal {
  background: #1e293b;
  padding: 32px;
  border-radius: var(--radius-xl);
  max-width: 400px;
  width: 90%;
  box-shadow: var(--shadow-lg);
  position: relative;
  color: #f8fafc;
}

.card-details-modal h3 {
  color: #ffffff !important;
}

.card-details-modal h4 {
  color: #f1f5f9 !important;
}

.card-details-modal p {
  color: #cbd5e1 !important;
}

.card-details-modal span {
  color: #94a3b8 !important;
}

.card-details-modal .form-label,
.card-details-modal label {
  color: #f1f5f9 !important;
  font-weight: 500;
}

.card-details-modal .form-control {
  background: #0f172a !important;
  color: #ffffff !important;
  border: 1px solid #334155 !important;
}

.card-details-modal .form-control:focus {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2) !important;
}

/* Modais de pagamento: card branco, inputs claros (sobrepõe o tema escuro do card-details-modal) */
.pay-modal {
  background: #ffffff !important;
  color: var(--text-dark) !important;
  padding: 32px;
}

.pay-modal .modal-close { color: var(--text-gray); }
.pay-modal h3 { color: var(--secondary) !important; }
.pay-modal p { color: var(--text-gray) !important; }
.pay-modal p strong { color: var(--text-dark) !important; }
.pay-modal span { color: var(--text-dark) !important; }

.pay-modal .form-label,
.pay-modal label {
  color: var(--text-dark) !important;
  font-weight: 600;
  font-size: 13px;
  display: block;
  margin-bottom: 6px;
}

.pay-modal .form-control {
  background: #ffffff !important;
  color: var(--text-dark) !important;
  border: 1px solid #d1d5db !important;
  border-radius: var(--radius-md);
  padding: 12px 14px;
  width: 100%;
}

.pay-modal .form-control::placeholder { color: #9ca3af !important; }

.pay-modal .form-control:focus {
  border-color: var(--primary) !important;
  box-shadow: 0 0 0 3px rgba(33, 92, 255, 0.15) !important;
  outline: none;
}

.pay-modal .link-input {
  background: #f9fafb !important;
  color: var(--text-dark) !important;
  border: 1px solid #d1d5db !important;
}

.mini-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  display: inline-block;
  animation: mini-spin 0.8s linear infinite;
}

@keyframes mini-spin { to { transform: rotate(360deg); } }

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  color: white;
  font-size: 20px;
  cursor: pointer;
}

.digital-card-preview.full-size {
  background: var(--primary);
  cursor: default;
}

.digital-card-preview.full-size:hover {
  transform: none;
}

.qr-code-area {
  background: white;
  border-radius: var(--radius-md);
  padding: 20px;
  text-align: center;
  color: var(--text-dark);
  margin-top: 12px;
}

.large-qr {
  font-size: 140px;
  color: var(--text-dark);
}

.qr-code-area p {
  font-size: 11px;
  margin-top: 10px;
  color: var(--text-gray);
}

/* SSO Modals */
.sso-overlay-custom {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
}

.sso-modal-box {
  background: white;
  padding: 40px;
  border-radius: var(--radius-lg);
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: var(--shadow-lg);
}

.loader-circle {
  width: 48px;
  height: 48px;
  border: 4px solid var(--border-color);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Formulários */
.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.flex-1 {
  flex: 1;
  min-width: 200px;
}

/* Melhorias do Financeiro */
.financial-grid {
  display: grid;
  grid-template-columns: 1.2fr 1.8fr;
  gap: 28px;
}

@media (max-width: 992px) {
  .financial-grid {
    grid-template-columns: 1fr;
  }
}

.financial-main-card {
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.billing-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 20px;
}

.plan-title {
  font-size: 20px;
  color: var(--secondary);
  margin-top: 8px;
}

.price-block {
  display: flex;
  align-items: baseline;
  color: var(--secondary);
}

.currency {
  font-size: 14px;
  font-weight: 600;
  margin-right: 2px;
}

.price-val {
  font-size: 32px;
  font-weight: 800;
}

.period {
  font-size: 13px;
  color: var(--text-gray);
  margin-left: 2px;
}

.billing-details-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.detail-row span {
  color: var(--text-gray);
}

.detail-row strong {
  color: var(--text-dark);
}

.billing-actions {
  display: flex;
  gap: 12px;
}

.billing-actions .btn {
  flex: 1;
}

/* Histórico de Faturamento */
.financial-history-card {
  padding: 32px;
}

.financial-history-card h3 {
  font-size: 18px;
  color: var(--secondary);
  margin-bottom: 20px;
}

.invoices-list-v2 {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.invoice-item-v2 {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-gray);
  flex-wrap: wrap;
  gap: 16px;
}

.inv-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-large {
  font-size: 28px;
}

.inv-info strong {
  display: block;
  font-size: 15px;
  color: var(--text-dark);
}

.inv-info span {
  font-size: 12px;
  color: var(--text-gray);
}

.inv-value {
  display: flex;
  align-items: center;
  gap: 20px;
}

.inv-value span {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-dark);
}

.btn-receipt-download {
  background: transparent;
  border: 1px solid var(--primary-hover);
  color: var(--primary-hover);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: var(--transition);
}

.btn-receipt-download:hover {
  background: var(--primary-light);
}

/* PWA Overrides */
.pwa {
  padding: 16px;
}

.pwa .banner-slider {
  height: 232px;
  background: var(--primary);
}

.pwa .slider-track {
  transform: translateX(0) !important;
}

.pwa .slide-item {
  padding: 24px;
  background-image: none !important;
  background-color: var(--primary) !important;
}

.pwa .slide-item:nth-child(n + 2) {
  display: none;
}

.pwa .slide-content {
  max-width: 100%;
  gap: 10px;
}

.pwa .slide-content h2 {
  max-width: 310px;
  font-size: 23px;
  line-height: 1.25;
}

.pwa .slide-content p {
  max-width: 310px;
  font-size: 13px;
  line-height: 1.5;
}

.pwa .slide-content .btn {
  min-width: 166px;
  padding: 11px 18px;
}

.pwa .slide-indicator-container {
  display: none;
}

.pwa .dashboard-grid {
  grid-template-columns: 1fr;
  gap: 20px;
}

.pwa .financial-grid {
  grid-template-columns: 1fr;
}

.pwa .billing-actions {
  flex-direction: column;
  gap: 10px;
}

.pwa .config-grid {
  grid-template-columns: 1fr;
}

/* Config Grid & Sections */
.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 24px;
  margin-top: 20px;
}

.config-section-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-section-card h3 {
  font-size: 16px;
  color: var(--secondary);
}

.config-desc {
  font-size: 13px;
  color: var(--text-gray);
  line-height: 1.5;
}

.notification-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notification-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-color);
}

.notification-row:last-child {
  border-bottom: none;
}

.notif-text strong {
  display: block;
  font-size: 14px;
  color: var(--text-dark);
}

.notif-text p {
  font-size: 12px;
  color: var(--text-gray);
}

/* Modal de hierarquia — fundo branco (tema claro) */
.tree-modal-card {
  background: #ffffff;
  color: var(--text-dark);
  padding: 28px;
  border-radius: var(--radius-xl);
  width: 90%;
  box-shadow: var(--shadow-lg);
  position: relative;
}
.tree-modal-card h3 { color: var(--secondary); }
.tree-modal-card .modal-close { position:absolute; top:16px; right:16px; cursor:pointer; color:var(--text-gray); font-size:20px; }

/* Linha de indicado clicável (abre hierarquia) */
.ref-row-clickable { cursor: pointer; transition: background 0.15s; }
.ref-row-clickable:hover { background: #f8fafc; }

/* Árvore de indicações no modal (mesma aparência do admin) */
.referral-tree-container { font-family: inherit; }
.tree-node { margin-bottom: 12px; }
.tree-item-box {
  display: inline-flex; align-items: center; gap: 10px;
  background: #f8fafc; border: 1px solid var(--border-color);
  padding: 8px 16px; border-radius: var(--radius-sm);
  font-size: 13px; color: var(--text-dark);
}
.tree-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: var(--radius-sm); color: white; }
.tree-badge.l1 { background: #3b82f6; }
.tree-badge.l2 { background: #8b5cf6; }
.tree-badge.l3 { background: #ec4899; }
.tree-badge.l4 { background: #f59e0b; }
.tree-badge.l5 { background: #10b981; }
.tree-plan-name { font-size: 11px; color: var(--text-gray); }
.status-pill {
  display: inline-block; font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: var(--radius-full); text-transform: capitalize;
}
.status-pill.ativo { background: #dcfce7; color: #15803d; }
.status-pill.pendente { background: #fef3c7; color: #d97706; }
.status-pill.inativo { background: #fee2e2; color: #b91c1c; }

.consultas-modal {
  position: relative;
  background: #ffffff;
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  max-width: 420px;
  width: 90%;
  text-align: center;
  box-shadow: var(--shadow-lg);
}
.consultas-close {
  position: absolute; top: 14px; right: 16px; cursor: pointer;
  color: var(--text-gray); font-size: 20px; line-height: 1;
}
.consultas-close:hover { color: var(--text-dark); }
.consultas-hero-icon {
  font-size: 44px; color: var(--secondary);
  display: inline-flex; align-items: center; justify-content: center;
  width: 76px; height: 76px; border-radius: 50%;
  background: var(--primary-light, #e6f2f5); margin-bottom: 12px;
}
.consultas-title { color: var(--secondary); font-size: 20px; font-weight: 700; margin-bottom: 6px; }
.consultas-subtitle { color: var(--text-gray); font-size: 14px; margin-bottom: 22px; }

.consultas-options { display: flex; gap: 12px; }
.consultas-opt {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 18px 12px;
  background: #f8fafc;
  border: 1.5px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
}
.consultas-opt:hover { border-color: var(--secondary); background: var(--primary-light, #e6f2f5); transform: translateY(-2px); }
.consultas-opt i { font-size: 34px; color: var(--secondary); }
.consultas-opt span { font-weight: 600; color: var(--text-dark); font-size: 14px; }
.consultas-opt small { color: var(--text-gray); font-size: 11px; }

/* Paginação da Tabela */
.table-pagination-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  background: #fcfdfe;
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  font-size: 13px;
  color: var(--text-gray);
}
.pagination-info strong {
  color: var(--text-dark);
}

.pagination-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.btn-pagination-nav {
  background: #fff;
  border: 1px solid var(--border-color);
  color: var(--text-dark);
  padding: 6px 12px;
  border-radius: var(--radius-sm, 6px);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}
.btn-pagination-nav:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.btn-pagination-nav:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  background: #f8fafc;
}

.pagination-pages {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-page-number {
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--border-color);
  background: #fff;
  color: var(--text-dark);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}
.btn-page-number:hover:not(.active) {
  background: #f1f5f9;
}
.btn-page-number.active {
  background: var(--secondary);
  color: #fff;
  border-color: var(--secondary);
}

/* Modal de Seleção de Paciente Telemedicina */
.telemed-modal-card {
  position: relative;
  background: #ffffff;
  border-radius: var(--radius-lg, 16px);
  padding: 30px 26px;
  max-width: 460px;
  width: 90%;
  box-shadow: var(--shadow-lg, 0 20px 40px rgba(0,0,0,0.15));
  animation: modalFadeIn 0.2s ease;
}

@keyframes modalFadeIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.telemed-modal-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 22px;
}

.telemed-icon-badge {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(0, 185, 181, 0.12);
  color: var(--primary, #00b9b5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  flex-shrink: 0;
}

.telemed-title {
  color: var(--secondary, #052453);
  font-size: 19px;
  font-weight: 700;
  margin: 0 0 4px;
}

.telemed-subtitle {
  color: var(--text-gray, #64748b);
  font-size: 13px;
  margin: 0;
  line-height: 1.4;
}

.telemed-beneficiaries-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
  max-height: 270px;
  overflow-y: auto;
  padding-right: 2px;
}

.telemed-patient-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 2px solid #e2e8f0;
  border-radius: var(--radius-md, 12px);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  background: #ffffff;
  user-select: none;
}

.telemed-patient-card:hover {
  border-color: var(--primary, #00b9b5);
  background: #f8fafc;
  transform: translateY(-1px);
}

.telemed-patient-card.active {
  border-color: var(--primary, #00b9b5);
  background: rgba(0, 185, 181, 0.05);
}

.patient-avatar-circle {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--secondary, #052453);
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}

.patient-avatar-circle.dep {
  background: var(--primary, #00b9b5);
}

.patient-info {
  flex: 1;
  min-width: 0;
}

.patient-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.patient-name-row strong {
  font-size: 14px;
  color: var(--text-dark, #0f172a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.patient-role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  background: #e0f2fe;
  color: #0284c7;
  text-transform: uppercase;
}

.patient-role-badge.holder {
  background: #ecfdf5;
  color: #059669;
}

.patient-doc {
  font-size: 12px;
  color: var(--text-gray, #64748b);
  margin-top: 3px;
  display: block;
}

.patient-radio {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
}

.radio-circle {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid #cbd5e1;
}

.telemed-no-deps-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-gray, #64748b);
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px dashed #cbd5e1;
}

.telemed-modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-bottom: 14px;
}

.telemed-security-note {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
  justify-content: center;
  text-align: center;
}
</style>
