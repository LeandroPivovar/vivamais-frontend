<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { api, clearToken, setToken } from '../../services/api'
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
const authTab = ref('kids') // 'kids' | 'guardian'
const loginCpf = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const kidsTeenSession = ref(null)

const guardianLogin = ref('')
const guardianPassword = ref('')
const guardianLoading = ref(false)
const guardianError = ref('')

function formatCpf(val) {
  const digits = (val || '').replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

function onCpfInput(e) {
  loginCpf.value = formatCpf(e.target.value)
}

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
const forceAuth = ref(props.subRoute === 'auth' && !hasKidsAccess.value)
const showAuthScreen = computed(() => !hasKidsAccess.value || forceAuth.value)

watch(() => props.subRoute, (val) => {
  if (val === 'auth' && !hasKidsAccess.value) {
    forceAuth.value = true
  } else if (val === 'dashboard') {
    forceAuth.value = false
  }
})

async function handleKidsLogin() {
  const digits = loginCpf.value.replace(/\D/g, '')
  if (digits.length < 11) {
    loginError.value = 'Informe um CPF válido (11 números).'
    return
  }
  loginError.value = ''
  loginLoading.value = true
  try {
    const data = await api.post('/auth/login-kids', { cpf: digits, module: 'kids' })
    if (data?.token) {
      if (data.user?.role !== 'admin') {
        loginError.value = 'Acesso ao Viva Mais Kids permitido apenas para administradores.'
        return
      }
      setToken(data.token)
      kidsTeenSession.value = { token: data.token, user: data.user }
      localStorage.setItem(KIDS_TEEN_SESSION_KEY, JSON.stringify(kidsTeenSession.value))
      kidUser.name = data.user?.name ? data.user.name.split(' ')[0] : kidUser.name
      saveKidProfile()
      kidsAudio.playVictory()
      triggerConfetti()
      forceAuth.value = false
      activeTab.value = 'home'
      emit('login', data.user)
      window.history.pushState({ tab: 'kids-dashboard' }, '', '/kids/dashboard')
    }
  } catch (err) {
    loginError.value = err?.message || 'CPF não cadastrado ou sem permissão de acesso.'
  } finally {
    loginLoading.value = false
  }
}

async function handleGuardianLogin() {
  guardianError.value = ''
  guardianLoading.value = true
  try {
    const { token, user } = await api.post('/auth/login', {
      username: guardianLogin.value.trim(),
      password: guardianPassword.value.trim(),
      rememberMe: true,
    })
    if (user?.role !== 'admin') {
      guardianError.value = 'Acesso ao Viva Mais Kids permitido apenas para administradores.'
      return
    }
    setToken(token)
    kidsTeenSession.value = { token, user }
    localStorage.setItem(KIDS_TEEN_SESSION_KEY, JSON.stringify(kidsTeenSession.value))
    kidUser.name = user?.name ? user.name.split(' ')[0] : kidUser.name
    saveKidProfile()
    kidsAudio.playVictory()
    triggerConfetti()
    forceAuth.value = false
    activeTab.value = 'home'
    emit('login', user)
    window.history.pushState({ tab: 'kids-dashboard' }, '', '/kids/dashboard')
  } catch (err) {
    guardianError.value = err.status === 401 ? 'CPF/e-mail ou senha incorretos.' : (err?.message || 'Não foi possível entrar. Tente novamente.')
  } finally {
    guardianLoading.value = false
  }
}

function openHelp() {
  emit('triggerDevModal', {
    title: 'Precisa de Ajuda?',
    message: 'Para suporte na Área Kids ou problemas com o acesso, fale com nossa central de atendimento pelo WhatsApp oficial do Viva Mais Club.'
  })
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
  forceAuth.value = true
  if (props.isLoggedIn) {
    clearToken()
  }
  emit('logout')
  window.history.pushState({ tab: 'kids-auth' }, '', '/kids/auth')
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
    <section v-if="showAuthScreen" class="kids-login-view">
      
      <!-- Topbar Header com fundo branco e logo Viva Mais -->
      <header class="kids-auth-topbar">
        <div class="kids-auth-brand" @click="emit('goHome')" title="Voltar ao Portal Viva Mais Club">
          <img src="/logo-viva-mais.png" alt="Viva Mais Club" class="brand-logo-img" />
          <span class="badge-kids-pill">KIDS</span>
        </div>

        <button class="btn-help-top" @click="openHelp">
          <i class="ph ph-question"></i>
          <span>Precisa de ajuda?</span>
        </button>
      </header>

      <!-- Main Body: Card alinhado no lado direito -->
      <div class="kids-auth-main-container">
        <div class="kids-auth-form-col">
          <div class="kids-auth-card">
            <div class="tab-content-area">
              <h2 class="card-title">Entre na sua conta</h2>
              <p class="card-desc">Para entrar na Área Kids, use apenas o CPF.</p>

              <form @submit.prevent="handleKidsLogin" class="kids-custom-form">
                <div class="form-group-custom">
                  <label>CPF</label>
                  <div class="input-icon-wrap">
                    <i class="ph ph-user"></i>
                    <input
                      :value="loginCpf"
                      @input="onCpfInput"
                      type="text"
                      inputmode="numeric"
                      placeholder="Digite o CPF do dependente"
                      maxlength="14"
                      required
                    />
                  </div>
                </div>

                <div v-if="loginError" class="kids-error-alert">
                  <i class="ph ph-warning-circle"></i>
                  <span>{{ loginError }}</span>
                </div>

                <button type="submit" class="btn-auth-action" :disabled="loginLoading">
                  <span>{{ loginLoading ? 'Entrando...' : 'Continuar' }}</span>
                  <i class="ph ph-arrow-right"></i>
                </button>
              </form>

              <div class="kids-security-box">
                <i class="ph-fill ph-shield-check"></i>
                <div class="security-text">
                  <strong>Ambiente 100% seguro e adequado para crianças.</strong>
                  <span>Seus dados protegidos com todo o cuidado que sua família merece.</span>
                </div>
              </div>
            </div>
          </div>
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
          <img src="/logo-viva-mais.png" alt="Viva Mais Club" class="kids-logo-img" />
          <span class="badge-kids">KIDS</span>
        </div>

        <!-- Barra de Navegação Desktop (Visível em Telas Médias e Grandes) -->
        <nav class="kids-desktop-nav">
          <button class="nav-tab-btn" :class="{ active: activeTab === 'home' }" @click="switchTab('home')">
            <i class="ph-fill ph-house nav-ico"></i>
            <span>Início</span>
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'games' }" @click="switchTab('games')">
            <i class="ph-bold ph-game-controller nav-ico"></i>
            <span>Jogos</span>
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'paint' }" @click="switchTab('paint')">
            <i class="ph-bold ph-paint-brush nav-ico"></i>
            <span>Pintura</span>
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'draw' }" @click="switchTab('draw')">
            <i class="ph-bold ph-chalkboard-simple nav-ico"></i>
            <span>Lousa</span>
          </button>
          <button class="nav-tab-btn" :class="{ active: activeTab === 'profile' }" @click="switchTab('profile')">
            <i class="ph-bold ph-user nav-ico"></i>
            <span>Perfil</span>
          </button>
        </nav>

        <!-- Lado Direito: Seletor de Criança e Estrelas (Ocultos na barra no mobile) -->
        <div class="kids-header-right">
          <!-- Seletor de Perfil da Criança (Desktop) -->
          <div class="kids-child-pill">
            <i class="ph-fill ph-user-circle child-icon-ph"></i>
            <select
              :value="activeProfileId"
              @change="switchProfile($event.target.value)"
              class="kids-dep-select"
              title="Trocar Perfil da Criança"
            >
              <option value="titular">{{ props.user?.name ? props.user.name.split(' ')[0] : 'João' }}</option>
              <option v-for="dep in dependentsList" :key="dep.id" :value="dep.id">
                {{ dep.name.split(' ')[0] }}
              </option>
            </select>
            <i class="ph-bold ph-caret-down select-caret-ico"></i>
          </div>

          <!-- Contador de Estrelas (Desktop) -->
          <div class="kids-stars-pill" @click="switchTab('profile')">
            <i class="ph-fill ph-star star-ico-gold"></i>
            <strong>{{ kidUser.stars }}</strong>
          </div>

          <!-- Menu Opções / Áudio / Portal / Mobile Profile -->
          <div ref="headerMenuRef" class="kids-menu-wrap">
            <button class="kids-menu-btn" @click="showHeaderMenu = !showHeaderMenu" title="Mais Opções">
              <i class="ph ph-dots-three-vertical"></i>
            </button>

            <div v-if="showHeaderMenu" class="kids-dropdown-box">
              <div class="dropdown-kid-info" @click="switchTab('profile')">
                <i class="ph-fill ph-user-circle dropdown-avatar-ph"></i>
                <div class="dropdown-kid-details">
                  <strong>{{ kidUser.name }}</strong>
                  <span class="dropdown-stars-pill"><i class="ph-fill ph-star"></i> {{ kidUser.stars }} estrelas</span>
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
                  <option value="titular">{{ props.user?.name ? props.user.name.split(' ')[0] : 'João' }}</option>
                  <option v-for="dep in dependentsList" :key="dep.id" :value="dep.id">
                    {{ dep.name.split(' ')[0] }}
                  </option>
                </select>
              </div>

              <div class="dropdown-sep"></div>
              <button class="dropdown-item" @click="toggleAudio">
                <i :class="isAudioMuted ? 'ph ph-speaker-simple-slash' : 'ph ph-speaker-simple-high'"></i>
                {{ isAudioMuted ? 'Ativar Sons' : 'Efeitos Sonoros' }}
              </button>
              <button class="dropdown-item" @click="emit('goHome')">
                <i class="ph ph-house"></i> Voltar ao Portal Viva Mais
              </button>
              <button v-if="hasKidsAccess" class="dropdown-item text-danger" @click="handleLogout">
                <i class="ph ph-sign-out"></i> Sair da Conta
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Conteúdo Principal SPA -->
      <main class="kids-main-body">

        <!-- 1. HOME HUB -->
        <section v-if="activeTab === 'home'" class="kids-section-fade">
          <div class="kids-hero-banner-container">
            <img src="/kids/banner-hero.png" alt="Viva Mais Club Kids" class="kids-hero-img" />
            
            <div class="hero-content-overlay">
              <h1 class="hero-main-title">Olá, <span class="highlight-name">{{ kidUser.name }}!</span><br>Vamos brincar?</h1>
              <p class="hero-desc">Jogue mini-games divertidos, pinte desenhos incríveis e crie suas próprias artes na lousa!</p>
              
              <div class="hero-actions">
                <button type="button" class="btn-hero-action btn-game" @click="switchTab('games')">
                  <i class="ph-fill ph-game-controller"></i>
                  <span>Explorar Jogos</span>
                </button>
                <button type="button" class="btn-hero-action btn-paint" @click="switchTab('paint')">
                  <i class="ph-fill ph-paint-brush"></i>
                  <span>Livro de Pintura</span>
                </button>
                <button type="button" class="btn-hero-action btn-draw" @click="switchTab('draw')">
                  <i class="ph-bold ph-chalkboard-simple"></i>
                  <span>Lousa de Desenho</span>
                </button>
              </div>
            </div>
          </div>

          <h2 class="section-title">✨ Escolha sua Aventura de Hoje</h2>
          <div class="hub-grid">
            
            <!-- Card 1: Sala de Jogos -->
            <div class="hub-card card-games" @click="switchTab('games')">
              <div class="card-top-content">
                <div class="card-icon-box bg-mint">
                  <i class="ph-fill ph-game-controller"></i>
                </div>
                <div class="card-text-col">
                  <h3>Sala de Jogos</h3>
                  <p>Subway Surfers, Angry Birds, Banana Kong, Traffic Rider e muitos outros jogos incríveis!</p>
                </div>
              </div>
              <button class="btn-card-action btn-outline-mint">
                <span>Jogar Agora</span>
                <i class="ph ph-arrow-right"></i>
              </button>
              <div class="card-watermark-icon mint-watermark">
                <i class="ph ph-game-controller"></i>
              </div>
            </div>

            <!-- Card 2: Livro de Pintura -->
            <div class="hub-card card-paint" @click="switchTab('paint')">
              <div class="card-top-content">
                <div class="card-icon-box bg-yellow">
                  <i class="ph-fill ph-paint-brush"></i>
                </div>
                <div class="card-text-col">
                  <h3>Livro de Pintura</h3>
                  <p>Pinte com o balde de tinta mágica: Sonic, Hello Kitty, Minecraft e Bobbie Goods!</p>
                </div>
              </div>
              <button class="btn-card-action btn-outline-yellow">
                <span>Colorir Agora</span>
                <i class="ph ph-arrow-right"></i>
              </button>
              <div class="card-watermark-icon yellow-watermark">
                <i class="ph ph-palette"></i>
              </div>
            </div>

            <!-- Card 3: Lousa de Desenho -->
            <div class="hub-card card-draw" @click="switchTab('draw')">
              <div class="card-top-content">
                <div class="card-icon-box bg-purple">
                  <i class="ph-fill ph-pencil-simple-line"></i>
                </div>
                <div class="card-text-col">
                  <h3>Lousa de Desenho</h3>
                  <p>Crie suas próprias obras de arte com 24 cores vibrantes, carimbos e lousa livre!</p>
                </div>
              </div>
              <button class="btn-card-action btn-outline-purple">
                <span>Soltar a Criatividade</span>
                <i class="ph ph-arrow-right"></i>
              </button>
              <div class="card-watermark-icon purple-watermark">
                <i class="ph ph-pencil-line"></i>
              </div>
            </div>

          </div>
        </section>

        <!-- 2. SALA DE JOGOS (LAYOUT OFICIAL VIVA MAIS KIDS) -->
        <section v-else-if="activeTab === 'games'" class="kids-section-fade">
          <!-- Banner da Sala de Jogos -->
          <div class="games-hero-banner-container">
            <img src="/kids/games-banner.png" alt="Sala de Jogos" class="games-hero-img" />
            <div class="games-hero-content">
              <div class="hero-banner-inline-row">
                <div class="games-circle-badge">
                  <i class="ph-fill ph-game-controller"></i>
                </div>
                <div class="hero-banner-text-block">
                  <h1 class="games-main-title">Sala de Jogos</h1>
                  <p class="games-subtitle">Escolha um jogo e acumule estrelas para subir de nível!</p>
                </div>
              </div>
            </div>
          </div>

          <div class="kids-games-grid">
            <div
              v-for="game in paginatedGames"
              :key="game.id"
              class="kid-game-card"
              @click="launchGame(game)"
            >
              <div class="kid-game-thumb-box">
                <img
                  :src="game.image"
                  :alt="game.title"
                  class="kid-game-thumb"
                  loading="lazy"
                  @error="(e) => { e.target.src = 'https://www.madkidgames.com/games/subway-surfers/thumb_2.jpg' }"
                />
                <span v-if="game.badge" class="kid-game-badge">{{ game.badge }}</span>
                <span class="kid-game-stars"><i class="ph-fill ph-star"></i> +15</span>
              </div>
              <div class="kid-game-body">
                <h3 class="kid-game-title">{{ game.title }}</h3>
                <p class="kid-game-desc">{{ game.description }}</p>
                <button type="button" class="btn-kid-play">
                  <span>Jogar Agora</span>
                  <i class="ph-fill ph-play-circle"></i>
                </button>
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

        <!-- 3. LIVRO DE PINTURA (LAYOUT OFICIAL VIVA MAIS KIDS) -->
        <section v-else-if="activeTab === 'paint'" class="kids-section-fade paint-section-wrapper">
          <!-- Elementos decorativos no fundo -->
          <div class="paint-bg-decor decor-top-left"></div>
          <div class="paint-bg-decor decor-bottom-right"></div>
          <div class="paint-floating-star star-1">✨</div>
          <div class="paint-floating-star star-2">⭐</div>
          <div class="paint-floating-bubble bubble-1"></div>
          <div class="paint-floating-bubble bubble-2"></div>

          <!-- Banner do Livro de Pintura Mágica -->
          <div class="paint-hero-banner-container">
            <img src="/kids/paint-banner.png" alt="Livro de Pintura Mágica" class="paint-hero-img" />
            <div class="paint-hero-content">
              <div class="hero-banner-inline-row">
                <div class="paint-circle-badge">
                  <i class="ph-fill ph-pencil-simple-line"></i>
                </div>
                <div class="hero-banner-text-block">
                  <h1 class="paint-main-title">Livro de Pintura Mágica</h1>
                  <p class="paint-subtitle">Clique em qualquer área do desenho para pintar com o balde de tinta inteligente!</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Workspace da Pintura -->
          <div class="paint-workspace-card">
            <!-- Sidebar com Desenhos -->
            <aside class="paint-templates-sidebar">
              <div class="templates-header">
                <i class="ph-fill ph-image"></i>
                <span>Escolha o Desenho:</span>
              </div>
              <div class="templates-list-scroll">
                <button
                  v-for="tmpl in COLORING_TEMPLATES"
                  :key="tmpl.id"
                  type="button"
                  class="tmpl-card-btn"
                  :class="{ active: tmpl.id === activeColoringId }"
                  @click="loadColoringTemplate(tmpl.id)"
                >
                  <img :src="tmpl.svgUrl" :alt="tmpl.title" class="tmpl-thumb-img" />
                  <span class="tmpl-thumb-title">{{ tmpl.title }}</span>
                </button>
              </div>
            </aside>

            <!-- Área Principal do Canvas -->
            <main class="paint-canvas-area">
              <!-- Paleta de Cores -->
              <div class="paint-palette-bar">
                <span class="palette-title">Escolha uma cor:</span>
                <div class="palette-swatches-row">
                  <button
                    v-for="c in SWATCH_COLORS"
                    :key="c"
                    type="button"
                    class="swatch-btn"
                    :style="{ background: c }"
                    :class="{ active: paintColor === c }"
                    @click="paintColor = c; kidsAudio.playClick()"
                  ></button>
                </div>
                <label class="custom-color-picker-label" title="Cor personalizada">
                  <input v-model="paintColor" type="color" class="native-color-hidden" />
                  <i class="ph-fill ph-palette"></i>
                  <span>Cor personalizada</span>
                </label>
              </div>

              <!-- Canvas com Borda Tracejada e Fundo Branco -->
              <div class="paint-dashed-wrapper">
                <canvas
                  ref="paintCanvasRef"
                  @click="handlePaintClick"
                  class="paint-studio-canvas"
                ></canvas>
              </div>

              <!-- Ações do Canvas -->
              <div class="paint-actions-footer">
                <button type="button" class="btn-paint-ctrl" @click="loadColoringTemplate(activeColoringId)">
                  <i class="ph ph-arrow-counter-clockwise"></i>
                  <span>Recomeçar</span>
                </button>
                <button type="button" class="btn-paint-save-award" @click="savePaintArtwork">
                  <i class="ph-fill ph-star"></i>
                  <span>Salvar Obra de Arte (+10 estrelas)</span>
                  <i class="ph-bold ph-caret-right"></i>
                </button>
              </div>
            </main>
          </div>
        </section>

        <!-- 4. LOUSA DE DESENHO LIVRE (LAYOUT OFICIAL VIVA MAIS KIDS) -->
        <section v-else-if="activeTab === 'draw'" class="kids-section-fade lousa-section-wrapper">
          <!-- Banner da Lousa -->
          <div class="lousa-hero-banner-container">
            <img src="/kids/lousa-banner.png" alt="Lousa de Desenho Livre" class="lousa-hero-img" />
            <div class="lousa-hero-content">
              <div class="hero-banner-inline-row">
                <div class="lousa-circle-badge">
                  <i class="ph-bold ph-chalkboard-simple"></i>
                </div>
                <div class="hero-banner-text-block">
                  <h1 class="lousa-main-title">Lousa de Desenho Livre</h1>
                  <p class="lousa-subtitle">Solte a imaginação com pincéis mágicos, carimbos fofos e muitas cores!</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Card do Workspace da Lousa -->
          <div class="lousa-workspace-card">
            <!-- Barra Superior de Ferramentas -->
            <div class="lousa-top-toolbar">
              <!-- Ferramentas -->
              <div class="lousa-tool-pills-group">
                <button
                  type="button"
                  class="lousa-pill-btn"
                  :class="{ active: activeTool === 'brush' }"
                  @click="activeTool = 'brush'; kidsAudio.playClick()"
                >
                  <i class="ph-bold ph-pencil-simple-line"></i>
                  <span>Pincel</span>
                </button>
                <button
                  type="button"
                  class="lousa-pill-btn"
                  :class="{ active: activeTool === 'eraser' }"
                  @click="activeTool = 'eraser'; kidsAudio.playClick()"
                >
                  <i class="ph-bold ph-eraser"></i>
                  <span>Borracha</span>
                </button>
                <button
                  type="button"
                  class="lousa-pill-btn"
                  :class="{ active: activeTool === 'stamp' }"
                  @click="activeTool = 'stamp'; kidsAudio.playClick()"
                >
                  <i class="ph-bold ph-star"></i>
                  <span>Carimbo</span>
                </button>
              </div>

              <!-- Seletor de Espessuras -->
              <div class="lousa-size-pills-group">
                <button
                  type="button"
                  class="lousa-size-btn"
                  :class="{ active: brushSize === 6 }"
                  @click="brushSize = 6"
                >Fino</button>
                <button
                  type="button"
                  class="lousa-size-btn"
                  :class="{ active: brushSize === 12 }"
                  @click="brushSize = 12"
                >Médio</button>
                <button
                  type="button"
                  class="lousa-size-btn"
                  :class="{ active: brushSize === 22 }"
                  @click="brushSize = 22"
                >Grosso</button>
              </div>

              <!-- Ações Desfazer / Refazer / Limpar -->
              <div class="lousa-actions-pills-group">
                <button
                  type="button"
                  class="lousa-pill-btn"
                  :disabled="historyIndex <= 0"
                  @click="undoFreehand"
                >
                  <i class="ph ph-arrow-u-up-left"></i>
                  <span>Desfazer</span>
                </button>
                <button
                  type="button"
                  class="lousa-pill-btn"
                  :disabled="historyIndex >= history.length - 1"
                  @click="redoFreehand"
                >
                  <i class="ph ph-arrow-u-up-right"></i>
                  <span>Refazer</span>
                </button>
                <button
                  type="button"
                  class="lousa-pill-btn text-danger-hover"
                  @click="clearFreehand"
                >
                  <i class="ph ph-trash"></i>
                  <span>Limpar</span>
                </button>
              </div>
            </div>

            <!-- Carimbos (se selecionado) -->
            <div v-if="activeTool === 'stamp'" class="lousa-stamps-picker-bar">
              <span class="stamps-label">Escolha seu carimbo:</span>
              <div class="stamps-list-row">
                <button
                  v-for="st in STAMPS"
                  :key="st"
                  type="button"
                  class="stamp-choice-btn"
                  :class="{ active: activeStamp === st }"
                  @click="activeStamp = st; kidsAudio.playPop()"
                >{{ st }}</button>
              </div>
            </div>

            <!-- Paleta de Cores -->
            <div class="lousa-colors-bar">
              <div class="lousa-swatches-row">
                <button
                  v-for="c in SWATCH_COLORS"
                  :key="c"
                  type="button"
                  class="lousa-swatch-btn"
                  :style="{ background: c }"
                  :class="{ active: currentColor === c && activeTool !== 'eraser' }"
                  @click="currentColor = c; activeTool = 'brush'; kidsAudio.playClick()"
                ></button>
              </div>
              <label class="lousa-custom-color-picker" title="Cor personalizada">
                <input v-model="currentColor" type="color" class="native-color-hidden" @change="activeTool = 'brush'" />
                <span class="lousa-custom-preview-dot" :style="{ background: currentColor }"></span>
                <span>Personalizada</span>
              </label>
            </div>

            <!-- Canvas da Lousa Livre -->
            <div class="lousa-canvas-dashed-frame">
              <canvas
                ref="freehandCanvasRef"
                @mousedown="startFreehandDraw"
                @mousemove="freehandDrawMove"
                @mouseup="stopFreehandDraw"
                @mouseleave="stopFreehandDraw"
                @touchstart.prevent="startFreehandDraw"
                @touchmove.prevent="freehandDrawMove"
                @touchend.prevent="stopFreehandDraw"
                class="lousa-studio-canvas"
              ></canvas>
            </div>

            <!-- Ações Inferiores -->
            <div class="lousa-bottom-bar">
              <button type="button" class="btn-lousa-save-gallery" @click="saveFreehandArtwork">
                <i class="ph-fill ph-image"></i>
                <span>Salvar Obra na Galeria (+10 ⭐)</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 5. MEU PERFIL & GALERIA (LAYOUT OFICIAL VIVA MAIS KIDS) -->
        <section v-else-if="activeTab === 'profile'" class="kids-section-fade profile-section-wrapper">
          <!-- Banner do Perfil -->
          <div class="profile-hero-banner-container">
            <img src="/kids/profile-banner.png" alt="Perfil" class="profile-hero-img" />
            <div class="profile-hero-content">
              <div class="profile-user-inline">
                <div class="profile-big-avatar-circle">
                  <i class="ph-fill ph-star"></i>
                </div>
                <div class="profile-info-col">
                  <h1 class="profile-name-title">{{ kidUser.name }}</h1>
                  <div class="profile-badges-line">
                    <span class="profile-plan-pill"><i class="ph-fill ph-star"></i> Assinante Viva Mais <i class="ph-bold ph-check"></i></span>
                    <span class="profile-turmo-pill"><i class="ph-fill ph-plant"></i> Desbravador em Turmo</span>
                  </div>
                  <div class="profile-stats-line">
                    <span class="profile-stat-badge"><i class="ph-fill ph-game-controller"></i> <strong>58</strong> Partidas</span>
                    <span class="profile-stat-badge"><i class="ph-fill ph-trophy"></i> <strong>20</strong> Itens Coletados</span>
                  </div>
                </div>
              </div>

              <button type="button" class="btn-edit-kid-profile" @click="showHeaderMenu = true">
                <i class="ph-bold ph-pencil-simple-line"></i>
                <span>Editar meu Perfil</span>
              </button>
            </div>
          </div>

          <!-- Conquistas -->
          <div class="profile-section-heading">
            <i class="ph-fill ph-trophy"></i>
            <span>Minhas Conquistas</span>
          </div>

          <div class="profile-achievements-row">
            <div class="ach-card card-unlocked">
              <div class="ach-icon-circle icon-star"><i class="ph-fill ph-star"></i></div>
              <div class="ach-body">
                <h4>Artista em Ascensão</h4>
                <p>Você recebeu 3 conquistas!</p>
              </div>
              <span class="ach-status-badge">Conquistado ⭐</span>
            </div>

            <div class="ach-card card-unlocked">
              <div class="ach-icon-circle icon-palette"><i class="ph-fill ph-palette"></i></div>
              <div class="ach-body">
                <h4>Pequeno Artista</h4>
                <p>Pinte 10 obras diferentes</p>
              </div>
              <span class="ach-status-badge">Conquistado ⭐</span>
            </div>

            <div class="ach-card card-locked">
              <div class="ach-icon-circle icon-lock"><i class="ph-fill ph-lock-key"></i></div>
              <div class="ach-body">
                <h4>Campeão dos Jogos</h4>
                <p>Ganhe 50 partidas em qualquer jogo</p>
              </div>
              <span class="ach-progress-pill">10/50</span>
            </div>

            <div class="ach-card card-locked">
              <div class="ach-icon-circle icon-book"><i class="ph-fill ph-book-open"></i></div>
              <div class="ach-body">
                <h4>Mestre das Cores</h4>
                <p>Pinte com 5 ou mais cores na mesma obra</p>
              </div>
              <span class="ach-progress-pill">2/5</span>
            </div>
          </div>

          <!-- Galeria de Desenhos e Pinturas -->
          <div class="profile-section-header-bar">
            <div class="profile-section-heading">
              <i class="ph-fill ph-image"></i>
              <span>Galeria de Desenhos e Pinturas</span>
            </div>
            <button type="button" class="btn-outline-view-all" @click="switchTab('draw')">
              Ver todas as obras
            </button>
          </div>

          <div v-if="kidUser.artworks.length === 0" class="empty-gallery-dashed">
            <div class="empty-ico-circle">
              <i class="ph-fill ph-palette"></i>
            </div>
            <h3>Sua galeria ainda está vazia!</h3>
            <p>Vá até a <strong>Lousa de Desenho</strong> ou o <strong>Livro de Pintura</strong> para salvar sua primeira obra!</p>
            <button type="button" class="btn-create-artwork-pill" @click="switchTab('draw')">
              <i class="ph-bold ph-pencil-simple-line"></i>
              <span>Criar Desenho</span>
            </button>
          </div>
          <div v-else class="artworks-grid-4col">
            <div
              v-for="art in kidUser.artworks"
              :key="art.id"
              class="profile-art-card"
            >
              <div class="profile-art-thumb">
                <img :src="art.dataUrl || art.serverUrl" :alt="art.title" />
              </div>
              <div class="profile-art-info">
                <h4>{{ art.title }}</h4>
                <span class="art-date">{{ art.date }}</span>
                <div class="art-social-footer">
                  <span><i class="ph-fill ph-heart"></i> 24</span>
                  <span><i class="ph-fill ph-star"></i> 5</span>
                </div>
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

