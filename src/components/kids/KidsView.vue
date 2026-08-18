<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { api, clearToken } from '../../services/api'
import { kidsAudio } from './services/audio'
import { COLORING_TEMPLATES } from './data/drawings'
import { GAMES_CATALOG } from './data/games'

const props = defineProps({
  user: {
    type: Object,
    default: null
  },
  isLoggedIn: {
    type: Boolean,
    default: false
  },
  subRoute: {
    type: String,
    default: 'dashboard' // 'auth' | 'dashboard'
  }
})

const emit = defineEmits(['goHome', 'login', 'logout', 'triggerDevModal'])

// --- ROTEAMENTO INTERNO KIDS (SEM HISTORINHAS) ---
const activeTab = ref('home') // 'home' | 'games' | 'paint' | 'draw' | 'profile'
const isAudioMuted = ref(false)
const showHeaderMenu = ref(false)
const headerMenuRef = ref(null)

// --- GESTÃO DE USUÁRIO & DEPENDENTES ---
const dependentsList = ref([])
const activeProfileId = ref(localStorage.getItem('viva_kids_active_profile') || 'titular')

const defaultUserData = {
  name: props.user?.name ? props.user.name.split(' ')[0] : 'Estudante',
  email: props.user?.email || '',
  avatar: '⭐',
  stars: 0,
  artworks: [],
  achievements: [
    { id: 'first_login', title: 'Acesso Viva Mais', icon: '⭐', unlocked: true, desc: 'Acessou a plataforma Kids' },
    { id: 'draw_artist', title: 'Pequeno Artista', icon: '🎨', unlocked: false, desc: 'Salvou uma obra na lousa' },
    { id: 'game_master', title: 'Campeão dos Jogos', icon: '🎮', unlocked: false, desc: 'Jogou mais de 5 partidas na vitrine' },
    { id: 'paint_hero', title: 'Mestre das Cores', icon: '🖌️', unlocked: false, desc: 'Completou um quadro no livro de pintura' }
  ]
}

const kidUser = reactive({ ...defaultUserData })

function getStorageKey(profileId) {
  return `viva_kids_user_${profileId || 'titular'}`
}

function loadKidProfile(profileId = 'titular') {
  const saved = localStorage.getItem(getStorageKey(profileId))
  let data = null
  if (saved) {
    try { data = JSON.parse(saved) } catch {}
  }
  if (!data) data = { ...defaultUserData }

  const dep = dependentsList.value.find(d => String(d.id) === String(profileId))
  if (dep) {
    kidUser.name = dep.name.split(' ')[0]
    kidUser.avatar = dep.avatar || '🧒'
    kidUser.stars = Number(data.stars || 0)
  } else {
    kidUser.name = props.user?.name ? props.user.name.split(' ')[0] : (data.name || 'Estudante')
    kidUser.avatar = '⭐'
    kidUser.stars = Number(data.stars || 0)
  }

  kidUser.email = data.email || props.user?.email || ''
  kidUser.artworks = data.artworks || []
  kidUser.achievements = data.achievements || defaultUserData.achievements
}

function saveKidProfile() {
  localStorage.setItem(getStorageKey(activeProfileId.value), JSON.stringify(kidUser))
  localStorage.setItem('viva_kids_user', JSON.stringify(kidUser))
}

async function fetchDependents() {
  if (!props.isLoggedIn) return
  try {
    const data = await api.get('/dependents')
    if (data?.dependents && Array.isArray(data.dependents)) {
      dependentsList.value = data.dependents
    } else if (Array.isArray(data)) {
      dependentsList.value = data
    } else {
      dependentsList.value = []
    }
  } catch {
    dependentsList.value = []
  }
}

function switchProfile(profileId) {
  activeProfileId.value = String(profileId)
  localStorage.setItem('viva_kids_active_profile', activeProfileId.value)

  const dep = dependentsList.value.find(d => String(d.id) === String(profileId))
  if (dep) {
    kidUser.name = dep.name.split(' ')[0]
    kidUser.avatar = dep.avatar || '🧒'
  } else {
    kidUser.name = props.user?.name ? props.user.name.split(' ')[0] : 'Leandro'
    kidUser.avatar = '⭐'
  }

  loadKidProfile(activeProfileId.value)
  saveKidProfile()
  kidsAudio.playPop()
  showToast(5, `Perfil trocado para ${kidUser.name}!`)
}

// --- LOGIN INTERNO NO KIDS (/kids/auth) — apenas CPF, sem senha ---
const KIDS_TEEN_SESSION_KEY = 'viva_kidsteen_session'
const loginCpf = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const kidsTeenSession = ref(null)

function loadKidsTeenSession() {
  try {
    const saved = localStorage.getItem(KIDS_TEEN_SESSION_KEY)
    if (saved) kidsTeenSession.value = JSON.parse(saved)
  } catch {
    kidsTeenSession.value = null
  }
}
loadKidsTeenSession()

const hasKidsAccess = computed(() => props.isLoggedIn || !!kidsTeenSession.value)

async function handleKidsLogin() {
  const cpf = loginCpf.value.replace(/\D/g, '')
  if (cpf.length !== 11) {
    loginError.value = 'Informe um CPF válido (11 números).'
    return
  }
  loginError.value = ''
  loginLoading.value = true
  try {
    const data = await api.post('/auth/login-kids', { cpf })
    if (data?.token) {
      kidsTeenSession.value = { token: data.token, user: data.user }
      localStorage.setItem(KIDS_TEEN_SESSION_KEY, JSON.stringify(kidsTeenSession.value))
      kidUser.name = data.user?.name ? data.user.name.split(' ')[0] : kidUser.name
      saveKidProfile()
      kidsAudio.playVictory()
      triggerConfetti()
    }
  } catch (err) {
    loginError.value = err?.message || 'CPF não encontrado ou assinatura inativa.'
  } finally {
    loginLoading.value = false
  }
}


function handleGuestMode() {
  kidUser.name = 'Explorador'
  kidUser.email = 'convidado@vivamaiskids.com.br'
  kidUser.avatar = '⭐'
  localStorage.setItem('viva_kids_has_visited', 'true')
  saveKidProfile()
  kidsAudio.playVictory()
  activeTab.value = 'home'
}

// --- NOTIFICAÇÕES TOAST & CONFETTI ---
const toastText = ref('')
const toastSub = ref('')
const showToastMsg = ref(false)

function showToast(amount, reason) {
  toastText.value = `⭐ +${amount} Estrelas!`
  toastSub.value = reason
  showToastMsg.value = true
  setTimeout(() => {
    showToastMsg.value = false
  }, 2400)
}

function addStars(amount, reason) {
  kidUser.stars = (kidUser.stars || 0) + amount
  saveKidProfile()
  kidsAudio.playStar()
  showToast(amount, reason)
  triggerConfetti()
}

function triggerConfetti() {
  const canvas = document.createElement('canvas')
  canvas.style.position = 'fixed'
  canvas.style.top = '0'
  canvas.style.left = '0'
  canvas.style.width = '100vw'
  canvas.style.height = '100vh'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = '99999'
  document.body.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight

  const particles = []
  const colors = ['#00b9b5', '#052453', '#ffb800', '#ff5a79', '#10b981', '#38bdf8']
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.8) * 18,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10
    })
  }

  let frames = 60
  function anim() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    particles.forEach(p => {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.4
      p.rot += p.vRot
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate((p.rot * Math.PI) / 180)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
      ctx.restore()
    })
    frames--
    if (frames > 0) requestAnimationFrame(anim)
    else canvas.remove()
  }
  anim()
}

// --- JOGOS & PAGINAÇÃO (8 JOGOS POR PÁGINA) ---
const activeGame = ref(null)
const gamesCurrentPage = ref(1)
const gamesPerPage = 8

const totalGamesPages = computed(() => Math.ceil(GAMES_CATALOG.length / gamesPerPage))

const paginatedGames = computed(() => {
  const start = (gamesCurrentPage.value - 1) * gamesPerPage
  return GAMES_CATALOG.slice(start, start + gamesPerPage)
})

function changeGamesPage(page) {
  if (page >= 1 && page <= totalGamesPages.value) {
    gamesCurrentPage.value = page
    kidsAudio.playPop()
  }
}

function launchGame(game) {
  activeGame.value = game
  kidsAudio.playPop()
  addStars(15, `Jogou ${game.title}!`)
}

function closeGame() {
  activeGame.value = null
  kidsAudio.playPop()
}

// --- LOUSA DE DESENHO LIVRE ---
const freehandCanvasRef = ref(null)
let freehandCtx = null
const isDrawing = ref(false)
const currentColor = ref('#00b9b5')
const brushSize = ref(12)
const activeTool = ref('brush') // 'brush' | 'eraser' | 'stamp'
const activeStamp = ref('⭐')
const history = ref([])
const historyIndex = ref(-1)

const SWATCH_COLORS = [
  '#00b9b5', '#052453', '#ffb800', '#ff5a79',
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f97316', '#14b8a6', '#6366f1', '#a855f7',
  '#e11d48', '#84cc16', '#06b6d4', '#0f172a',
  '#d97706', '#0284c7', '#4f46e5', '#7c3aed',
  '#db2777', '#65a30d', '#0d9488', '#ffffff'
]

const STAMPS = ['⭐', '🎨', '🚀', '🐱', '🐶', '🦄', '🌸', '👑', '🍕', '⚽']

function initFreehandCanvas() {
  const canvas = freehandCanvasRef.value
  if (!canvas) return
  freehandCtx = canvas.getContext('2d')

  const container = canvas.parentElement
  const width = Math.max(Math.floor(container?.clientWidth || 600) - 20, 300)
  const height = Math.max(Math.min(window.innerHeight * 0.6, 520), 380)

  canvas.width = width
  canvas.height = height

  freehandCtx.fillStyle = '#ffffff'
  freehandCtx.fillRect(0, 0, width, height)
  pushFreehandHistory()
}

function pushFreehandHistory() {
  if (!freehandCanvasRef.value) return
  if (historyIndex.value < history.value.length - 1) {
    history.value = history.value.slice(0, historyIndex.value + 1)
  }
  history.value.push(freehandCanvasRef.value.toDataURL())
  if (history.value.length > 25) history.value.shift()
  else historyIndex.value++
}

function undoFreehand() {
  if (historyIndex.value > 0) {
    historyIndex.value--
    const img = new Image()
    img.onload = () => {
      freehandCtx.clearRect(0, 0, freehandCanvasRef.value.width, freehandCanvasRef.value.height)
      freehandCtx.drawImage(img, 0, 0)
    }
    img.src = history.value[historyIndex.value]
    kidsAudio.playPop()
  }
}

function redoFreehand() {
  if (historyIndex.value < history.value.length - 1) {
    historyIndex.value++
    const img = new Image()
    img.onload = () => {
      freehandCtx.clearRect(0, 0, freehandCanvasRef.value.width, freehandCanvasRef.value.height)
      freehandCtx.drawImage(img, 0, 0)
    }
    img.src = history.value[historyIndex.value]
    kidsAudio.playPop()
  }
}

function clearFreehand() {
  if (!freehandCanvasRef.value || !freehandCtx) return
  freehandCtx.fillStyle = '#ffffff'
  freehandCtx.fillRect(0, 0, freehandCanvasRef.value.width, freehandCanvasRef.value.height)
  pushFreehandHistory()
  kidsAudio.playPop()
}

function getCanvasCoords(e, canvas) {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  }
}

function startFreehandDraw(e) {
  if (!freehandCanvasRef.value || !freehandCtx) return
  const { x, y } = getCanvasCoords(e, freehandCanvasRef.value)

  if (activeTool.value === 'stamp') {
    freehandCtx.font = `${brushSize.value * 3 + 20}px 'Fredoka', sans-serif`
    freehandCtx.textAlign = 'center'
    freehandCtx.textBaseline = 'middle'
    freehandCtx.fillText(activeStamp.value, x, y)
    pushFreehandHistory()
    kidsAudio.playPop()
    return
  }

  isDrawing.value = true
  freehandCtx.beginPath()
  freehandCtx.moveTo(x, y)
  freehandCtx.lineCap = 'round'
  freehandCtx.lineJoin = 'round'
  kidsAudio.playBrush()
}

function freehandDrawMove(e) {
  if (!isDrawing.value || !freehandCanvasRef.value || !freehandCtx) return
  const { x, y } = getCanvasCoords(e, freehandCanvasRef.value)

  if (activeTool.value === 'eraser') {
    freehandCtx.strokeStyle = '#ffffff'
    freehandCtx.lineWidth = brushSize.value * 2.2
  } else {
    freehandCtx.strokeStyle = currentColor.value
    freehandCtx.lineWidth = brushSize.value
  }

  freehandCtx.lineTo(x, y)
  freehandCtx.stroke()
}

function stopFreehandDraw() {
  if (isDrawing.value) {
    freehandCtx.closePath()
    isDrawing.value = false
    pushFreehandHistory()
  }
}

async function saveFreehandArtwork() {
  if (!freehandCanvasRef.value) return
  const dataUrl = freehandCanvasRef.value.toDataURL('image/png')
  const newArt = {
    id: Date.now(),
    type: 'desenho',
    title: 'Desenho Criativo',
    dataUrl,
    date: new Date().toLocaleDateString('pt-BR')
  }

  kidUser.artworks.unshift(newArt)
  const ach = kidUser.achievements.find(a => a.id === 'draw_artist')
  if (ach) ach.unlocked = true

  saveKidProfile()
  addStars(10, 'Desenho Salvo na Galeria!')

  // Upload em background para o backend
  if (props.isLoggedIn) {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], `desenho-${Date.now()}.png`, { type: 'image/png' })
      const uploadRes = await api.upload(file)
      if (uploadRes?.url) {
        newArt.serverUrl = uploadRes.url
        saveKidProfile()
      }
    } catch {}
  }
}

// --- LIVRO DE PINTURA (FLOOD FILL) ---
const paintCanvasRef = ref(null)
let paintCtx = null
const activeColoringId = ref(COLORING_TEMPLATES[0].id)
const paintColor = ref('#00b9b5')
const coloringCategory = ref('all')

const filteredColorings = computed(() => {
  if (coloringCategory.value === 'all') return COLORING_TEMPLATES
  return COLORING_TEMPLATES.filter(c => c.category === coloringCategory.value)
})

function loadColoringTemplate(id) {
  activeColoringId.value = id
  const tmpl = COLORING_TEMPLATES.find(t => t.id === id) || COLORING_TEMPLATES[0]
  const canvas = paintCanvasRef.value
  if (!canvas) return
  paintCtx = canvas.getContext('2d')

  const container = canvas.parentElement
  const width = Math.max(Math.floor(container?.clientWidth || 600) - 20, 300)
  const height = Math.max(Math.min(window.innerHeight * 0.6, 520), 380)

  canvas.width = width
  canvas.height = height

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    paintCtx.fillStyle = '#ffffff'
    paintCtx.fillRect(0, 0, width, height)

    // Ajusta proporção para caber perfeitamente no canvas
    const scale = Math.min((width - 40) / img.width, (height - 40) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = (width - dw) / 2
    const dy = (height - dh) / 2
    paintCtx.drawImage(img, dx, dy, dw, dh)
  }
  img.onerror = () => {
    // Fallback se SVG não carregar
    paintCtx.fillStyle = '#ffffff'
    paintCtx.fillRect(0, 0, width, height)
    paintCtx.font = '70px sans-serif'
    paintCtx.textAlign = 'center'
    paintCtx.fillText(tmpl.thumbnailIcon || '🎨', width / 2, height / 2)
  }
  img.src = tmpl.svgUrl
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const bi = parseInt(clean, 16)
  return { r: (bi >> 16) & 255, g: (bi >> 8) & 255, b: (bi >> 0) & 255 }
}