/* --- TELA DE LOGIN KIDS (FUNDO ILUSTRADO COM FORM ALINHADO À DIREITA) --- */
.kids-login-view {
  position: relative;
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-image: url('/kids-bg.png');
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  background-color: #ebf6fb;
  overflow-x: hidden;
}

/* Header Topbar Branco */
.kids-auth-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 48px;
  width: 100%;
  background: #ffffff;
  border-bottom: 1px solid #eef2f6;
  box-shadow: 0 2px 10px rgba(5, 36, 83, 0.04);
  position: relative;
  z-index: 100;
  box-sizing: border-box;
}

.kids-auth-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.brand-logo-img {
  height: 38px;
  width: auto;
  object-fit: contain;
}

.badge-kids-pill {
  background: #39b54a;
  color: #ffffff;
  padding: 3px 10px;
  border-radius: 20px;
  font-weight: 800;
  font-size: 0.78rem;
  letter-spacing: 0.5px;
}

.btn-help-top {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #2563eb;
  font-weight: 600;
  font-size: 0.92rem;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 50px;
  transition: all 0.2s;
}

.btn-help-top:hover {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1d4ed8;
  transform: translateY(-1px);
}

/* Container Principal */
.kids-auth-main-container {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  max-width: 100%;
  margin: 0;
  padding: 40px 4.5vw 48px 40px;
  width: 100%;
  min-height: calc(100vh - 68px);
  box-sizing: border-box;
  position: relative;
  z-index: 5;
}