function floodFill(startX, startY, fillColor) {
  const canvas = paintCanvasRef.value
  if (!canvas || !paintCtx) return

  const width = canvas.width
  const height = canvas.height
  const imgData = paintCtx.getImageData(0, 0, width, height)
  const data = imgData.data

  const startIdx = (startY * width + startX) * 4
  const tR = data[startIdx]
  const tG = data[startIdx + 1]
  const tB = data[startIdx + 2]

  // Não preenche linhas pretas/escuras
  if (tR < 60 && tG < 60 && tB < 60) return

  const rgb = hexToRgb(fillColor)
  if (tR === rgb.r && tG === rgb.g && tB === rgb.b) return

  const tolerance = 40
  const match = (idx) => {
    const r = data[idx], g = data[idx + 1], b = data[idx + 2]
    if (r < 60 && g < 60 && b < 60) return false
    return Math.abs(r - tR) <= tolerance && Math.abs(g - tG) <= tolerance && Math.abs(b - tB) <= tolerance
  }

  const stack = [[startX, startY]]
  const visited = new Uint8Array(width * height)

  while (stack.length > 0) {
    const [x, y] = stack.pop()
    let cy = y
    let idx = (cy * width + x) * 4

    while (cy >= 0 && match(idx)) {
      cy--
      idx -= width * 4
    }
    idx += width * 4
    cy++

    let reachLeft = false, reachRight = false

    while (cy < height && match(idx)) {
      const vIdx = cy * width + x
      if (visited[vIdx]) break
      visited[vIdx] = 1

      data[idx] = rgb.r
      data[idx + 1] = rgb.g
      data[idx + 2] = rgb.b
      data[idx + 3] = 255

      if (x > 0) {
        if (match(idx - 4)) {
          if (!reachLeft) { stack.push([x - 1, cy]); reachLeft = true }
        } else if (reachLeft) reachLeft = false
      }

      if (x < width - 1) {
        if (match(idx + 4)) {
          if (!reachRight) { stack.push([x + 1, cy]); reachRight = true }
        } else if (reachRight) reachRight = false
      }

      cy++
      idx += width * 4
    }
  }

  paintCtx.putImageData(imgData, 0, 0)
  kidsAudio.playPop()
}

function handlePaintClick(e) {
  if (!paintCanvasRef.value) return
  const { x, y } = getCanvasCoords(e, paintCanvasRef.value)
  floodFill(Math.floor(x), Math.floor(y), paintColor.value)
}

async function savePaintArtwork() {
  if (!paintCanvasRef.value) return
  const dataUrl = paintCanvasRef.value.toDataURL('image/png')
  const tmpl = COLORING_TEMPLATES.find(t => t.id === activeColoringId.value)
  const newArt = {
    id: Date.now(),
    type: 'pintura',
    title: tmpl ? `Pintura: ${tmpl.title}` : 'Quadro Colorido',
    dataUrl,
    date: new Date().toLocaleDateString('pt-BR')
  }

  kidUser.artworks.unshift(newArt)
  const ach = kidUser.achievements.find(a => a.id === 'paint_hero')
  if (ach) ach.unlocked = true

  saveKidProfile()
  addStars(10, 'Pintura Salva com Sucesso!')

  // Upload em background para o backend
  if (props.isLoggedIn) {
    try {
      const res = await fetch(dataUrl)
      const blob = await res.blob()
      const file = new File([blob], `pintura-${Date.now()}.png`, { type: 'image/png' })
      const uploadRes = await api.upload(file)
      if (uploadRes?.url) {
        newArt.serverUrl = uploadRes.url
        saveKidProfile()
      }
    } catch {}
  }
}

// --- CONTROLE DE NAVEGAÇÃO & ABA ---
function switchTab(tab) {
  activeTab.value = tab
  showHeaderMenu.value = false
  kidsAudio.playClick()

  if (tab === 'draw') {
    nextTick(() => initFreehandCanvas())
  } else if (tab === 'paint') {
    nextTick(() => loadColoringTemplate(activeColoringId.value))
  }
}

function toggleAudio() {
  isAudioMuted.value = kidsAudio.toggleMute()
}

function handleLogout() {
  if (kidsTeenSession.value) {
    kidsTeenSession.value = null
    localStorage.removeItem(KIDS_TEEN_SESSION_KEY)
  }
  if (props.isLoggedIn) {
    clearToken()
  }
  emit('logout')
}

// Fecha dropdown ao clicar fora
function onWindowClick(e) {
  if (headerMenuRef.value && !headerMenuRef.value.contains(e.target)) {
    showHeaderMenu.value = false
  }
}

onMounted(async () => {
  document.addEventListener('click', onWindowClick)
  loadKidProfile(activeProfileId.value)
  await fetchDependents()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onWindowClick)
})

watch(() => props.user, () => {
  loadKidProfile(activeProfileId.value)
  fetchDependents()
}, { deep: true })
</script>

<template>
  <div class="kids-app-container">

    <!-- ========================================================= -->
    <!-- TELA DE LOGIN / ACESSO KIDS (/kids/auth ou Não Logado)    -->
    <!-- ========================================================= -->
    <section v-if="!hasKidsAccess || props.subRoute === 'auth'" class="kids-login-view">
      <div class="kids-login-card">
        <div class="kids-badge-top">
          <img src="/favicon.png" alt="Viva Mais" class="mini-logo" />
          <span>ACESSO INTEGRADO VIVA MAIS CLUB</span>
        </div>
        <h1>Bem-vindo ao Viva Kids! 🚀</h1>
        <p>Digite o CPF do titular ou dependente com assinatura ativa para liberar jogos, desenhos e salvar o progresso:</p>

        <form @submit.prevent="handleKidsLogin" class="kids-form">
          <div class="input-group">
            <label>CPF:</label>
            <input
              v-model="loginCpf"
              type="text"
              inputmode="numeric"
              placeholder="000.000.000-00"
              required
            />
          </div>

          <div v-if="loginError" class="kids-error-box">
            {{ loginError }}
          </div>

          <button type="submit" class="btn-kids-primary" :disabled="loginLoading">
            <span v-if="!loginLoading">Entrar no Viva Kids 🚀</span>
            <span v-else>Conectando...</span>
          </button>
        </form>

        <div class="login-footer-info">
          <button class="btn-link-portal" @click="emit('goHome')">🏥 Voltar ao Portal Viva Mais Club</button>
        </div>
      </div>
    </section>

    <!-- ========================================================= -->
    <!-- DASHBOARD COMPLETO VIVA MAIS KIDS (/kids/dashboard)       -->
    <!-- ========================================================= -->
    <div v-else class="kids-dashboard-view">

      <!-- Header Superior Kids com Barra de Navegação Desktop -->
      <header class="kids-top-header">
        <div class="kids-brand" @click="switchTab('home')">
          <img src="/logo.png" alt="Viva Mais" class="kids-logo-img" />
          <span class="badge-kids">KIDS</span>
        </div>

        <!-- Barra de Navegação Desktop (Visível em Telas Médias e Grandes) -->
        <nav class="kids-desktop-nav">
          <button class="nav-tab-btn" :class="{ active: activeTab === 'home' }" @click="switchTab('home')">
            <span class="nav-ico">🏠</span> Início
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'games' }" @click="switchTab('games')">
            <span class="nav-ico">🎮</span> Jogos
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'paint' }" @click="switchTab('paint')">
            <span class="nav-ico">🖌️</span> Pintura
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'draw' }" @click="switchTab('draw')">
            <span class="nav-ico">🎨</span> Lousa
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'profile' }" @click="switchTab('profile')">
            <span class="nav-ico">🏆</span> Perfil
          </button>
        </nav>

        <!-- Lado Direito: Seletor de Criança e Estrelas (Ocultos na barra no mobile) -->
        <div class="kids-header-right">
          <!-- Seletor de Perfil da Criança (Desktop) -->
          <div class="kids-child-pill">
            <span class="child-icon">{{ kidUser.avatar }}</span>
            <select
              :value="activeProfileId"
              @change="switchProfile($event.target.value)"
              class="kids-dep-select"
              title="Trocar Perfil da Criança"
            >
              <option value="titular">👑 {{ props.user?.name ? props.user.name.split(' ')[0] : 'Titular' }}</option>
              <option v-for="dep in dependentsList" :key="dep.id" :value="dep.id">
                {{ dep.avatar || '🧒' }} {{ dep.name.split(' ')[0] }}
              </option>
            </select>
          </div>

          <!-- Contador de Estrelas (Desktop) -->
          <div class="kids-stars-pill" @click="switchTab('profile')">
            <span class="star-ico">⭐</span>
            <strong>{{ kidUser.stars }}</strong>
          </div>

          <!-- Menu Opções / Áudio / Portal / Mobile Profile -->
          <div ref="headerMenuRef" class="kids-menu-wrap">
            <button class="kids-menu-btn" @click="showHeaderMenu = !showHeaderMenu" title="Mais Opções">
              <i class="ph ph-dots-three-vertical"></i>
            </button>

            <div v-if="showHeaderMenu" class="kids-dropdown-box">
              <div class="dropdown-kid-info" @click="switchTab('profile')">
                <div class="dropdown-avatar">{{ kidUser.avatar }}</div>
                <div class="dropdown-kid-details">
                  <strong>{{ kidUser.name }}</strong>
                  <span class="dropdown-stars-pill">⭐ {{ kidUser.stars }} estrelas</span>
                </div>
              </div>

              <!-- Seletor de Criança dentro do Menu (Essencial no Mobile) -->
              <div class="dropdown-profile-picker">
                <span class="dropdown-picker-label">Trocar Perfil:</span>
                <select
                  :value="activeProfileId"
                  @change="switchProfile($event.target.value)"
                  class="dropdown-dep-select"
                >
                  <option value="titular">👑 {{ props.user?.name ? props.user.name.split(' ')[0] : 'Titular' }}</option>
                  <option v-for="dep in dependentsList" :key="dep.id" :value="dep.id">
                    {{ dep.avatar || '🧒' }} {{ dep.name.split(' ')[0] }}
                  </option>
                </select>
              </div>

              <div class="dropdown-sep"></div>
              <button class="dropdown-item" @click="toggleAudio">
                {{ isAudioMuted ? '🔇 Ativar Sons' : '🔊 Efeitos Sonoros' }}
              </button>
              <button class="dropdown-item" @click="emit('goHome')">
                🏥 Voltar ao Portal Viva Mais
              </button>
              <button v-if="hasKidsAccess" class="dropdown-item text-danger" @click="handleLogout">
                🚪 Sair da Conta
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Conteúdo Principal SPA -->
      <main class="kids-main-body">

        <!-- 1. HOME HUB -->
        <section v-if="activeTab === 'home'" class="kids-section-fade">
          <div class="kids-hero-banner">
            <div class="hero-text">
              <div class="hero-tag">🌟 Viva Mais Club Kids</div>
              <h1>Olá, <span>{{ kidUser.name }}</span>! Vamos brincar?</h1>
              <p>Jogue mini-games divertidos, pinte lindos desenhos com o balde de tinta mágica e crie suas próprias artes na lousa!</p>
              <div class="hero-actions">
                <button class="btn-hero-action btn-game" @click="switchTab('games')">Explorar Jogos 🎮</button>
                <button class="btn-hero-action btn-paint" @click="switchTab('paint')">Livro de Pintura 🖌️</button>
                <button class="btn-hero-action btn-draw" @click="switchTab('draw')">Lousa de Desenho 🎨</button>
              </div>
            </div>
            <div class="hero-mascot">
              <img src="/kids/image.png" alt="Turma Viva Mais Kids" class="mascot-img" />
            </div>
          </div>

          <h2 class="section-title">✨ Escolha sua Aventura de Hoje</h2>
          <div class="hub-grid">
            <div class="hub-card card-games" @click="switchTab('games')">
              <div class="hub-icon">🎮</div>
              <h3>Sala de Jogos</h3>
              <p>Subway Surfers, Angry Birds, Banana Kong, Traffic Rider e muitos outros jogos incríveis!</p>
              <span class="hub-link">Jogar Agora ➜</span>
            </div>

            <div class="hub-card card-paint" @click="switchTab('paint')">
              <div class="hub-icon">🖌️</div>
              <h3>Livro de Pintura</h3>
              <p>Pinte com o balde de tinta mágica: Sonic, Hello Kitty, Minecraft e Bobbie Goods!</p>
              <span class="hub-link">Colorir Agora ➜</span>
            </div>

            <div class="hub-card card-draw" @click="switchTab('draw')">
              <div class="hub-icon">🎨</div>
              <h3>Lousa de Desenho</h3>
              <p>Crie suas próprias obras de arte com 24 cores vibrantes, carimbos e lousa livre!</p>
              <span class="hub-link">Soltar a Criatividade ➜</span>
            </div>
          </div>
        </section>

        <!-- 2. SALA DE JOGOS (9 POR PÁGINA COM PAGINAÇÃO) -->
        <section v-else-if="activeTab === 'games'" class="kids-section-fade">
          <div class="section-header-bar">
            <div>
              <h2 class="section-title">🎮 Sala de Jogos</h2>
              <p class="section-sub">Escolha um jogo e acumule estrelas para subir de nível!</p>
            </div>
          </div>

          <div class="games-grid">
            <div
              v-for="game in paginatedGames"
              :key="game.id"
              class="game-card"
              @click="launchGame(game)"
            >
              <div class="game-thumb-box">
                <img
                  :src="game.image"
                  :alt="game.title"
                  class="game-thumb"
                  loading="lazy"
                  @error="(e) => { e.target.src = 'https://www.madkidgames.com/games/subway-surfers/thumb_2.jpg' }"
                />
                <span class="badge-star-points">⭐ +15</span>
                <span v-if="game.badge" class="badge-game-tag">{{ game.badge }}</span>
              </div>
              <div class="game-body">
                <h3>{{ game.title }}</h3>
                <p>{{ game.description }}</p>
                <button class="btn-play-game">Jogar Agora 🚀</button>
              </div>
            </div>
          </div>

          <!-- Barra de Paginação (9 jogos por página) -->
          <div v-if="totalGamesPages > 1" class="games-pagination-bar">
            <button
              class="btn-page-nav"
              :disabled="gamesCurrentPage === 1"
              @click="changeGamesPage(gamesCurrentPage - 1)"
            >
              ⬅️ Anterior
            </button>
            <div class="page-pills-list">
              <button
                v-for="page in totalGamesPages"
                :key="page"
                class="page-num-btn"
                :class="{ active: page === gamesCurrentPage }"
                @click="changeGamesPage(page)"
              >
                {{ page }}
              </button>
            </div>
            <button
              class="btn-page-nav"
              :disabled="gamesCurrentPage === totalGamesPages"
              @click="changeGamesPage(gamesCurrentPage + 1)"
            >
              Próxima ➡️
            </button>
          </div>
        </section>

        <!-- 3. LIVRO DE PINTURA (FLOOD FILL) -->
        <section v-else-if="activeTab === 'paint'" class="kids-section-fade">
          <div class="section-header-bar">
            <div>
              <h2 class="section-title">🖌️ Livro de Pintura Mágica</h2>
              <p class="section-sub">Clique em qualquer área do desenho para pintar com o balde de tinta inteligente!</p>
            </div>
          </div>

          <div class="studio-layout">
            <!-- Sidebar com Desenhos -->
            <aside class="templates-sidebar">
              <div class="sidebar-header">
                <h3>🖼️ Escolha o Desenho:</h3>
              </div>
              <div class="templates-scroll-grid">
                <div
                  v-for="tmpl in COLORING_TEMPLATES"
                  :key="tmpl.id"
                  class="template-card"
                  :class="{ active: tmpl.id === activeColoringId }"
                  @click="loadColoringTemplate(tmpl.id)"
                >
                  <img :src="tmpl.svgUrl" :alt="tmpl.title" class="tmpl-thumb" />
                  <span>{{ tmpl.title }}</span>
                </div>
              </div>
            </aside>

            <!-- Área Principal do Canvas -->
            <div class="studio-main-arena">
              <!-- Paleta de Cores -->
              <div class="studio-palette-bar">
                <div class="swatches-row">
                  <button
                    v-for="c in SWATCH_COLORS"
                    :key="c"
                    class="color-btn"
                    :style="{ background: c }"
                    :class="{ active: paintColor === c }"
                    @click="paintColor = c; kidsAudio.playClick()"
                  ></button>
                </div>
                <div class="custom-color-wrap">
                  <input v-model="paintColor" type="color" class="native-color-picker" />
                  <span>Personalizada</span>
                </div>
              </div>

              <!-- Canvas da Pintura -->
              <div class="canvas-wrapper">
                <canvas
                  ref="paintCanvasRef"
                  @click="handlePaintClick"
                  class="studio-canvas"
                ></canvas>
              </div>

              <!-- Ações do Canvas -->
              <div class="canvas-actions-bar">
                <button class="btn-canvas-ctrl" @click="loadColoringTemplate(activeColoringId)">🔄 Recomeçar</button>
                <button class="btn-canvas-save" @click="savePaintArtwork">🌟 Salvar Obra de Arte (+10 ⭐)</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. LOUSA DE DESENHO LIVRE -->
        <section v-else-if="activeTab === 'draw'" class="kids-section-fade">
          <div class="section-header-bar">
            <div>
              <h2 class="section-title">🎨 Lousa de Desenho Livre</h2>
              <p class="section-sub">Solte a imaginação com pincéis mágicos, carimbos fofos e muitas cores!</p>
            </div>
          </div>

          <div class="studio-layout full-width">
            <div class="studio-main-arena">
              <!-- Ferramentas da Lousa -->
              <div class="draw-tools-bar">
                <div class="tool-group">
                  <button class="tool-btn" :class="{ active: activeTool === 'brush' }" @click="activeTool = 'brush'; kidsAudio.playClick()">🖌️ Pincel</button>
                  <button class="tool-btn" :class="{ active: activeTool === 'eraser' }" @click="activeTool = 'eraser'; kidsAudio.playClick()">🧹 Borracha</button>
                  <button class="tool-btn" :class="{ active: activeTool === 'stamp' }" @click="activeTool = 'stamp'; kidsAudio.playClick()">⭐ Carimbo</button>
                </div>

                <div class="brush-sizes-row">
                  <button class="size-btn" :class="{ active: brushSize === 6 }" @click="brushSize = 6">Fino</button>
                  <button class="size-btn" :class="{ active: brushSize === 12 }" @click="brushSize = 12">Médio</button>
                  <button class="size-btn" :class="{ active: brushSize === 22 }" @click="brushSize = 22">Grosso</button>
                </div>

                <div class="undo-redo-group">
                  <button class="tool-btn" @click="undoFreehand" :disabled="historyIndex <= 0">↩️ Desfazer</button>
                  <button class="tool-btn" @click="redoFreehand" :disabled="historyIndex >= history.length - 1">↪️ Refazer</button>
                  <button class="tool-btn text-danger" @click="clearFreehand">🗑️ Limpar</button>
                </div>
              </div>

              <!-- Carimbos (se selecionado) -->
              <div v-if="activeTool === 'stamp'" class="stamps-picker-bar">
                <span class="stamps-label">Escolha o carimbo:</span>
                <button
                  v-for="st in STAMPS"
                  :key="st"
                  class="stamp-choice-btn"
                  :class="{ active: activeStamp === st }"
                  @click="activeStamp = st; kidsAudio.playPop()"
                >{{ st }}</button>
              </div>

              <!-- Paleta de Cores -->
              <div class="studio-palette-bar">
                <div class="swatches-row">
                  <button
                    v-for="c in SWATCH_COLORS"
                    :key="c"
                    class="color-btn"
                    :style="{ background: c }"
                    :class="{ active: currentColor === c }"
                    @click="currentColor = c; activeTool = 'brush'; kidsAudio.playClick()"
                  ></button>
                </div>
                <div class="custom-color-wrap">
                  <input v-model="currentColor" type="color" class="native-color-picker" />
                  <span>Personalizada</span>
                </div>
              </div>

              <!-- Canvas da Lousa -->
              <div class="canvas-wrapper">
                <canvas
                  ref="freehandCanvasRef"
                  @mousedown="startFreehandDraw"
                  @mousemove="freehandDrawMove"
                  @mouseup="stopFreehandDraw"
                  @mouseleave="stopFreehandDraw"
                  @touchstart.prevent="startFreehandDraw"
                  @touchmove.prevent="freehandDrawMove"
                  @touchend.prevent="stopFreehandDraw"
                  class="studio-canvas"
                ></canvas>
              </div>

              <!-- Ações da Lousa -->
              <div class="canvas-actions-bar">
                <button class="btn-canvas-save" @click="saveFreehandArtwork">🌟 Salvar Obra na Galeria (+10 ⭐)</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. MEU PERFIL & GALERIA -->
        <section v-else-if="activeTab === 'profile'" class="kids-section-fade">
          <div class="profile-hero-card">
            <div class="profile-avatar-big">{{ kidUser.avatar }}</div>
            <div class="profile-details">
              <h2>{{ kidUser.name }}</h2>
              <div class="profile-badges-row">
                <span class="pill-plan">Assinante Viva Mais ⭐</span>
                <span class="pill-cloud">{{ props.isLoggedIn ? '☁️ Sincronizado na Nuvem' : '⭐ Modo Convidado' }}</span>
              </div>
              <div class="profile-stats">
                <div class="stat-pill">⭐ <strong>{{ kidUser.stars }}</strong> Estrelas</div>
                <div class="stat-pill">🎨 <strong>{{ kidUser.artworks.length }}</strong> Obras Criadas</div>
              </div>
            </div>
            <div class="profile-actions">
              <button class="btn-portal-back" @click="emit('goHome')">🏥 Voltar ao Portal</button>
            </div>
          </div>

          <!-- Seletor de Crianças do Plano -->
          <div v-if="dependentsList.length > 0" class="profile-deps-box">
            <h3>🧒 Quem está jogando agora? (Crianças do Plano)</h3>
            <div class="profile-deps-grid">
              <div
                class="dep-profile-card"
                :class="{ active: activeProfileId === 'titular' }"
                @click="switchProfile('titular')"
              >
                <div class="dep-ico">⭐</div>
                <strong>{{ props.user?.name ? props.user.name.split(' ')[0] : 'Titular' }}</strong>
                <span>{{ activeProfileId === 'titular' ? '🎮 Jogando Agora' : 'Selecionar' }}</span>
              </div>
              <div
                v-for="dep in dependentsList"
                :key="dep.id"
                class="dep-profile-card"
                :class="{ active: String(activeProfileId) === String(dep.id) }"
                @click="switchProfile(dep.id)"
              >
                <div class="dep-ico">🧒</div>
                <strong>{{ dep.name.split(' ')[0] }}</strong>
                <span>{{ String(activeProfileId) === String(dep.id) ? '🎮 Jogando Agora' : 'Selecionar' }}</span>
              </div>
            </div>
          </div>

          <!-- Conquistas -->
          <h3 class="section-title">🏆 Minhas Conquistas</h3>
          <div class="achievements-grid">
            <div
              v-for="ach in kidUser.achievements"
              :key="ach.id"
              class="ach-card"
              :class="{ unlocked: ach.unlocked }"
            >
              <div class="ach-ico">{{ ach.unlocked ? ach.icon : '🔒' }}</div>
              <div class="ach-text">
                <h4>{{ ach.title }}</h4>
                <p>{{ ach.desc }}</p>
              </div>
              <span class="ach-badge">{{ ach.unlocked ? 'Conquistado ⭐' : 'Bloqueado' }}</span>
            </div>
          </div>

          <!-- Galeria de Desenhos Salvos -->
          <h3 class="section-title">🖼️ Galeria de Desenhos e Pinturas</h3>
          <div v-if="kidUser.artworks.length === 0" class="empty-gallery">
            <div class="empty-ico">🎨</div>
            <h3>Sua galeria ainda está vazia!</h3>
            <p>Vá até a <strong>Lousa de Desenho</strong> ou o <strong>Livro de Pintura</strong> para salvar sua primeira obra!</p>
            <button class="btn-kids-primary" style="max-width: 220px; margin: 16px auto;" @click="switchTab('draw')">Criar Desenho 🖌️</button>
          </div>
          <div v-else class="artworks-grid">
            <div
              v-for="art in kidUser.artworks"
              :key="art.id"
              class="art-card"
            >
              <div class="art-img-wrap">
                <img :src="art.dataUrl || art.serverUrl" :alt="art.title" />
                <span v-if="art.serverUrl" class="badge-cloud-saved">☁️ Salvo</span>
              </div>
              <div class="art-card-footer">
                <h4>{{ art.title }}</h4>
                <span>📅 {{ art.date }}</span>
                <a :href="art.dataUrl || art.serverUrl" :download="`${art.title}.png`" class="btn-download-art">Baixar 📥</a>
              </div>
            </div>
          </div>
        </section>

      </main>

      <!-- Barra de Navegação Mobile (Bottom Bar) -->
      <nav class="kids-bottom-bar">
        <button class="bottom-item" :class="{ active: activeTab === 'home' }" @click="switchTab('home')">
          <span class="bottom-ico">🏠</span>
          <span>Início</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'games' }" @click="switchTab('games')">
          <span class="bottom-ico">🎮</span>
          <span>Jogos</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'paint' }" @click="switchTab('paint')">
          <span class="bottom-ico">🖌️</span>
          <span>Pintura</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'draw' }" @click="switchTab('draw')">
          <span class="bottom-ico">🎨</span>
          <span>Lousa</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'profile' }" @click="switchTab('profile')">
          <span class="bottom-ico">🏆</span>
          <span>Perfil</span>
        </button>
      </nav>

    </div>

    <!-- Modal do Jogo Ativo -->
    <div v-if="activeGame" class="game-modal-overlay">
      <div class="game-modal-box">
        <div class="game-modal-top">
          <h2>🎮 {{ activeGame.title }}</h2>
          <button class="btn-close-game" @click="closeGame">✖</button>
        </div>
        <div class="game-iframe-wrap">
          <iframe
            :src="activeGame.iframeUrl"
            class="game-iframe"
            allow="autoplay; fullscreen; gamepad"
            sandbox="allow-scripts allow-same-origin allow-popups"
          ></iframe>
        </div>
      </div>
    </div>

    <!-- Toast Popup -->
    <div v-if="showToastMsg" class="star-toast">
      {{ toastText }} <small>{{ toastSub }}</small>
    </div>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap');