/* Coluna da Direita (Card de Login) */
.kids-auth-form-col {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 440px;
}

.kids-auth-card {
  background: #ffffff;
  border-radius: 28px;
  padding: 36px 32px;
  box-shadow: 0 25px 60px rgba(6, 38, 89, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(220, 235, 245, 0.95);
  width: 100%;
  position: relative;
  z-index: 5;
}

@media (max-width: 992px) {
  .kids-login-view {
    background-position: 30% center;
  }
  .kids-auth-main-container {
    justify-content: center;
    padding: 100px 20px 40px;
  }
  .kids-auth-topbar {
    padding: 16px 20px;
  }
}

/* Selector Tabs */
.kids-tab-selector {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: #f1f5f9;
  padding: 4px;
  border-radius: 14px;
  gap: 6px;
  margin-bottom: 24px;
}

.kids-tab-selector .tab-btn {
  border: 1.5px solid transparent;
  background: transparent;
  padding: 10px 14px;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.92rem;
  color: #64748b;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s ease;
}

.kids-tab-selector .tab-btn.active {
  background: #ffffff;
  color: #008779;
  border-color: #00b9b5;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 185, 181, 0.15);
}

.card-title {
  font-size: 1.65rem;
  font-weight: 800;
  color: #062659;
  margin-bottom: 6px;
}

.card-desc {
  font-size: 0.9rem;
  color: #64748b;
  margin-bottom: 22px;
  line-height: 1.45;
}

.kids-custom-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.form-group-custom label {
  display: block;
  font-size: 0.85rem;
  font-weight: 700;
  color: #062659;
  margin-bottom: 6px;
}

.input-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-icon-wrap i {
  position: absolute;
  left: 16px;
  color: #94a3b8;
  font-size: 18px;
  pointer-events: none;
}

.input-icon-wrap input {
  width: 100%;
  padding: 13px 16px 13px 44px;
  border: 1.5px solid #dce7ee;
  border-radius: 12px;
  background: #ffffff;
  font-size: 0.95rem;
  color: #062659;
  font-family: inherit;
  font-weight: 500;
  transition: all 0.2s;
  outline: none;
}

.input-icon-wrap input:focus {
  border-color: #008779;
  box-shadow: 0 0 0 3px rgba(0, 135, 121, 0.15);
}

.kids-error-alert {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 0.85rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-auth-action {
  width: 100%;
  padding: 14px 20px;
  border-radius: 12px;
  background: #008779;
  color: #ffffff;
  border: none;
  font-size: 1.05rem;
  font-weight: 700;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 135, 121, 0.25);
  transition: all 0.2s ease;
  margin-top: 4px;
}

.btn-auth-action:hover:not(:disabled) {
  background: #007468;
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(0, 135, 121, 0.35);
}

.btn-auth-action:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.auth-divider-line {
  display: flex;
  align-items: center;
  margin: 22px 0 16px;
}

.auth-divider-line::before,
.auth-divider-line::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e2e8f0;
}