.kids-app-container {
  font-family: 'Fredoka', 'Manrope', Arial, sans-serif;
  background: linear-gradient(135deg, #f4fbfd 0%, #e6f8f8 40%, #fff8e5 100%);
  min-height: 100vh;
  color: #052453;
  width: 100%;
  display: flex;
  flex-direction: column;
}

/* --- TELA DE LOGIN KIDS --- */
.kids-login-view {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
}

.kids-login-card {
  background: white;
  border-radius: 28px;
  padding: 40px 32px;
  max-width: 460px;
  width: 100%;
  box-shadow: 0 20px 40px rgba(5, 36, 83, 0.1);
  border: 2px solid #e6f8f8;
  text-align: center;
}

.kids-badge-top {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #e6f8f8;
  color: #009c9a;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 800;
  margin-bottom: 16px;
}

.kids-badge-top .mini-logo {
  width: 18px;
  height: 18px;
}

.kids-login-card h1 {
  font-size: 1.9rem;
  font-weight: 800;
  color: #052453;
  margin-bottom: 8px;
}

.kids-login-card p {
  color: #596b82;
  font-size: 0.95rem;
  margin-bottom: 24px;
  line-height: 1.5;
}

.kids-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.input-group label {
  display: block;
  font-size: 0.88rem;
  font-weight: 700;
  color: #052453;
  margin-bottom: 6px;
}

.input-group input {
  width: 100%;
  padding: 13px 16px;
  border-radius: 14px;
  border: 2px solid #dce8ed;
  font-family: inherit;
  font-size: 1rem;
  background: #f4fbfd;
  color: #052453;
  outline: none;
  transition: all 0.2s;
}

.input-group input:focus {
  border-color: #00b9b5;
  background: white;
  box-shadow: 0 0 0 4px rgba(0, 185, 181, 0.15);
}

.kids-error-box {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 0.85rem;
  font-weight: 600;
}

.btn-kids-primary {
  width: 100%;
  padding: 14px 20px;
  border-radius: 50px;
  background: linear-gradient(135deg, #00b9b5 0%, #009c9a 100%);
  color: white;
  border: none;
  font-family: inherit;
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(0, 185, 181, 0.3);
  transition: transform 0.15s;
}

.btn-kids-primary:hover {
  transform: translateY(-2px);
}

.divider-or {
  display: flex;
  align-items: center;
  margin: 18px 0;
}

.divider-or::before, .divider-or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: #dce8ed;
}

.divider-or span {
  padding: 0 10px;
  color: #596b82;
  font-size: 0.85rem;
}

.btn-kids-guest {
  width: 100%;
  padding: 12px 18px;
  border-radius: 50px;
  background: #fff8e5;
  color: #052453;
  border: 2px solid #ffb800;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-kids-guest:hover {
  background: #ffb800;
}

.login-footer-info {
  margin-top: 24px;
}

.btn-link-portal {
  background: none;
  border: none;
  color: #00b9b5;
  font-family: inherit;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: underline;
}

/* --- HEADER KIDS --- */
.kids-top-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(14px);
  border-bottom: 2px solid #e6f8f8;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.06);
}

.kids-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  flex-shrink: 0;
}

.kids-logo-img {
  height: 28px;
  width: auto;
  object-fit: contain;
}

.badge-kids {
  background: linear-gradient(135deg, #00b9b5, #ffb800);
  color: white;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 3px 8px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

/* Barra de Navegação Desktop */
.kids-desktop-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #f4fbfd;
  padding: 5px 8px;
  border-radius: 50px;
  border: 1.5px solid #e6f8f8;
}

.nav-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 50px;
  background: transparent;
  border: none;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 700;
  color: #052453;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.nav-tab-btn:hover {
  background: #e6f8f8;
  color: #009c9a;
  transform: translateY(-1px);
}

.nav-tab-btn.active {
  background: #00b9b5;
  color: white;
  box-shadow: 0 4px 12px rgba(0, 185, 181, 0.35);
}

.nav-tab-btn .nav-ico {
  font-size: 1.1rem;
}

/* Lado Direito do Header */
.kids-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.kids-child-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f4fbfd;
  border: 1.5px solid #00b9b5;
  padding: 4px 10px 4px 6px;
  border-radius: 50px;
}

.child-icon {
  font-size: 1.25rem;
}

.kids-dep-select {
  background: transparent;
  border: none;
  color: #052453;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 800;
  cursor: pointer;
  outline: none;
}

.kids-stars-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  background: #fff8e5;
  border: 1.5px solid #ffb800;
  color: #b45309;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s;
}

.kids-stars-pill:hover {
  transform: scale(1.05);
}

.kids-menu-wrap {
  position: relative;
}

.kids-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 2px solid #e6f8f8;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
  color: #052453;
  font-size: 1.2rem;
  transition: all 0.2s;
}

.kids-menu-btn:hover {
  background: #f4fbfd;
  border-color: #00b9b5;
}

.kids-dropdown-box {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border-radius: 20px;
  box-shadow: 0 16px 32px rgba(5, 36, 83, 0.15);
  border: 2px solid #e6f8f8;
  width: 230px;
  padding: 10px;
  z-index: 200;
}

.dropdown-kid-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  cursor: pointer;
  border-radius: 12px;
  background: #f4fbfd;
}

.dropdown-avatar {
  font-size: 1.5rem;
}

.dropdown-sep {
  height: 1px;
  background: #e6f8f8;
  margin: 6px 0;
}

.dropdown-item {
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 8px 12px;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  color: #052453;
  cursor: pointer;
  transition: background 0.15s;
}

.dropdown-item:hover, .dropdown-item.active {
  background: #e6f8f8;
  color: #009c9a;
}

.dropdown-item.text-danger {
  color: #dc2626;
}

/* --- CORPO PRINCIPAL --- */
.kids-main-body {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 24px 20px 80px;
  flex: 1;
}