.auth-divider-line span {
  padding: 0 12px;
  font-size: 0.82rem;
  color: #94a3b8;
}

.btn-auth-secondary {
  width: 100%;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1.5px solid #008779;
  background: #ffffff;
  color: #008779;
  font-size: 0.95rem;
  font-weight: 700;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-auth-secondary:hover {
  background: rgba(0, 135, 121, 0.06);
}

.kids-security-box {
  background: #eef9f8;
  border: 1px solid #ccefe9;
  border-radius: 14px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  text-align: left;
}

.kids-security-box i {
  color: #008779;
  font-size: 24px;
  flex-shrink: 0;
}

.security-text strong {
  display: block;
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f766e;
  margin-bottom: 2px;
}

.security-text span {
  display: block;
  font-size: 0.76rem;
  color: #134e4a;
  line-height: 1.35;
}

@media (max-width: 992px) {
  .kids-auth-main-container {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 10px 20px 40px;
  }

  .kids-auth-topbar {
    padding: 16px 20px;
  }

  .kids-hero-title {
    font-size: 2rem;
  }

  .kids-mascot-art {
    max-width: 440px;
  }
}

/* --- HEADER KIDS --- */
.kids-top-header {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 48px;
  background: #ffffff;
  border-bottom: 1px solid #f1f5f9;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}

.kids-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.kids-logo-img {
  height: 36px;
  width: auto;
  object-fit: contain;
}

.badge-kids {
  background: #39b54a;
  color: #ffffff;
  font-size: 0.76rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

/* Barra de Navegação Desktop */
.kids-desktop-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  padding: 0;
  border: none;
}

.nav-tab-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 50px;
  background: transparent;
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  transition: all 0.15s ease;
}

.nav-tab-btn:hover {
  background: #f8fafc;
  color: #0f172a;
}

.nav-tab-btn.active {
  background: #e0f2fe;
  border-color: #bae6fd;
  color: #0284c7;
  font-weight: 700;
  box-shadow: none;
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
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 6px 14px;
  border-radius: 50px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.child-icon-ph {
  font-size: 1.3rem;
  color: #0284c7;
}

.select-caret-ico {
  font-size: 0.8rem;
  color: #64748b;
}

.kids-dep-select {
  background: transparent;
  border: none;
  color: #0f172a;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  cursor: pointer;
  outline: none;
}

.kids-stars-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  color: #b45309;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform 0.15s;
}

.star-ico-gold {
  color: #f59e0b;
  font-size: 1.05rem;
}

.kids-stars-pill:hover {
  transform: scale(1.04);
}

.kids-menu-wrap {
  position: relative;
}

.kids-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border: 1px solid #e2e8f0;
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
  background: #f8fafc;
  border-color: #cbd5e1;
}