.kids-section-fade {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- HERO BANNER (MAIOR E MAIS IMPONENTE) --- */
.kids-hero-banner {
  background: linear-gradient(135deg, #052453 0%, #083c7d 50%, #008783 100%);
  color: #ffffff !important;
  border-radius: 36px;
  padding: 48px 52px;
  min-height: 290px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 36px;
  margin-bottom: 36px;
  box-shadow: 0 24px 50px -10px rgba(5, 36, 83, 0.4);
  position: relative;
  overflow: hidden;
  border: 3px solid rgba(0, 185, 181, 0.4);
}

.kids-hero-banner::after {
  content: "";
  position: absolute;
  top: -50%;
  right: -20%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, rgba(0, 185, 181, 0.25) 0%, transparent 70%);
  pointer-events: none;
}

.hero-tag {
  display: inline-block;
  background: rgba(255, 184, 0, 0.25);
  color: #ffb800 !important;
  padding: 6px 16px;
  border-radius: 50px;
  font-size: 0.95rem;
  font-weight: 800;
  margin-bottom: 14px;
  border: 1.5px solid rgba(255, 184, 0, 0.5);
  backdrop-filter: blur(8px);
}

.hero-text {
  color: #ffffff !important;
  max-width: 620px;
  z-index: 2;
}

.hero-text h1 {
  font-size: 2.7rem;
  font-weight: 800;
  margin-bottom: 12px;
  color: #ffffff !important;
  line-height: 1.15;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
}

.hero-text h1 span {
  color: #00e5e0 !important;
  text-shadow: 0 0 16px rgba(0, 229, 224, 0.5);
}

.hero-text p {
  color: #f0f9ff !important;
  font-size: 1.18rem;
  margin-bottom: 28px;
  line-height: 1.5;
  opacity: 0.95;
}

.hero-actions {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.btn-hero-action {
  padding: 14px 28px;
  border-radius: 50px;
  font-family: inherit;
  font-size: 1.1rem;
  font-weight: 800;
  border: none;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-hero-action.btn-game {
  background: #00b9b5;
  color: white;
  box-shadow: 0 8px 20px rgba(0, 185, 181, 0.45);
}

.btn-hero-action.btn-paint {
  background: #ffb800;
  color: #052453;
  box-shadow: 0 8px 20px rgba(255, 184, 0, 0.4);
}

.btn-hero-action.btn-draw {
  background: rgba(255, 255, 255, 0.18);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
}

.btn-hero-action:hover {
  transform: translateY(-3px) scale(1.03);
}

/* Lado Direito do Hero com Glassmorphism e Imagem Grande */
.hero-mascot {
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(16px);
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-radius: 32px;
  padding: 12px 16px;
  box-shadow: 0 20px 45px rgba(5, 36, 83, 0.35);
  flex-shrink: 0;
  transition: transform 0.3s ease;
}

.hero-mascot:hover {
  transform: scale(1.02);
}

.mascot-img {
  max-width: 420px;
  max-height: 290px;
  width: 100%;
  height: auto;
  object-fit: contain;
  border-radius: 24px;
}

/* --- HUB GRID --- */
.section-title {
  font-size: 1.7rem;
  font-weight: 800;
  color: #052453;
  margin-bottom: 16px;
}

.section-sub {
  color: #596b82;
  font-size: 1rem;
  margin-top: -10px;
  margin-bottom: 22px;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
}

.hub-card {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 28px;
  padding: 30px 26px;
  cursor: pointer;
  border: 2px solid #e6f8f8;
  box-shadow: 0 12px 28px rgba(5, 36, 83, 0.06);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
}

.hub-card:hover {
  transform: translateY(-6px);
  border-color: #00b9b5;
  box-shadow: 0 20px 36px rgba(0, 185, 181, 0.25);
}

.hub-icon {
  font-size: 2.8rem;
  margin-bottom: 14px;
}

.hub-card h3 {
  font-size: 1.35rem;
  font-weight: 800;
  margin-bottom: 8px;
}

.hub-card p {
  color: #596b82;
  font-size: 0.95rem;
  line-height: 1.5;
  margin-bottom: 18px;
  flex: 1;
}

.hub-link {
  font-weight: 800;
  color: #00b9b5;
  font-size: 0.95rem;
}

/* --- SALA DE JOGOS (8 POR PÁGINA) --- */
.section-header-bar {
  margin-bottom: 24px;
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 24px;
}

.game-card {
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(14px);
  border-radius: 26px;
  overflow: hidden;
  border: 2px solid #e6f8f8;
  box-shadow: 0 12px 28px rgba(5, 36, 83, 0.07);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
}

.game-card:hover {
  transform: translateY(-6px) scale(1.02);
  border-color: #00b9b5;
  box-shadow: 0 20px 40px rgba(0, 185, 181, 0.24);
}

.game-thumb-box {
  position: relative;
  height: 220px;
  overflow: hidden;
  background: #052453;
}

.game-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.35s ease;
}

.game-card:hover .game-thumb {
  transform: scale(1.08);
}

.badge-star-points {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(5, 36, 83, 0.9);
  color: #ffb800;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 0.8rem;
  font-weight: 800;
  backdrop-filter: blur(6px);
}

.badge-game-tag {
  position: absolute;
  bottom: 10px;
  left: 10px;
  background: rgba(0, 185, 181, 0.92);
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.78rem;
  font-weight: 800;
  backdrop-filter: blur(6px);
}

.game-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.game-body h3 {
  font-size: 1.25rem;
  font-weight: 800;
  color: #052453;
  margin-bottom: 8px;
}

.game-body p {
  font-size: 0.9rem;
  color: #596b82;
  line-height: 1.4;
  margin-bottom: 18px;
  flex: 1;
}

.btn-play-game {
  width: 100%;
  padding: 12px;
  border-radius: 50px;
  background: linear-gradient(135deg, #00b9b5 0%, #009c9a 100%);
  color: white;
  border: none;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(0, 185, 181, 0.35);
  transition: all 0.2s;
}

.btn-play-game:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 22px rgba(0, 185, 181, 0.45);
}

/* --- BARRA DE PAGINAÇÃO DOS JOGOS --- */
.games-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 36px;
  padding: 16px 0;
}

.btn-page-nav {
  padding: 10px 22px;
  border-radius: 50px;
  background: white;
  border: 2px solid #00b9b5;
  color: #052453;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-page-nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
  border-color: #dce8ed;
}

.btn-page-nav:not(:disabled):hover {
  background: #00b9b5;
  color: white;
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 185, 181, 0.35);
}

.page-pills-list {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-num-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #e6f8f8;
  background: white;
  color: #052453;
  font-family: inherit;
  font-weight: 800;
  font-size: 1.05rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-num-btn:hover {
  border-color: #00b9b5;
  background: #f4fbfd;
  transform: translateY(-2px);
}

.page-num-btn.active {
  background: #00b9b5;
  color: white;
  border-color: #00b9b5;
  box-shadow: 0 6px 16px rgba(0, 185, 181, 0.4);
}

/* --- ESTÚDIO DE ARTE (PINTURA & LOUSA) --- */
.studio-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 20px;
  background: white;
  border-radius: 28px;
  padding: 24px;
  border: 2px solid #e6f8f8;
  box-shadow: 0 10px 30px rgba(5, 36, 83, 0.08);
}

.studio-layout.full-width {
  grid-template-columns: 1fr;
}

.templates-sidebar {
  border-right: 2px solid #e6f8f8;
  padding-right: 16px;
}

.templates-scroll-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 520px;
  overflow-y: auto;
  padding-right: 6px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 14px;
  border: 2px solid #e6f8f8;
  cursor: pointer;
  transition: all 0.15s;
}

.template-card:hover, .template-card.active {
  border-color: #00b9b5;
  background: #e6f8f8;
}

.tmpl-thumb {
  width: 44px;
  height: 44px;
  object-fit: contain;
  background: white;
  border-radius: 8px;
  padding: 2px;
}

.template-card span {
  font-size: 0.85rem;
  font-weight: 700;
}

.studio-main-arena {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.studio-palette-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.swatches-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.color-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid white;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: transform 0.1s;
}

.color-btn.active {
  transform: scale(1.25);
  outline: 2px solid #052453;
}

.custom-color-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
}