.kids-dropdown-box {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: white;
  border-radius: 20px;
  box-shadow: 0 16px 32px rgba(5, 36, 83, 0.15);
  border: 1px solid #e2e8f0;
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
  background: #f8fafc;
}

.dropdown-avatar-ph {
  font-size: 1.8rem;
  color: #0284c7;
}

.dropdown-sep {
  height: 1px;
  background: #f1f5f9;
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
  background: #f1f5f9;
  color: #009c9a;
}

.dropdown-item.text-danger {
  color: #dc2626;
}

/* --- CORPO PRINCIPAL --- */
.kids-main-body {
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 48px 80px;
  flex: 1;
  box-sizing: border-box;
}

.kids-section-fade {
  animation: fadeIn 0.25s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

/* --- HERO BANNER (CONTAINER IMAGEM COM TEXTOS E BOTÕES SOBREPOSTOS) --- */
.kids-hero-banner-container {
  position: relative;
  width: 100%;
  height: auto;
  border-radius: 60px;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(2, 100, 229, 0.16);
  margin-bottom: 36px;
  line-height: 0;
  display: block;
}

.kids-hero-img {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
  border-radius: 60px;
}

.hero-content-overlay {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 52%;
  padding: 36px 0 36px 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  z-index: 5;
  box-sizing: border-box;
  pointer-events: auto;
}

.hero-tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 28, 75, 0.5);
  color: #ffffff !important;
  padding: 4px 12px;
  border-radius: 50px;
  font-size: 0.78rem;
  font-weight: 700;
  margin-bottom: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  backdrop-filter: blur(8px);
}

.hero-tag .tag-gold {
  color: #ffb800;
  font-weight: 800;
}

.hero-main-title {
  font-size: clamp(1.8rem, 2.8vw, 2.8rem);
  font-weight: 900;
  line-height: 1.08;
  color: #ffffff !important;
  margin: 0 0 8px 0;
  letter-spacing: -0.5px;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.hero-main-title .highlight-name {
  color: #ffb800 !important;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.25);
}

.hero-desc {
  color: rgba(255, 255, 255, 0.95) !important;
  font-size: 0.92rem;
  line-height: 1.4;
  font-weight: 500;
  max-width: 440px;
  margin: 0 0 16px 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.hero-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-hero-action {
  padding: 8px 16px;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 700;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.btn-hero-action i {
  font-size: 1rem;
}

.btn-hero-action.btn-game {
  background: #00c49f;
  color: #ffffff;
  box-shadow: 0 6px 18px rgba(0, 196, 159, 0.35);
}

.btn-hero-action.btn-paint {
  background: #ffb800;
  color: #062854;
  box-shadow: 0 6px 18px rgba(255, 184, 0, 0.35);
}

.btn-hero-action.btn-draw {
  background: #ffffff;
  color: #062854;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.1);
  border: 1.5px solid #ffffff;
}

.btn-hero-action:hover {
  transform: translateY(-2px) scale(1.02);
}

@media (max-width: 768px) {
  .kids-hero-banner-container {
    height: 160px !important;
    min-height: 160px !important;
    max-height: 160px !important;
    border-radius: 20px !important;
    margin-bottom: 20px !important;
  }
  .kids-hero-img {
    border-radius: 20px !important;
  }
  .hero-content-overlay {
    position: absolute !important;
    width: 65% !important;
    padding: 12px 16px !important;
    background: transparent !important;
  }
  .hero-main-title {
    font-size: 1.15rem !important;
    line-height: 1.1 !important;
    margin: 0 0 3px 0 !important;
  }
  .hero-desc {
    font-size: 0.68rem !important;
    line-height: 1.25 !important;
    margin: 0 0 8px 0 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
  }
  .hero-actions {
    gap: 6px !important;
  }
  .btn-hero-action {
    padding: 4px 9px !important;
    font-size: 0.68rem !important;
  }
}

/* --- HUB GRID (ESCOLHA SUA AVENTURA) --- */
.section-title {
  font-size: 1.45rem;
  font-weight: 800;
  color: #062854;
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
}

.hub-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.hub-card {
  background: #ffffff;
  border-radius: 24px;
  padding: 24px 22px;
  cursor: pointer;
  border: 1px solid #f1f5f9;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.03);
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  position: relative;
  overflow: hidden;
}

.hub-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 28px rgba(5, 36, 83, 0.08);
}

.card-games {
  border-color: #e6fbf5;
}
.card-games:hover {
  border-color: #10b981;
}

.card-paint {
  border-color: #fef8e7;
}
.card-paint:hover {
  border-color: #f59e0b;
}

.card-draw {
  border-color: #f3e8ff;
}
.card-draw:hover {
  border-color: #8b5cf6;
}

.card-top-content {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.card-icon-box {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
}

.card-icon-box.bg-mint {
  background: #10b981;
  color: #ffffff;
}

.card-icon-box.bg-yellow {
  background: #f59e0b;
  color: #ffffff;
}

.card-icon-box.bg-purple {
  background: #8b5cf6;
  color: #ffffff;
}

.card-text-col {
  flex: 1;
}

.card-text-col h3 {
  font-size: 1.25rem;
  font-weight: 800;
  color: #062854;
  margin: 0 0 6px 0;
}

.card-text-col p {
  color: #64748b;
  font-size: 0.85rem;
  line-height: 1.4;
  margin: 0;
}

.btn-card-action {
  width: fit-content;
  padding: 7px 18px;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: transparent;
  z-index: 2;
}

.btn-outline-mint {
  border: 1.5px solid #10b981;
  color: #059669;
}
.btn-outline-mint:hover {
  background: #e6fbf5;
}

.btn-outline-yellow {
  border: 1.5px solid #f59e0b;
  color: #d97706;
}
.btn-outline-yellow:hover {
  background: #fef8e7;
}

.btn-outline-purple {
  border: 1.5px solid #8b5cf6;
  color: #7c3aed;
}
.btn-outline-purple:hover {
  background: #f3e8ff;
}

.card-watermark-icon {
  position: absolute;
  bottom: 8px;
  right: 14px;
  font-size: 58px;
  pointer-events: none;
  opacity: 0.09;
}
.mint-watermark { color: #10b981; }
.yellow-watermark { color: #f59e0b; }
.purple-watermark { color: #8b5cf6; }

@media (max-width: 992px) {
  .kids-top-header {
    padding: 10px 20px;
  }
  .kids-main-body {
    padding: 16px 20px 60px;
  }
  .hub-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 992px) {
  .kids-hero-banner {
    grid-template-columns: 1fr;
    padding: 32px 24px;
    text-align: center;
  }
  .hero-desc {
    margin: 0 auto 20px;
  }
  .hero-actions {
    justify-content: center;
  }
}

/* --- SALA DE JOGOS (BANNER COM MENINO E GRID DE 4 COLUNAS) --- */
.games-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(260px, 28vw, 400px);
  max-height: 400px;
  border-radius: 60px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 185, 181, 0.12);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.games-hero-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: right center;
  border-radius: 60px;
}

.games-hero-content {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 62%;
  padding: 24px 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  z-index: 5;
  box-sizing: border-box;
}

.hero-banner-inline-row {
  display: flex;
  align-items: center;
  gap: 18px;
}

.games-circle-badge {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #ffffff;
  border: 4px solid #e0f2fe;
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(2, 132, 199, 0.16);
}

.hero-banner-text-block {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.games-main-title {
  font-size: clamp(1.8rem, 2.8vw, 2.6rem);
  font-weight: 900;
  color: #072654;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.games-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #475569;
  margin: 0;
  line-height: 1.35;
  max-width: 480px;
}

@media (max-width: 768px) {
  .games-hero-banner-container {
    height: 160px !important;
    min-height: 160px !important;
    max-height: 160px !important;
    border-radius: 20px !important;
    margin-bottom: 20px !important;
  }
  .games-hero-img {
    border-radius: 20px !important;
  }
  .games-hero-content {
    position: absolute !important;
    width: 68% !important;
    padding: 12px 16px !important;
    background: transparent !important;
  }
  .hero-banner-inline-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 10px !important;
  }
  .games-circle-badge {
    width: 46px !important;
    height: 46px !important;
    font-size: 1.35rem !important;
    border-width: 2.5px !important;
  }
  .games-main-title {
    font-size: 1.18rem !important;
    line-height: 1.1 !important;
    margin: 0 !important;
  }
  .games-subtitle {
    font-size: 0.72rem !important;
    line-height: 1.25 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    max-width: 180px !important;
  }
}

.kids-games-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
  margin-bottom: 36px;
}

@media (max-width: 1200px) {
  .kids-games-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 900px) {
  .kids-games-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 580px) {
  .kids-games-grid {
    grid-template-columns: 1fr;
  }
}

.kid-game-card {
  background: #ffffff;
  border-radius: 22px;
  border: 1.5px solid #f1f5f9;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.04);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
}

.kid-game-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 28px rgba(5, 36, 83, 0.1);
  border-color: #d1fae5;
}

.kid-game-thumb-box {
  position: relative;
  width: calc(100% - 14px);
  margin: 7px 7px 0;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 16px;
  background: #f8fafc;
}

.kid-game-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 16px;
  transition: transform 0.3s ease;
}

.kid-game-card:hover .kid-game-thumb {
  transform: scale(1.06);
}

.kid-game-badge {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: #00bba6;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 50px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.kid-game-stars {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #ffffff;
  color: #b45309;
  font-size: 0.75rem;
  font-weight: 800;
  padding: 3px 9px;
  border-radius: 50px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.kid-game-stars i {
  color: #f59e0b;
  font-size: 0.85rem;
}

.kid-game-body {
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
  gap: 10px;
}

.kid-game-title {
  font-size: 1.02rem;
  font-weight: 800;
  color: #052453;
  margin: 0 0 4px;
}

.kid-game-desc {
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.4;
  margin: 0;
  min-height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.btn-kid-play {
  background: #00b9a5;
  color: #ffffff;
  border: none;
  border-radius: 50px;
  padding: 9px 16px;
  font-family: inherit;
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  transition: all 0.15s ease;
  box-shadow: 0 4px 12px rgba(0, 185, 165, 0.25);
}

.btn-kid-play:hover {
  background: #00a492;
  transform: translateY(-1px);
}

.btn-kid-play i {
  font-size: 1.1rem;
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

/* --- LIVRO DE PINTURA (BANNER COM MENINA E ESTÚDIO DAS CORES) --- */
.paint-section-wrapper {
  position: relative;
  width: 100%;
}

.paint-bg-decor {
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
  z-index: 0;
}

.decor-top-left {
  top: -40px;
  left: -60px;
  width: 280px;
  height: 280px;
  background: radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, transparent 70%);
  filter: blur(20px);
}

.decor-bottom-right {
  bottom: -60px;
  right: -60px;
  width: 320px;
  height: 320px;
  background: radial-gradient(circle, rgba(0, 185, 181, 0.14) 0%, transparent 70%);
  filter: blur(24px);
}

.paint-floating-star {
  position: absolute;
  pointer-events: none;
  z-index: 0;
  opacity: 0.65;
  animation: floatStar 4s ease-in-out infinite alternate;
}

.star-1 {
  top: 10px;
  right: -10px;
  font-size: 1.5rem;
}

.star-2 {
  bottom: 80px;
  left: -25px;
  font-size: 1.8rem;
  animation-delay: 1.5s;
}

.paint-floating-bubble {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.bubble-1 {
  width: 34px;
  height: 34px;
  background: rgba(56, 189, 248, 0.18);
  top: 35%;
  right: -25px;
}

.bubble-2 {
  width: 22px;
  height: 22px;
  background: rgba(244, 114, 182, 0.2);
  bottom: 12%;
  left: -15px;
}

@keyframes floatStar {
  from { transform: translateY(0px) rotate(0deg); }
  to { transform: translateY(-8px) rotate(15deg); }
}

.paint-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(260px, 28vw, 400px);
  max-height: 400px;
  border-radius: 60px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(124, 58, 237, 0.12);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  z-index: 1;
  box-sizing: border-box;
}

.paint-hero-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: right center;
  border-radius: 60px;
}

.paint-hero-content {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 62%;
  padding: 24px 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  z-index: 5;
  box-sizing: border-box;
}

.paint-circle-badge {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #ffffff;
  border: 4px solid #f3e8ff;
  color: #7c3aed;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(124, 58, 237, 0.16);
}

.paint-main-title {
  font-size: clamp(1.8rem, 2.8vw, 2.6rem);
  font-weight: 900;
  color: #072654;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.paint-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #475569;
  margin: 0;
  line-height: 1.35;
  max-width: 480px;
}

@media (max-width: 768px) {
  .paint-hero-banner-container {
    height: 160px !important;
    min-height: 160px !important;
    max-height: 160px !important;
    border-radius: 20px !important;
    margin-bottom: 20px !important;
  }
  .paint-hero-img {
    border-radius: 20px !important;
  }
  .paint-hero-content {
    position: absolute !important;
    width: 68% !important;
    padding: 12px 16px !important;
    background: transparent !important;
  }
  .paint-circle-badge {
    width: 46px !important;
    height: 46px !important;
    font-size: 1.35rem !important;
    border-width: 2.5px !important;
  }
  .paint-main-title {
    font-size: 1.18rem !important;
    line-height: 1.1 !important;
    margin: 0 !important;
  }
  .paint-subtitle {
    font-size: 0.72rem !important;
    line-height: 1.25 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    max-width: 180px !important;
  }
}

.paint-workspace-card {
  background: #ffffff;
  border-radius: 26px;
  border: 1.5px solid #eef2f6;
  box-shadow: 0 8px 30px rgba(5, 36, 83, 0.04);
  padding: 22px;
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
  position: relative;
  z-index: 2;
}

@media (max-width: 900px) {
  .paint-workspace-card {
    grid-template-columns: 1fr;
    padding: 16px;
  }
}

.paint-templates-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.templates-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 800;
  color: #052453;
  padding: 4px 6px;
}

.templates-header i {
  color: #00b9b5;
  font-size: 1.1rem;
}

.templates-list-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 540px;
  overflow-y: auto;
  padding-right: 4px;
}