.native-color-picker {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.canvas-wrapper {
  background: #f4fbfd;
  border-radius: 20px;
  border: 2px dashed #00b9b5;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px;
  overflow: hidden;
}

.studio-canvas {
  background: white;
  border-radius: 14px;
  box-shadow: 0 4px 14px rgba(5, 36, 83, 0.08);
  cursor: crosshair;
  max-width: 100%;
}

.canvas-actions-bar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-canvas-ctrl {
  padding: 10px 18px;
  border-radius: 50px;
  background: #f4fbfd;
  border: 2px solid #dce8ed;
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
}

.btn-canvas-save {
  padding: 12px 24px;
  border-radius: 50px;
  background: linear-gradient(135deg, #00b9b5, #009c9a);
  color: white;
  border: none;
  font-family: inherit;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(0, 185, 181, 0.3);
  transition: transform 0.15s;
}

.btn-canvas-save:hover {
  transform: translateY(-2px);
}

/* Ferramentas da Lousa */
.draw-tools-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.tool-group, .brush-sizes-row, .undo-redo-group {
  display: flex;
  gap: 6px;
}

.tool-btn, .size-btn {
  padding: 8px 14px;
  border-radius: 50px;
  background: #f4fbfd;
  border: 2px solid #dce8ed;
  font-family: inherit;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}

.tool-btn.active, .size-btn.active {
  background: #00b9b5;
  color: white;
  border-color: #00b9b5;
}

.stamps-picker-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #fff8e5;
  padding: 8px 14px;
  border-radius: 16px;
  flex-wrap: wrap;
}

.stamps-label {
  font-size: 0.85rem;
  font-weight: 700;
}

.stamp-choice-btn {
  background: white;
  border: 1.5px solid #ffb800;
  border-radius: 12px;
  padding: 4px 8px;
  font-size: 1.2rem;
  cursor: pointer;
}

.stamp-choice-btn.active {
  background: #ffb800;
}

/* --- HISTORINHAS --- */
.story-reader-card {
  background: white;
  border-radius: 28px;
  padding: 36px 32px;
  border: 2px solid #e6f8f8;
  box-shadow: 0 16px 32px rgba(5, 36, 83, 0.1);
  text-align: center;
  max-width: 720px;
  margin: 0 auto;
}

.story-big-emoji {
  font-size: 4rem;
  margin-bottom: 12px;
}

.story-page-text {
  font-size: 1.2rem;
  line-height: 1.7;
  color: #052453;
  margin: 24px 0;
  padding: 20px;
  background: #f4fbfd;
  border-radius: 20px;
}

.story-reader-controls {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 24px;
  flex-wrap: wrap;
}

.btn-story-nav, .btn-story-voice {
  padding: 12px 22px;
  border-radius: 50px;
  font-family: inherit;
  font-weight: 800;
  font-size: 1rem;
  cursor: pointer;
}

.btn-story-voice {
  background: #ffb800;
  color: #052453;
  border: none;
}

.btn-story-nav.btn-next {
  background: #00b9b5;
  color: white;
  border: none;
}

.btn-close-story {
  margin-top: 20px;
  background: none;
  border: none;
  color: #596b82;
  font-weight: 700;
  cursor: pointer;
}

.stories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.story-card {
  background: white;
  border-radius: 24px;
  padding: 24px;
  border: 2px solid #e6f8f8;
  cursor: pointer;
  transition: all 0.2s;
}

.story-card:hover {
  transform: translateY(-4px);
  border-color: #00b9b5;
  box-shadow: 0 16px 28px rgba(0, 185, 181, 0.2);
}

.story-cover-emoji {
  font-size: 3rem;
  margin-bottom: 12px;
}

.story-badge {
  background: #e6f8f8;
  color: #009c9a;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 800;
}

.btn-read-story {
  width: 100%;
  margin-top: 14px;
  padding: 10px;
  border-radius: 50px;
  background: #00b9b5;
  color: white;
  border: none;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
}

/* --- PERFIL & CONQUISTAS --- */
.profile-hero-card {
  background: white;
  border-radius: 28px;
  padding: 30px;
  border: 2px solid #e6f8f8;
  box-shadow: 0 12px 28px rgba(5, 36, 83, 0.08);
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.profile-avatar-big {
  width: 80px;
  height: 80px;
  background: #fff8e5;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  border: 3px solid #ffb800;
}

.profile-badges-row {
  display: flex;
  gap: 8px;
  margin: 6px 0 12px;
}

.pill-plan {
  background: #fff8e5;
  color: #d97706;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 800;
}

.pill-cloud {
  background: #e6f8f8;
  color: #009c9a;
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 800;
}

.profile-stats {
  display: flex;
  gap: 12px;
}

.stat-pill {
  background: #f4fbfd;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.9rem;
}

.profile-actions {
  margin-left: auto;
}

.btn-portal-back {
  background: #00b9b5;
  color: white;
  padding: 10px 20px;
  border-radius: 50px;
  border: none;
  font-family: inherit;
  font-weight: 800;
  cursor: pointer;
}

.profile-deps-box {
  background: white;
  border-radius: 24px;
  padding: 24px;
  border: 2px solid #e6f8f8;
  margin-bottom: 28px;
}

.profile-deps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 14px;
  margin-top: 14px;
}

.dep-profile-card {
  background: #f4fbfd;
  border: 2px solid #dce8ed;
  border-radius: 18px;
  padding: 14px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.dep-profile-card.active, .dep-profile-card:hover {
  border-color: #00b9b5;
  background: #e6f8f8;
}

.dep-ico {
  font-size: 2rem;
  margin-bottom: 6px;
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.ach-card {
  background: white;
  border-radius: 20px;
  padding: 18px;
  border: 2px solid #e6f8f8;
  display: flex;
  align-items: center;
  gap: 14px;
  opacity: 0.6;
}

.ach-card.unlocked {
  opacity: 1;
  border-color: #ffb800;
  background: #fffdf5;
}

.ach-ico {
  font-size: 2.2rem;
}

.ach-text h4 {
  font-size: 1rem;
  font-weight: 800;
}

.ach-text p {
  font-size: 0.8rem;
  color: #596b82;
}

.ach-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-weight: 800;
  color: #d97706;
}

.artworks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 18px;
}

.art-card {
  background: white;
  border-radius: 20px;
  overflow: hidden;
  border: 2px solid #e6f8f8;
  box-shadow: 0 8px 18px rgba(5, 36, 83, 0.05);
}

.art-img-wrap {
  height: 160px;
  position: relative;
  background: #f4fbfd;
}

.art-img-wrap img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.badge-cloud-saved {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(5, 36, 83, 0.85);
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 700;
}

.art-card-footer {
  padding: 12px 14px;
}

.art-card-footer h4 {
  font-size: 0.95rem;
  font-weight: 800;
}

.art-card-footer span {
  font-size: 0.75rem;
  color: #596b82;
  display: block;
  margin-bottom: 8px;
}

.btn-download-art {
  display: block;
  text-align: center;
  background: #00b9b5;
  color: white;
  text-decoration: none;
  font-size: 0.82rem;
  font-weight: 800;
  padding: 6px;
  border-radius: 50px;
}

.empty-gallery {
  background: white;
  border-radius: 24px;
  padding: 40px 20px;
  text-align: center;
  border: 2px dashed #00b9b5;
}

.empty-ico {
  font-size: 3rem;
  margin-bottom: 12px;
}

/* --- BOTTOM BAR MOBILE --- */
.kids-bottom-bar {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(14px);
  border-top: 2px solid #e6f8f8;
  padding: 8px 12px;
  z-index: 100;
  justify-content: space-around;
}

.bottom-item {
  background: none;
  border: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 700;
  color: #596b82;
  cursor: pointer;
}

.bottom-ico {
  font-size: 1.4rem;
}

.bottom-item.active {
  color: #00b9b5;
}

/* --- MODAL DO JOGO --- */
.game-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 36, 83, 0.8);
  backdrop-filter: blur(8px);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.game-modal-box {
  background: white;
  border-radius: 24px;
  width: 100%;
  max-width: 960px;
  height: 85vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.3);
}

.game-modal-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: #052453;
  color: white;
}

.game-modal-top h2 {
  font-size: 1.2rem;
  font-weight: 800;
}

.btn-close-game {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 1rem;
  cursor: pointer;
}

.game-iframe-wrap {
  flex: 1;
  width: 100%;
  background: #000;
}

.game-iframe {
  width: 100%;
  height: 100%;
  border: none;
}

/* --- TOAST --- */
.star-toast {
  position: fixed;
  top: 80px;
  right: 24px;
  background: #052453;
  color: #ffb800;
  padding: 12px 20px;
  border-radius: 50px;
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 10px 24px rgba(5, 36, 83, 0.25);
  border: 2px solid #ffb800;
  z-index: 99999;
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (max-width: 960px) {
  .kids-desktop-nav {
    display: none;
  }
}

@media (max-width: 768px) {
  .kids-child-pill,
  .kids-stars-pill {
    display: none !important;
  }
  .kids-bottom-bar {
    display: flex;
  }
  .kids-hero-banner {
    flex-direction: column;
    padding: 24px 20px;
    text-align: center;
  }
  .mascot-img {
    max-width: 160px;
    margin-top: 14px;
  }
  .hero-actions {
    justify-content: center;
  }
  .studio-layout {
    grid-template-columns: 1fr;
  }
  .templates-sidebar {
    border-right: none;
    border-bottom: 2px solid #e6f8f8;
    padding-bottom: 16px;
  }
  .templates-scroll-grid {
    flex-direction: row;
    max-height: 120px;
  }
  .template-card {
    flex-direction: column;
    min-width: 90px;
  }
}

.dropdown-kid-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dropdown-stars-pill {
  font-size: 0.8rem;
  font-weight: 800;
  color: #b45309;
}

.dropdown-profile-picker {
  background: #f4fbfd;
  border: 1.5px solid #00b9b5;
  border-radius: 14px;
  padding: 8px 10px;
  margin: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropdown-picker-label {
  font-size: 0.72rem;
  font-weight: 800;
  color: #009c9a;
  text-transform: uppercase;
}

.dropdown-dep-select {
  width: 100%;
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid #e6f8f8;
  background: white;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  color: #052453;
  outline: none;
  cursor: pointer;
}

.mock-pills-bar {
  margin-top: 14px;
  background: #f4fbfd;
  border: 1.5px dashed #00b9b5;
  border-radius: 16px;
  padding: 10px 12px;
  text-align: left;
}

.mock-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 800;
  color: #009c9a;
  margin-bottom: 6px;
}

.mock-pills-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mock-pill {
  background: white;
  border: 1.5px solid #e6f8f8;
  border-radius: 12px;
  padding: 6px 10px;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  color: #052453;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.mock-pill:hover {
  background: #e6f8f8;
  border-color: #00b9b5;
}
</style>