.tmpl-card-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: #ffffff;
  border: 1.5px solid #f1f5f9;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.18s ease;
  width: 100%;
  text-align: left;
  font-family: inherit;
}

.tmpl-card-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.tmpl-card-btn.active {
  background: #e6fbf9;
  border-color: #00b9b5;
  box-shadow: 0 2px 8px rgba(0, 185, 181, 0.15);
}

.tmpl-thumb-img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  flex-shrink: 0;
  padding: 2px;
}

.tmpl-thumb-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #052453;
}

.paint-canvas-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.paint-palette-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  padding: 10px 18px;
  border-radius: 50px;
}

.palette-title {
  font-size: 0.88rem;
  font-weight: 800;
  color: #052453;
  white-space: nowrap;
}

.palette-swatches-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.swatch-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.swatch-btn:hover {
  transform: scale(1.2);
}

.swatch-btn.active {
  transform: scale(1.28);
  box-shadow: 0 0 0 2.5px #7c3aed, 0 2px 6px rgba(0, 0, 0, 0.25);
}

.custom-color-picker-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.custom-color-picker-label i {
  font-size: 1.1rem;
  color: #7c3aed;
}

.native-color-hidden {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.paint-dashed-wrapper {
  border: 2px dashed #7dd3fc;
  border-radius: 20px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 460px;
  overflow: hidden;
  padding: 12px;
}

.paint-studio-canvas {
  background: #ffffff;
  cursor: crosshair;
  max-width: 100%;
  height: auto;
  display: block;
}

.paint-actions-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.btn-paint-ctrl {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-radius: 50px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  color: #475569;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-paint-ctrl:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-paint-save-award {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 26px;
  border-radius: 50px;
  background: linear-gradient(135deg, #00b9b5 0%, #009c9a 100%);
  color: #ffffff;
  border: none;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 185, 181, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}

.btn-paint-save-award:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 185, 181, 0.45);
}

/* --- LOUSA DE DESENHO LIVRE (BANNER COM MENINA E WORKSPACE) --- */
.lousa-section-wrapper {
  position: relative;
  width: 100%;
}

.lousa-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(260px, 28vw, 400px);
  max-height: 400px;
  border-radius: 60px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 185, 181, 0.12);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.lousa-hero-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: right center;
  border-radius: 60px;
}

.lousa-hero-content {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 62%;
  padding: 24px 36px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  z-index: 5;
  box-sizing: border-box;
}

.lousa-circle-badge {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: #ffffff;
  border: 4px solid #ccfbf1;
  color: #00bba6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  flex-shrink: 0;
  box-shadow: 0 8px 24px rgba(0, 187, 166, 0.16);
}

.lousa-main-title {
  font-size: clamp(1.8rem, 2.8vw, 2.6rem);
  font-weight: 900;
  color: #072654;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.lousa-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #475569;
  margin: 0;
  line-height: 1.35;
  max-width: 480px;
}

@media (max-width: 768px) {
  .lousa-hero-banner-container {
    height: 160px !important;
    min-height: 160px !important;
    max-height: 160px !important;
    border-radius: 20px !important;
    margin-bottom: 20px !important;
  }
  .lousa-hero-img {
    border-radius: 20px !important;
  }
  .lousa-hero-content {
    position: absolute !important;
    width: 68% !important;
    padding: 12px 16px !important;
    background: transparent !important;
  }
  .lousa-circle-badge {
    width: 46px !important;
    height: 46px !important;
    font-size: 1.35rem !important;
    border-width: 2.5px !important;
  }
  .lousa-main-title {
    font-size: 1.18rem !important;
    line-height: 1.1 !important;
    margin: 0 !important;
  }
  .lousa-subtitle {
    font-size: 0.72rem !important;
    line-height: 1.25 !important;
    display: -webkit-box !important;
    -webkit-line-clamp: 2 !important;
    -webkit-box-orient: vertical !important;
    overflow: hidden !important;
    max-width: 180px !important;
  }
}

.lousa-workspace-card {
  background: #ffffff;
  border-radius: 26px;
  border: 1.5px solid #eef2f6;
  box-shadow: 0 8px 30px rgba(5, 36, 83, 0.04);
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lousa-top-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-bottom: 4px;
}

.lousa-tool-pills-group, .lousa-actions-pills-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lousa-pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: all 0.18s ease;
}

.lousa-pill-btn:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.lousa-pill-btn.active {
  background: #00bba6;
  color: #ffffff;
  border-color: #00bba6;
  box-shadow: 0 4px 12px rgba(0, 187, 166, 0.25);
}

.lousa-pill-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: #f1f5f9;
}

.lousa-pill-btn.text-danger-hover:hover {
  color: #dc2626;
  border-color: #fca5a5;
  background: #fef2f2;
}

.lousa-size-pills-group {
  display: flex;
  align-items: center;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 50px;
  padding: 3px;
  gap: 2px;
}

.lousa-size-btn {
  padding: 6px 14px;
  border-radius: 50px;
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s ease;
}

.lousa-size-btn.active {
  background: #00bba6;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 187, 166, 0.2);
}

.lousa-stamps-picker-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #fffbeb;
  border: 1px solid #fef3c7;
  padding: 8px 16px;
  border-radius: 16px;
  flex-wrap: wrap;
}

.lousa-stamps-picker-bar .stamps-label {
  font-size: 0.85rem;
  font-weight: 800;
  color: #b45309;
}

.stamps-list-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.stamp-choice-btn {
  background: #ffffff;
  border: 1.5px solid #fef3c7;
  border-radius: 12px;
  padding: 4px 8px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: transform 0.15s;
}

.stamp-choice-btn:hover {
  transform: scale(1.15);
}

.stamp-choice-btn.active {
  background: #fef08a;
  border-color: #eab308;
}

.lousa-colors-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  padding: 8px 16px;
  border-radius: 50px;
}

.lousa-swatches-row {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.lousa-swatch-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.lousa-swatch-btn:hover {
  transform: scale(1.2);
}

.lousa-swatch-btn.active {
  transform: scale(1.28);
  box-shadow: 0 0 0 2.5px #00bba6, 0 2px 6px rgba(0, 0, 0, 0.25);
}

.lousa-custom-color-picker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  position: relative;
  white-space: nowrap;
}

.lousa-custom-preview-dot {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid #cbd5e1;
  display: inline-block;
}

.lousa-canvas-dashed-frame {
  border: 2px dashed #7dd3fc;
  border-radius: 20px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 440px;
  overflow: hidden;
  padding: 10px;
}

.lousa-studio-canvas {
  background: #ffffff;
  cursor: crosshair;
  max-width: 100%;
  height: auto;
  display: block;
}

.lousa-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  margin-top: 4px;
}

.btn-lousa-save-gallery {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 24px;
  border-radius: 50px;
  background: #00bba6;
  color: #ffffff;
  border: none;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 187, 166, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}

.btn-lousa-save-gallery:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 187, 166, 0.4);
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

/* --- MEU PERFIL (BANNER COM MENINO E CONQUISTAS) --- */
.profile-section-wrapper {
  position: relative;
  width: 100%;
}

.profile-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(260px, 28vw, 400px);
  max-height: 400px;
  border-radius: 60px;
  overflow: hidden;
  box-shadow: 0 14px 36px rgba(5, 36, 83, 0.08);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.profile-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
  display: block;
  border-radius: 60px;
}

.profile-hero-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 24px 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  z-index: 5;
  box-sizing: border-box;
}

.profile-user-inline {
  display: flex;
  align-items: center;
  gap: 20px;
}

.profile-big-avatar-circle {
  width: 78px;
  height: 78px;
  border-radius: 50%;
  background: #ffffff;
  border: 4px solid #fef08a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.4rem;
  color: #f59e0b;
  box-shadow: 0 8px 24px rgba(245, 158, 11, 0.25);
  flex-shrink: 0;
}

.profile-info-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.profile-name-title {
  font-size: clamp(1.8rem, 2.8vw, 2.5rem);
  font-weight: 900;
  color: #072654;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.profile-badges-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.profile-plan-pill {
  background: #fffbeb;
  color: #b45309;
  border: 1px solid #fef3c7;
  border-radius: 50px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.profile-plan-pill i.ph-star {
  color: #f59e0b;
}

.profile-turmo-pill {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #d1fae5;
  border-radius: 50px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.profile-stats-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.profile-stat-badge {
  background: #ffffff;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 3px 10px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.profile-stat-badge i.ph-game-controller {
  color: #0284c7;
}

.profile-stat-badge i.ph-trophy {
  color: #f59e0b;
}

.btn-edit-kid-profile {
  background: #00bba6;
  color: #ffffff;
  border: none;
  border-radius: 50px;
  padding: 10px 20px;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  box-shadow: 0 4px 14px rgba(0, 187, 166, 0.35);
  transition: transform 0.15s, box-shadow 0.15s;
}

.btn-edit-kid-profile:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 187, 166, 0.45);
}

@media (max-width: 768px) {
  .profile-hero-banner-container {
    height: 160px !important;
    min-height: 160px !important;
    max-height: 160px !important;
    border-radius: 20px !important;
    margin-bottom: 20px !important;
  }
  .profile-hero-img {
    border-radius: 20px !important;
  }
  .profile-hero-content {
    position: absolute !important;
    width: 100% !important;
    padding: 12px 16px !important;
    background: transparent !important;
    justify-content: flex-start !important;
  }
  .profile-user-inline {
    gap: 10px !important;
  }
  .profile-big-avatar-circle {
    width: 48px !important;
    height: 48px !important;
    font-size: 1.5rem !important;
    border-width: 2.5px !important;
  }
  .profile-name-title {
    font-size: 1.18rem !important;
    line-height: 1.1 !important;
    margin: 0 !important;
  }
  .profile-badges-line {
    gap: 4px !important;
  }
  .profile-plan-pill, .profile-turmo-pill {
    font-size: 0.64rem !important;
    padding: 2px 6px !important;
  }
  .profile-stats-line {
    display: none !important;
  }
  .btn-edit-kid-profile {
    display: none !important;
  }
}

.profile-section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1.35rem;
  font-weight: 900;
  color: #052453;
  margin: 28px 0 16px;
}

.profile-section-heading i {
  color: #f59e0b;
  font-size: 1.5rem;
}

.profile-achievements-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

@media (max-width: 1100px) {
  .profile-achievements-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .profile-achievements-row {
    grid-template-columns: 1fr;
  }
}

.ach-card {
  background: #ffffff;
  border-radius: 22px;
  border: 1.5px solid #f1f5f9;
  padding: 18px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.03);
  position: relative;
}

.ach-card.card-unlocked {
  border-color: #fde68a;
  background: #fffdf7;
}

.ach-icon-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.45rem;
  flex-shrink: 0;
}

.icon-star {
  background: #fef3c7;
  color: #f59e0b;
}

.icon-palette {
  background: #fef08a;
  color: #d97706;
}

.icon-lock {
  background: #f1f5f9;
  color: #94a3b8;
}

.icon-book {
  background: #e0f2fe;
  color: #0284c7;
}

.ach-body h4 {
  font-size: 0.96rem;
  font-weight: 800;
  color: #052453;
  margin: 0 0 3px;
}

.ach-body p {
  font-size: 0.76rem;
  color: #64748b;
  margin: 0;
  line-height: 1.3;
}

.ach-status-badge {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 0.72rem;
  font-weight: 800;
  color: #d97706;
}

.ach-progress-pill {
  position: absolute;
  top: 14px;
  right: 14px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 50px;
}

.profile-section-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 28px 0 16px;
}

.profile-section-header-bar .profile-section-heading {
  margin: 0;
}

.btn-outline-view-all {
  background: #ffffff;
  border: 1.5px solid #00bba6;
  color: #008f8c;
  border-radius: 50px;
  padding: 7px 18px;
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-outline-view-all:hover {
  background: #00bba6;
  color: #ffffff;
}

.empty-gallery-dashed {
  border: 2px dashed #7dd3fc;
  border-radius: 28px;
  background: #ffffff;
  padding: 48px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.empty-ico-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #fef3c7;
  color: #f59e0b;
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.empty-gallery-dashed h3 {
  font-size: 1.15rem;
  font-weight: 900;
  color: #052453;
  margin: 0;
}

.empty-gallery-dashed p {
  font-size: 0.9rem;
  color: #64748b;
  margin: 0;
}

.btn-create-artwork-pill {
  background: #00bba6;
  color: #ffffff;
  border: none;
  border-radius: 50px;
  padding: 11px 26px;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  box-shadow: 0 4px 14px rgba(0, 187, 166, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
}

.btn-create-artwork-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 187, 166, 0.4);
}

.artworks-grid-4col {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

@media (max-width: 1100px) {
  .artworks-grid-4col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 600px) {
  .artworks-grid-4col {
    grid-template-columns: 1fr;
  }
}

.profile-art-card {
  background: #ffffff;
  border-radius: 22px;
  border: 1.5px solid #f1f5f9;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.04);
  display: flex;
  flex-direction: column;
}

.profile-art-thumb {
  position: relative;
  width: calc(100% - 14px);
  margin: 7px 7px 0;
  aspect-ratio: 16 / 11;
  overflow: hidden;
  border-radius: 16px;
  background: #f8fafc;
}

.profile-art-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.profile-art-info {
  padding: 12px 14px;
}

.profile-art-info h4 {
  font-size: 0.95rem;
  font-weight: 800;
  color: #052453;
  margin: 0 0 2px;
}

.profile-art-info .art-date {
  font-size: 0.75rem;
  color: #64748b;
  display: block;
  margin-bottom: 8px;
}

.art-social-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #00bba6;
  color: #ffffff;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 0.8rem;
  font-weight: 700;
}

.art-social-footer span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
