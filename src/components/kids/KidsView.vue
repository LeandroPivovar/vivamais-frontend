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

  const dep = kidProfileOptions.value.find(d => String(d.id) === String(profileId))
  if (dep) {
    kidUser.name = dep.name.split(' ')[0]
    kidUser.avatar = dep.avatar || '🧒'
    kidUser.stars = Number(data.stars || 0)
  } else {
    kidUser.name = kidsTeenSession.value?.user?.name
      ? kidsTeenSession.value.user.name.split(' ')[0]
      : (props.user?.name ? props.user.name.split(' ')[0] : (data.name || 'Estudante'))
    kidUser.avatar = '⭐'
    kidUser.stars = Number(data.stars || 0)
  }

  kidUser.email = data.email || kidsTeenSession.value?.user?.email || props.user?.email || ''
  kidUser.artworks = data.artworks || []
  kidUser.achievements = data.achievements || defaultUserData.achievements
}

function saveKidProfile() {
  localStorage.setItem(getStorageKey(activeProfileId.value), JSON.stringify(kidUser))
  localStorage.setItem('viva_kids_user', JSON.stringify(kidUser))
}

const galleryArtworks = computed(() => kidUser.artworks.filter(art => art?.dataUrl || art?.serverUrl))
const galleryDrawingsCount = computed(() => galleryArtworks.value.filter(art => art.type === 'desenho').length)
const galleryPaintingsCount = computed(() => galleryArtworks.value.filter(art => art.type === 'pintura').length)

async function fetchDependents() {
  dependentsList.value = []
}

function switchProfile(profileId) {
  saveCreativeDrafts()
  activeProfileId.value = String(profileId)
  localStorage.setItem('viva_kids_active_profile', activeProfileId.value)

  const dep = kidProfileOptions.value.find(d => String(d.id) === String(profileId))
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
    if (saved) {
      const session = JSON.parse(saved)
      if (session?.guest) {
        localStorage.removeItem(KIDS_TEEN_SESSION_KEY)
        kidsTeenSession.value = null
      } else if (session?.module === 'kids') {
        kidsTeenSession.value = session
      } else {
        kidsTeenSession.value = null
      }
    }
  } catch {
    kidsTeenSession.value = null
  }
}
loadKidsTeenSession()

const hasKidsAccess = computed(() => {
  if (kidsTeenSession.value?.module === 'kids') return true
  return false
})
const forceAuth = ref(props.subRoute === 'auth')
const showAuthScreen = computed(() => !hasKidsAccess.value || forceAuth.value)

const kidProfileOptions = computed(() => {
  const sessionUser = kidsTeenSession.value?.module === 'kids' ? kidsTeenSession.value.user : null
  if (sessionUser) return [{ id: 'session', name: sessionUser.name, email: sessionUser.email || '', avatar: '🧒' }]
  return []
})

function finishKidsLogin(data) {
  kidsTeenSession.value = { token: data.token, user: data.user, module: 'kids' }
  localStorage.setItem(KIDS_TEEN_SESSION_KEY, JSON.stringify(kidsTeenSession.value))
  dependentsList.value = []
  activeProfileId.value = 'session'
  localStorage.setItem('viva_kids_active_profile', activeProfileId.value)
  kidUser.name = data.user?.name ? data.user.name.split(' ')[0] : kidUser.name
  saveKidProfile()
  kidsAudio.playVictory()
  triggerConfetti()
  forceAuth.value = false
  activeTab.value = 'home'
  window.history.pushState({ tab: 'kids-dashboard' }, '', '/kids/dashboard')
}

watch(() => props.subRoute, (val) => {
  if (val === 'auth') {
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
      finishKidsLogin(data)
    }
  } catch (err) {
    loginError.value = err?.message || 'CPF não cadastrado ou sem permissão de acesso.'
  } finally {
    loginLoading.value = false
  }
}

function openHelp() {
  emit('triggerDevModal', {
    title: 'Precisa de Ajuda?',
    message: 'Para suporte na Área Kids ou problemas com o acesso, fale com nossa central de atendimento pelo WhatsApp oficial do Viva Mais Club.'
  })
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
const gameRewarded = ref(false)
const gameCountdown = ref(0)
const gameLoading = ref(false)

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

let blocksTimer = null
let targetTimer = null
let flappyTimer = null
let snakeTimer = null
let dinoTimer = null
let gameCountdownTimer = null
let sequenceTimers = []

const memoryIcons = ['⭐', '🎨', '🚀', '🎮', '🌈', '🏆']
const memoryGame = reactive({
  cards: [],
  flipped: [],
  matched: [],
  moves: 0,
  lock: false
})

const blockRows = 14
const blockCols = 8
const blockShapes = [
  { color: '#00b9b5', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { color: '#8b5cf6', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { color: '#ffb800', cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { color: '#38bdf8', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { color: '#ff5a79', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] }
]
const blocksGame = reactive({
  grid: [],
  active: null,
  score: 0,
  lines: 0,
  running: false,
  gameOver: false
})

const targetGame = reactive({
  score: 0,
  timeLeft: 20,
  running: false,
  position: { x: 50, y: 50 }
})

const flappyGame = reactive({
  birdY: 42,
  velocity: 0,
  pipes: [],
  score: 0,
  running: false,
  gameOver: false
})

const snakeSize = 12
const snakeGame = reactive({
  snake: [],
  food: { x: 8, y: 6 },
  direction: 'right',
  nextDirection: 'right',
  score: 0,
  running: false,
  gameOver: false
})

const dinoGame = reactive({
  y: 0,
  velocity: 0,
  obstacleX: 100,
  score: 0,
  running: false,
  gameOver: false
})

const ticTacToeGame = reactive({
  cells: Array(9).fill(''),
  status: 'Sua vez',
  winner: '',
  locked: false
})

const sequenceColors = [
  { id: 'green', label: 'Verde', color: '#10b981' },
  { id: 'blue', label: 'Azul', color: '#38bdf8' },
  { id: 'yellow', label: 'Amarelo', color: '#ffb800' },
  { id: 'pink', label: 'Rosa', color: '#ec4899' }
]
const sequenceGame = reactive({
  sequence: [],
  inputIndex: 0,
  level: 1,
  activeColor: '',
  showing: false,
  status: 'Toque em iniciar'
})

const mathGame = reactive({
  question: '',
  answer: 0,
  options: [],
  score: 0,
  round: 1,
  totalRounds: 8,
  done: false,
  status: 'Escolha a resposta certa'
})

function stopGameTimers() {
  if (gameCountdownTimer) {
    clearTimeout(gameCountdownTimer)
    clearInterval(gameCountdownTimer)
    gameCountdownTimer = null
  }
  gameCountdown.value = 0
  gameLoading.value = false
  if (blocksTimer) {
    clearInterval(blocksTimer)
    blocksTimer = null
  }
  if (targetTimer) {
    clearInterval(targetTimer)
    targetTimer = null
  }
  if (flappyTimer) {
    clearInterval(flappyTimer)
    flappyTimer = null
  }
  if (snakeTimer) {
    clearInterval(snakeTimer)
    snakeTimer = null
  }
  if (dinoTimer) {
    clearInterval(dinoTimer)
    dinoTimer = null
  }
  sequenceTimers.forEach(timer => clearTimeout(timer))
  sequenceTimers = []
}

function startGameRound(game) {
  if (!game || activeGame.value?.id !== game.id) return
  if (game.type === 'memory') resetMemoryGame()
  if (game.type === 'blocks') resetBlocksGame()
  if (game.type === 'target') resetTargetGame()
  if (game.type === 'flappy') resetFlappyGame()
  if (game.type === 'snake') resetSnakeGame()
  if (game.type === 'dino') resetDinoGame()
  if (game.type === 'tictactoe') resetTicTacToeGame()
  if (game.type === 'sequence') resetSequenceGame()
  if (game.type === 'math') resetMathGame()
}

function restartActiveGame() {
  if (!activeGame.value) return
  stopGameTimers()
  gameRewarded.value = false
  gameLoading.value = false
  gameCountdown.value = 3
  kidsAudio.playPop()

  gameCountdownTimer = setInterval(() => {
    gameCountdown.value -= 1
    if (gameCountdown.value <= 0) {
      clearInterval(gameCountdownTimer)
      gameCountdownTimer = null
      gameCountdown.value = 0
      startGameRound(activeGame.value)
    } else {
      kidsAudio.playPop()
    }
  }, 1000)
}

function awardGameStars(amount, reason) {
  if (gameRewarded.value) return
  gameRewarded.value = true
  addStars(amount, reason)
}

function shuffleList(list) {
  return [...list].sort(() => Math.random() - 0.5)
}

function resetMemoryGame() {
  const deck = shuffleList([...memoryIcons, ...memoryIcons]).map((icon, index) => ({
    id: `memory-${index}-${icon}`,
    icon
  }))
  memoryGame.cards = deck
  memoryGame.flipped = []
  memoryGame.matched = []
  memoryGame.moves = 0
  memoryGame.lock = false
}

function flipMemoryCard(index) {
  if (memoryGame.lock || memoryGame.flipped.includes(index) || memoryGame.matched.includes(index)) return
  memoryGame.flipped.push(index)
  kidsAudio.playPop()

  if (memoryGame.flipped.length === 2) {
    memoryGame.moves += 1
    const [a, b] = memoryGame.flipped
    if (memoryGame.cards[a].icon === memoryGame.cards[b].icon) {
      memoryGame.matched.push(a, b)
      memoryGame.flipped = []
      if (memoryGame.matched.length === memoryGame.cards.length) {
        awardGameStars(25, 'Completou o jogo da memoria!')
      }
    } else {
      memoryGame.lock = true
      setTimeout(() => {
        memoryGame.flipped = []
        memoryGame.lock = false
      }, 700)
    }
  }
}

function emptyBlocksGrid() {
  return Array.from({ length: blockRows }, () => Array.from({ length: blockCols }, () => null))
}

function normalizeShape(shape) {
  const minRow = Math.min(...shape.map(([row]) => row))
  const minCol = Math.min(...shape.map(([, col]) => col))
  return shape.map(([row, col]) => [row - minRow, col - minCol])
}

function randomBlockPiece() {
  const base = blockShapes[Math.floor(Math.random() * blockShapes.length)]
  return {
    row: 0,
    col: Math.floor(blockCols / 2) - 1,
    color: base.color,
    cells: base.cells.map(cell => [...cell])
  }
}

function blockCollision(row, col, cells) {
  return cells.some(([r, c]) => {
    const nextRow = row + r
    const nextCol = col + c
    return nextCol < 0 || nextCol >= blockCols || nextRow >= blockRows || (nextRow >= 0 && blocksGame.grid[nextRow]?.[nextCol])
  })
}

function spawnBlock() {
  blocksGame.active = randomBlockPiece()
  if (blockCollision(blocksGame.active.row, blocksGame.active.col, blocksGame.active.cells)) {
    blocksGame.running = false
    blocksGame.gameOver = true
    stopGameTimers()
    awardGameStars(Math.max(10, Math.min(35, 10 + blocksGame.lines * 5)), 'Jogou Blocos Coloridos!')
  }
}

function mergeBlock() {
  if (!blocksGame.active) return
  const grid = blocksGame.grid.map(row => [...row])
  for (const [r, c] of blocksGame.active.cells) {
    const row = blocksGame.active.row + r
    const col = blocksGame.active.col + c
    if (row >= 0 && row < blockRows && col >= 0 && col < blockCols) {
      grid[row][col] = blocksGame.active.color
    }
  }
  const remainingRows = grid.filter(row => row.some(cell => !cell))
  const cleared = blockRows - remainingRows.length
  const newRows = Array.from({ length: cleared }, () => Array.from({ length: blockCols }, () => null))
  blocksGame.grid = [...newRows, ...remainingRows]
  blocksGame.lines += cleared
  blocksGame.score += 10 + cleared * 80
  spawnBlock()
}

function tickBlocks() {
  if (!blocksGame.running || !blocksGame.active) return
  const nextRow = blocksGame.active.row + 1
  if (blockCollision(nextRow, blocksGame.active.col, blocksGame.active.cells)) {
    mergeBlock()
  } else {
    blocksGame.active.row = nextRow
  }
}

function resetBlocksGame() {
  stopGameTimers()
  blocksGame.grid = emptyBlocksGrid()
  blocksGame.score = 0
  blocksGame.lines = 0
  blocksGame.running = true
  blocksGame.gameOver = false
  spawnBlock()
  blocksTimer = setInterval(tickBlocks, 650)
}

function moveBlock(delta) {
  if (!blocksGame.running || !blocksGame.active) return
  const nextCol = blocksGame.active.col + delta
  if (!blockCollision(blocksGame.active.row, nextCol, blocksGame.active.cells)) {
    blocksGame.active.col = nextCol
  }
}

function rotateBlock() {
  if (!blocksGame.running || !blocksGame.active) return
  const rotated = normalizeShape(blocksGame.active.cells.map(([row, col]) => [col, -row]))
  if (!blockCollision(blocksGame.active.row, blocksGame.active.col, rotated)) {
    blocksGame.active.cells = rotated
  }
}

function dropBlock() {
  if (!blocksGame.running || !blocksGame.active) return
  while (!blockCollision(blocksGame.active.row + 1, blocksGame.active.col, blocksGame.active.cells)) {
    blocksGame.active.row += 1
  }
  mergeBlock()
}

function blockCellColor(row, col) {
  const active = blocksGame.active
  if (active) {
    const activeCell = active.cells.some(([r, c]) => active.row + r === row && active.col + c === col)
    if (activeCell) return active.color
  }
  return blocksGame.grid[row]?.[col]
}

function moveTarget() {
  targetGame.position = {
    x: Math.floor(8 + Math.random() * 76),
    y: Math.floor(10 + Math.random() * 72)
  }
}

function resetTargetGame() {
  stopGameTimers()
  targetGame.score = 0
  targetGame.timeLeft = 20
  targetGame.running = true
  moveTarget()
  targetTimer = setInterval(() => {
    targetGame.timeLeft -= 1
    if (targetGame.timeLeft <= 0) {
      targetGame.running = false
      stopGameTimers()
      awardGameStars(Math.max(10, targetGame.score), 'Cacou estrelas no Kids!')
    }
  }, 1000)
}

function hitTarget() {
  if (!targetGame.running) return
  targetGame.score += 1
  kidsAudio.playStar()
  moveTarget()
}

function resetFlappyGame() {
  stopGameTimers()
  flappyGame.birdY = 42
  flappyGame.velocity = 0
  flappyGame.pipes = [
    { x: 105, gap: 44, passed: false },
    { x: 160, gap: 36, passed: false }
  ]
  flappyGame.score = 0
  flappyGame.running = true
  flappyGame.gameOver = false
  flappyTimer = setInterval(tickFlappyGame, 40)
}

function flapBird() {
  if (activeGame.value?.type !== 'flappy') return
  if (flappyGame.gameOver) {
    resetFlappyGame()
    return
  }
  flappyGame.velocity = -4.6
  kidsAudio.playPop()
}

function finishFlappyGame() {
  flappyGame.running = false
  flappyGame.gameOver = true
  stopGameTimers()
  awardGameStars(Math.max(10, Math.min(35, 10 + flappyGame.score * 2)), 'Voou no Passarinho nas Nuvens!')
}

function tickFlappyGame() {
  if (!flappyGame.running) return
  flappyGame.velocity += 0.34
  flappyGame.birdY += flappyGame.velocity

  for (const pipe of flappyGame.pipes) {
    pipe.x -= 1.35
    if (pipe.x < -14) {
      pipe.x = 104
      pipe.gap = 24 + Math.random() * 48
      pipe.passed = false
    }
    if (!pipe.passed && pipe.x < 22) {
      pipe.passed = true
      flappyGame.score += 1
      kidsAudio.playStar()
    }
    const hitsPipeX = pipe.x < 25 && pipe.x > 9
    const hitsPipeY = flappyGame.birdY < pipe.gap - 13 || flappyGame.birdY > pipe.gap + 13
    if (hitsPipeX && hitsPipeY) finishFlappyGame()
  }

  if (flappyGame.birdY < 2 || flappyGame.birdY > 88) finishFlappyGame()
}

function resetSnakeGame() {
  stopGameTimers()
  snakeGame.snake = [{ x: 4, y: 6 }, { x: 3, y: 6 }, { x: 2, y: 6 }]
  snakeGame.food = { x: 8, y: 6 }
  snakeGame.direction = 'right'
  snakeGame.nextDirection = 'right'
  snakeGame.score = 0
  snakeGame.running = true
  snakeGame.gameOver = false
  snakeTimer = setInterval(tickSnakeGame, 180)
}

function setSnakeDirection(direction) {
  if (activeGame.value?.type !== 'snake') return
  if (gameCountdown.value > 0 || snakeGame.gameOver) return
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' }
  if (opposite[direction] === snakeGame.direction) return
  snakeGame.nextDirection = direction
}

function snakeCellAt(x, y) {
  if (snakeGame.food.x === x && snakeGame.food.y === y) return 'food'
  return snakeGame.snake.some(part => part.x === x && part.y === y) ? 'snake' : ''
}

function placeSnakeFood() {
  let next
  do {
    next = {
      x: Math.floor(Math.random() * snakeSize),
      y: Math.floor(Math.random() * snakeSize)
    }
  } while (snakeGame.snake.some(part => part.x === next.x && part.y === next.y))
  snakeGame.food = next
}

function finishSnakeGame() {
  snakeGame.running = false
  snakeGame.gameOver = true
  stopGameTimers()
  awardGameStars(Math.max(10, Math.min(40, 10 + snakeGame.score * 4)), 'Jogou Cobrinha do Jardim!')
}

function tickSnakeGame() {
  if (!snakeGame.running) return
  snakeGame.direction = snakeGame.nextDirection
  const head = { ...snakeGame.snake[0] }
  if (snakeGame.direction === 'up') head.y -= 1
  if (snakeGame.direction === 'down') head.y += 1
  if (snakeGame.direction === 'left') head.x -= 1
  if (snakeGame.direction === 'right') head.x += 1

  const hitWall = head.x < 0 || head.x >= snakeSize || head.y < 0 || head.y >= snakeSize
  const hitSelf = snakeGame.snake.some(part => part.x === head.x && part.y === head.y)
  if (hitWall || hitSelf) {
    finishSnakeGame()
    return
  }

  snakeGame.snake.unshift(head)
  if (head.x === snakeGame.food.x && head.y === snakeGame.food.y) {
    snakeGame.score += 1
    kidsAudio.playStar()
    placeSnakeFood()
  } else {
    snakeGame.snake.pop()
  }
}

function resetDinoGame() {
  stopGameTimers()
  dinoGame.y = 0
  dinoGame.velocity = 0
  dinoGame.obstacleX = 100
  dinoGame.score = 0
  dinoGame.running = true
  dinoGame.gameOver = false
  dinoTimer = setInterval(tickDinoGame, 34)
}

function jumpDino() {
  if (activeGame.value?.type !== 'dino') return
  if (dinoGame.gameOver) {
    resetDinoGame()
    return
  }
  if (dinoGame.y <= 0.5) {
    dinoGame.velocity = 7.6
    kidsAudio.playPop()
  }
}

function finishDinoGame() {
  dinoGame.running = false
  dinoGame.gameOver = true
  stopGameTimers()
  awardGameStars(Math.max(10, Math.min(40, 10 + Math.floor(dinoGame.score / 8))), 'Correu com o Dino Saltador!')
}

function tickDinoGame() {
  if (!dinoGame.running) return
  dinoGame.score += 1
  dinoGame.obstacleX -= 1.45
  if (dinoGame.obstacleX < -8) {
    dinoGame.obstacleX = 105
  }

  dinoGame.y += dinoGame.velocity
  dinoGame.velocity -= 0.38
  if (dinoGame.y < 0) {
    dinoGame.y = 0
    dinoGame.velocity = 0
  }

  const collisionX = dinoGame.obstacleX > 16 && dinoGame.obstacleX < 29
  const collisionY = dinoGame.y < 15
  if (collisionX && collisionY) finishDinoGame()
}

function checkTicTacToeWinner(cells) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ]
  for (const [a, b, c] of lines) {
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a]
  }
  return cells.every(Boolean) ? 'draw' : ''
}

function resetTicTacToeGame() {
  ticTacToeGame.cells = Array(9).fill('')
  ticTacToeGame.status = 'Sua vez'
  ticTacToeGame.winner = ''
  ticTacToeGame.locked = false
}

function finishTicTacToe(winner) {
  ticTacToeGame.winner = winner
  ticTacToeGame.locked = true
  if (winner === 'X') {
    ticTacToeGame.status = 'Voce venceu!'
    awardGameStars(20, 'Venceu o Jogo da Velha!')
  } else if (winner === 'O') {
    ticTacToeGame.status = 'O computador venceu'
  } else {
    ticTacToeGame.status = 'Empate!'
    awardGameStars(10, 'Empatou no Jogo da Velha!')
  }
}

function playTicTacToe(index) {
  if (ticTacToeGame.locked || ticTacToeGame.cells[index]) return
  ticTacToeGame.cells[index] = 'X'
  kidsAudio.playPop()
  const playerWinner = checkTicTacToeWinner(ticTacToeGame.cells)
  if (playerWinner) {
    finishTicTacToe(playerWinner)
    return
  }

  ticTacToeGame.locked = true
  ticTacToeGame.status = 'Computador pensando...'
  setTimeout(() => {
    const empty = ticTacToeGame.cells.map((cell, i) => cell ? null : i).filter(i => i !== null)
    const choice = empty[Math.floor(Math.random() * empty.length)]
    if (choice !== undefined) ticTacToeGame.cells[choice] = 'O'
    const botWinner = checkTicTacToeWinner(ticTacToeGame.cells)
    if (botWinner) {
      finishTicTacToe(botWinner)
    } else {
      ticTacToeGame.locked = false
      ticTacToeGame.status = 'Sua vez'
    }
  }, 420)
}

function randomSequenceColor() {
  return sequenceColors[Math.floor(Math.random() * sequenceColors.length)].id
}

function showSequence() {
  sequenceTimers.forEach(timer => clearTimeout(timer))
  sequenceTimers = []
  sequenceGame.showing = true
  sequenceGame.inputIndex = 0
  sequenceGame.status = 'Observe a sequencia'

  sequenceGame.sequence.forEach((colorId, index) => {
    sequenceTimers.push(setTimeout(() => {
      sequenceGame.activeColor = colorId
      kidsAudio.playPop()
    }, 650 * index))
    sequenceTimers.push(setTimeout(() => {
      sequenceGame.activeColor = ''
      if (index === sequenceGame.sequence.length - 1) {
        sequenceGame.showing = false
        sequenceGame.status = 'Agora repita'
      }
    }, 650 * index + 360))
  })
}

function resetSequenceGame() {
  stopGameTimers()
  sequenceGame.sequence = [randomSequenceColor()]
  sequenceGame.inputIndex = 0
  sequenceGame.level = 1
  sequenceGame.activeColor = ''
  sequenceGame.status = 'Observe a sequencia'
  showSequence()
}

function pressSequenceColor(colorId) {
  if (sequenceGame.showing || sequenceGame.sequence.length === 0) return
  sequenceGame.activeColor = colorId
  sequenceTimers.push(setTimeout(() => { sequenceGame.activeColor = '' }, 160))
  if (sequenceGame.sequence[sequenceGame.inputIndex] !== colorId) {
    sequenceGame.status = 'Ops, tente de novo'
    awardGameStars(Math.max(8, sequenceGame.level * 4), 'Treinou memoria de cores!')
    return
  }

  sequenceGame.inputIndex += 1
  if (sequenceGame.inputIndex >= sequenceGame.sequence.length) {
    sequenceGame.level += 1
    sequenceGame.status = 'Muito bem!'
    if (sequenceGame.level > 5) {
      awardGameStars(30, 'Completou Sequencia de Cores!')
      sequenceGame.status = 'Sequencia completa!'
      return
    }
    sequenceGame.sequence.push(randomSequenceColor())
    sequenceTimers.push(setTimeout(showSequence, 680))
  }
}

function buildMathQuestion() {
  const opRand = Math.random()
  const op = opRand < 0.45 ? '+' : (opRand < 0.8 ? '-' : 'x')
  let a, b, answer, question

  if (op === '+') {
    a = Math.floor(Math.random() * 12) + 1
    b = Math.floor(Math.random() * 10) + 1
    answer = a + b
    question = `${a} + ${b} = ?`
  } else if (op === '-') {
    b = Math.floor(Math.random() * 8) + 1
    a = b + Math.floor(Math.random() * 10) + 1
    answer = a - b
    question = `${a} - ${b} = ?`
  } else {
    a = [2, 3, 4, 5][Math.floor(Math.random() * 4)]
    b = Math.floor(Math.random() * 5) + 1
    answer = a * b
    question = `${a} × ${b} = ?`
  }

  const optionSet = new Set([answer])
  const offsets = [-3, -2, -1, 1, 2, 3, 4]
  shuffleList(offsets).forEach(offset => {
    if (optionSet.size < 3) {
      const candidate = answer + offset
      if (candidate > 0 && candidate !== answer) {
        optionSet.add(candidate)
      }
    }
  })
  let fallback = 1
  while (optionSet.size < 3) {
    if (!optionSet.has(fallback) && fallback !== answer) {
      optionSet.add(fallback)
    }
    fallback++
  }

  mathGame.question = question
  mathGame.answer = answer
  mathGame.options = shuffleList([...optionSet])
  mathGame.status = 'Escolha a resposta certa'
}

function resetMathGame() {
  mathGame.score = 0
  mathGame.round = 1
  mathGame.done = false
  buildMathQuestion()
}

function answerMath(option) {
  if (mathGame.done) return
  if (Number(option) === Number(mathGame.answer)) {
    mathGame.score += 1
    mathGame.status = 'Acertou!'
    kidsAudio.playStar()
  } else {
    mathGame.status = 'Quase!'
    kidsAudio.playPop()
  }

  if (mathGame.round >= mathGame.totalRounds) {
    mathGame.done = true
    awardGameStars(10 + mathGame.score * 4, 'Jogou Matematica Rapida!')
  } else {
    mathGame.round += 1
    setTimeout(buildMathQuestion, 420)
  }
}

function launchGame(game) {
  stopGameTimers()
  activeGame.value = game
  gameRewarded.value = false
  gameLoading.value = true
  gameCountdown.value = 0
  kidsAudio.playPop()

  const loadingDelay = Math.floor(4000 + Math.random() * 2000)
  gameCountdownTimer = setTimeout(() => {
    gameLoading.value = false
    gameCountdownTimer = null
    startGameRound(game)
  }, loadingDelay)
}

function closeGame() {
  stopGameTimers()
  activeGame.value = null
  kidsAudio.playPop()
}

function onGameKeydown(e) {
  if (!activeGame.value) return
  if (gameCountdown.value > 0) {
    e.preventDefault()
    return
  }
  if (activeGame.value.type === 'flappy' && (e.key === ' ' || e.key === 'ArrowUp')) {
    e.preventDefault()
    flapBird()
    return
  }
  if (activeGame.value.type === 'dino' && (e.key === ' ' || e.key === 'ArrowUp')) {
    e.preventDefault()
    jumpDino()
    return
  }
  if (activeGame.value.type === 'snake') {
    if (e.key === 'ArrowLeft') setSnakeDirection('left')
    if (e.key === 'ArrowRight') setSnakeDirection('right')
    if (e.key === 'ArrowUp') setSnakeDirection('up')
    if (e.key === 'ArrowDown') setSnakeDirection('down')
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault()
    return
  }
  if (activeGame.value.type !== 'blocks') return
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    moveBlock(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    moveBlock(1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    rotateBlock()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    tickBlocks()
  } else if (e.key === ' ') {
    e.preventDefault()
    dropBlock()
  }
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
let freehandDraftCleared = false

const SWATCH_COLORS = [
  '#00b9b5', '#052453', '#ffb800', '#ff5a79',
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f97316', '#14b8a6', '#6366f1', '#a855f7',
  '#e11d48', '#84cc16', '#06b6d4', '#0f172a',
  '#d97706', '#0284c7', '#4f46e5', '#7c3aed',
  '#db2777', '#65a30d', '#0d9488', '#ffffff'
]

const STAMPS = ['⭐', '🎨', '🚀', '🐱', '🐶', '🦄', '🌸', '👑', '🍕', '⚽']

function getCreativeDraftKey(type, suffix = 'main') {
  return `viva_kids_${type}_draft_${activeProfileId.value || 'titular'}_${suffix}`
}

function getCanvasPixelRatio() {
  return Math.min(2.5, Math.max(2, window.devicePixelRatio || 1))
}

function setCanvasDisplaySize(canvas, displayWidth, displayHeight) {
  const ratio = getCanvasPixelRatio()
  const width = Math.round(displayWidth * ratio)
  const height = Math.round(displayHeight * ratio)
  canvas.width = width
  canvas.height = height
  canvas.style.width = `${displayWidth}px`
  canvas.style.height = `${displayHeight}px`
  return { width, height, ratio }
}

function getCanvasRenderScale(canvas) {
  const rect = canvas.getBoundingClientRect()
  return canvas.width / Math.max(rect.width, 1)
}

function clearKidsCreativeDraftCache() {
  const prefixes = ['viva_kids_draw_draft_', 'viva_kids_paint_draft_']
  Object.keys(localStorage)
    .filter(key => prefixes.some(prefix => key.startsWith(prefix)))
    .forEach(key => localStorage.removeItem(key))
}

function drawDataUrlOnCanvas(ctx, canvas, dataUrl, afterLoad) {
  const img = new Image()
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    if (afterLoad) afterLoad()
  }
  img.src = dataUrl
}

function saveFreehandDraft() {
  if (!freehandCanvasRef.value) return
  if (freehandDraftCleared) return
  localStorage.setItem(getCreativeDraftKey('draw'), freehandCanvasRef.value.toDataURL('image/png'))
}

function initFreehandCanvas({ restoreDraft = true } = {}) {
  const canvas = freehandCanvasRef.value
  if (!canvas) return
  freehandCtx = canvas.getContext('2d')

  const container = canvas.parentElement
  const availableWidth = Math.max(Math.floor(container?.clientWidth || 600) - 24, 280)
  const targetWidth = Math.min(availableWidth, 840)
  const targetHeight = Math.round(targetWidth * 0.62)

  const canvasSize = setCanvasDisplaySize(canvas, targetWidth, targetHeight)

  freehandCtx.fillStyle = '#ffffff'
  freehandCtx.fillRect(0, 0, canvasSize.width, canvasSize.height)
  history.value = []
  historyIndex.value = -1

  const savedDraft = restoreDraft ? localStorage.getItem(getCreativeDraftKey('draw')) : null
  if (savedDraft) {
    drawDataUrlOnCanvas(freehandCtx, canvas, savedDraft, pushFreehandHistory)
  } else {
    pushFreehandHistory()
  }
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
      saveFreehandDraft()
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
      saveFreehandDraft()
    }
    img.src = history.value[historyIndex.value]
    kidsAudio.playPop()
  }
}

function clearFreehand() {
  if (!freehandCanvasRef.value || !freehandCtx) return
  localStorage.removeItem(getCreativeDraftKey('draw'))
  freehandDraftCleared = true
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
  freehandDraftCleared = false
  const renderScale = getCanvasRenderScale(freehandCanvasRef.value)

  if (activeTool.value === 'stamp') {
    freehandCtx.font = `${(brushSize.value * 3 + 20) * renderScale}px 'Fredoka', sans-serif`
    freehandCtx.textAlign = 'center'
    freehandCtx.textBaseline = 'middle'
    freehandCtx.fillText(activeStamp.value, x, y)
    pushFreehandHistory()
    saveFreehandDraft()
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
  const renderScale = getCanvasRenderScale(freehandCanvasRef.value)

  if (activeTool.value === 'eraser') {
    freehandCtx.strokeStyle = '#ffffff'
    freehandCtx.lineWidth = brushSize.value * 2.2 * renderScale
  } else {
    freehandCtx.strokeStyle = currentColor.value
    freehandCtx.lineWidth = brushSize.value * renderScale
  }

  freehandCtx.lineTo(x, y)
  freehandCtx.stroke()
}

function stopFreehandDraw() {
  if (isDrawing.value) {
    freehandCtx.closePath()
    isDrawing.value = false
    pushFreehandHistory()
    saveFreehandDraft()
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
  saveFreehandDraft()
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
const showPaintPicker = ref(true)
const paintPickerPage = ref(0)
const paintPickerPageSize = ref(typeof window !== 'undefined' && window.innerWidth <= 768 ? 1 : 3)
const freehandZoom = ref(1)
const paintZoom = ref(1)
let paintDraftCleared = false

const activeColoringTemplate = computed(() => (
  COLORING_TEMPLATES.find(t => t.id === activeColoringId.value) || COLORING_TEMPLATES[0]
))

const filteredColorings = computed(() => {
  if (coloringCategory.value === 'all') return COLORING_TEMPLATES
  return COLORING_TEMPLATES.filter(c => c.category === coloringCategory.value)
})

const visiblePaintTemplates = computed(() => {
  const start = paintPickerPage.value * paintPickerPageSize.value
  return COLORING_TEMPLATES.slice(start, start + paintPickerPageSize.value)
})

const totalPaintPickerPages = computed(() => Math.ceil(COLORING_TEMPLATES.length / paintPickerPageSize.value))

function syncPaintPickerLayout() {
  const nextSize = window.innerWidth <= 768 ? 1 : 3
  if (paintPickerPageSize.value !== nextSize) {
    paintPickerPageSize.value = nextSize
    paintPickerPage.value = 0
  }
}

function changePaintPickerPage(direction) {
  paintPickerPage.value = (paintPickerPage.value + direction + totalPaintPickerPages.value) % totalPaintPickerPages.value
  kidsAudio.playPop()
}

function savePaintDraft() {
  if (!paintCanvasRef.value) return
  if (paintDraftCleared) return
  localStorage.setItem(
    getCreativeDraftKey('paint', activeColoringId.value),
    paintCanvasRef.value.toDataURL('image/png')
  )
  localStorage.setItem(getCreativeDraftKey('paint_active'), activeColoringId.value)
}

function clearPaintDraftCache() {
  const profileId = activeProfileId.value || 'titular'
  const prefix = `viva_kids_paint_draft_${profileId}_`
  Object.keys(localStorage)
    .filter(key => key.startsWith(prefix))
    .forEach(key => localStorage.removeItem(key))
}

function openPaintPicker() {
  savePaintDraft()
  showPaintPicker.value = true
  kidsAudio.playPop()
}

function selectColoringTemplate(id) {
  savePaintDraft()
  activeColoringId.value = id
  showPaintPicker.value = false
  kidsAudio.playClick()
  nextTick(() => loadColoringTemplate(id))
}

function resetPaintTemplate() {
  localStorage.removeItem(getCreativeDraftKey('paint', activeColoringId.value))
  localStorage.removeItem(getCreativeDraftKey('paint_active'))
  paintDraftCleared = true
  loadColoringTemplate(activeColoringId.value, { restoreDraft: false })
}

function changeCanvasZoom(target, amount) {
  const zoomRef = target === 'paint' ? paintZoom : freehandZoom
  zoomRef.value = Math.min(2.25, Math.max(0.75, Number((zoomRef.value + amount).toFixed(2))))
  kidsAudio.playClick()
}

function resetCanvasZoom(target) {
  const zoomRef = target === 'paint' ? paintZoom : freehandZoom
  zoomRef.value = 1
  kidsAudio.playPop()
}

function loadColoringTemplate(id, { restoreDraft = true } = {}) {
  activeColoringId.value = id
  const tmpl = COLORING_TEMPLATES.find(t => t.id === id) || COLORING_TEMPLATES[0]
  const canvas = paintCanvasRef.value
  if (!canvas) return
  paintCtx = canvas.getContext('2d')

  const container = canvas.parentElement
  const availableWidth = Math.max(Math.floor(container?.clientWidth || 600) - 24, 280)
  const targetWidth = Math.min(availableWidth, 840)
  const targetHeight = Math.round(targetWidth * 0.62)

  const canvasSize = setCanvasDisplaySize(canvas, targetWidth, targetHeight)

  const savedDraft = restoreDraft ? localStorage.getItem(getCreativeDraftKey('paint', id)) : null
  if (savedDraft) {
    drawDataUrlOnCanvas(paintCtx, canvas, savedDraft)
    return
  }

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    paintCtx.fillStyle = '#ffffff'
    paintCtx.fillRect(0, 0, canvasSize.width, canvasSize.height)

    // Ajusta proporção para caber perfeitamente no canvas
    const drawingMargin = (window.innerWidth <= 768 ? 54 : 40) * canvasSize.ratio
    const scale = Math.min((canvasSize.width - drawingMargin) / img.width, (canvasSize.height - drawingMargin) / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    const dx = (canvasSize.width - dw) / 2
    const dy = (canvasSize.height - dh) / 2
    paintCtx.imageSmoothingEnabled = true
    paintCtx.imageSmoothingQuality = 'high'
    paintCtx.drawImage(img, dx, dy, dw, dh)
  }
  img.onerror = () => {
    // Fallback se SVG não carregar
    paintCtx.fillStyle = '#ffffff'
    paintCtx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    paintCtx.font = `${70 * canvasSize.ratio}px sans-serif`
    paintCtx.textAlign = 'center'
    paintCtx.fillText(tmpl.thumbnailIcon || '🎨', canvasSize.width / 2, canvasSize.height / 2)
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
  paintDraftCleared = false
  savePaintDraft()
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
  savePaintDraft()
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
function saveCreativeDrafts() {
  saveFreehandDraft()
  savePaintDraft()
}

function switchTab(tab) {
  const previousTab = activeTab.value
  if (previousTab === tab) return

  if (previousTab === 'draw') saveFreehandDraft()
  if (previousTab === 'paint' && !showPaintPicker.value) savePaintDraft()

  activeTab.value = tab
  showHeaderMenu.value = false
  kidsAudio.playClick()

  if (tab === 'draw') {
    freehandDraftCleared = false
    nextTick(() => initFreehandCanvas())
  } else if (tab === 'paint' && !showPaintPicker.value) {
    paintDraftCleared = false
    nextTick(() => loadColoringTemplate(activeColoringId.value))
  }
}

function toggleAudio() {
  isAudioMuted.value = kidsAudio.toggleMute()
}

function handleLogout() {
  saveCreativeDrafts()
  clearKidsCreativeDraftCache()
  freehandDraftCleared = true
  paintDraftCleared = true
  if (kidsTeenSession.value) {
    kidsTeenSession.value = null
    localStorage.removeItem(KIDS_TEEN_SESSION_KEY)
  }
  forceAuth.value = true
  if (props.isLoggedIn) {
    clearToken()
  }
  emit('logout', 'kids-auth')
}

// Fecha dropdown ao clicar fora
function onWindowClick(e) {
  if (headerMenuRef.value && !headerMenuRef.value.contains(e.target)) {
    showHeaderMenu.value = false
  }
}

let resizeCanvasTimer = null
function handleWindowResize() {
  syncPaintPickerLayout()
  clearTimeout(resizeCanvasTimer)
  resizeCanvasTimer = setTimeout(() => {
    if (activeTab.value === 'draw' && freehandCanvasRef.value) {
      const data = freehandCanvasRef.value.toDataURL()
      initFreehandCanvas({ restoreDraft: false })
      if (data && freehandCtx) {
        drawDataUrlOnCanvas(freehandCtx, freehandCanvasRef.value, data)
      }
    }
    if (activeTab.value === 'paint' && paintCanvasRef.value) {
      const data = paintCanvasRef.value.toDataURL()
      loadColoringTemplate(activeColoringId.value, { restoreDraft: false })
      if (data && paintCtx) {
        drawDataUrlOnCanvas(paintCtx, paintCanvasRef.value, data)
      }
    }
  }, 150)
}

onMounted(async () => {
  document.addEventListener('click', onWindowClick)
  window.addEventListener('keydown', onGameKeydown)
  window.addEventListener('resize', handleWindowResize)
  syncPaintPickerLayout()
  loadKidProfile(activeProfileId.value)
  await fetchDependents()
})

onBeforeUnmount(() => {
  saveCreativeDrafts()
  document.removeEventListener('click', onWindowClick)
  window.removeEventListener('keydown', onGameKeydown)
  window.removeEventListener('resize', handleWindowResize)
  stopGameTimers()
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
        <div class="kids-auth-brand">
          <img src="/logo-viva-mais.png" alt="Viva Mais Club" class="brand-logo-img" />
          <span class="badge-kids-pill">KIDS</span>
        </div>
      </header>

      <!-- Main Body: Card alinhado no lado direito -->
      <div class="kids-auth-main-container">
        <div class="kids-auth-mobile-visual" aria-hidden="true">
          <img src="/kids/banners/auth-kids-two-turminha-v1.png" alt="" class="kids-auth-mobile-img" />
        </div>
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
                  <span>{{ loginLoading ? 'Entrando...' : 'Entrar' }}</span>
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
            <i class="ph-fill ph-game-controller nav-ico"></i>
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

        <!-- Lado Direito: Estrelas e menu de perfil -->
        <div class="kids-header-right">
          <!-- Contador de Estrelas (Desktop) -->
          <div class="kids-stars-pill" @click="switchTab('profile')">
            <i class="ph-fill ph-star star-ico-gold"></i>
            <strong>{{ kidUser.stars }}</strong>
          </div>

          <!-- Menu de Perfil -->
          <div ref="headerMenuRef" class="kids-menu-wrap">
            <button class="kids-profile-menu-btn" @click="showHeaderMenu = !showHeaderMenu" title="Perfil">
              <i class="ph-fill ph-user-circle"></i>
              <span>{{ kidUser.name }}</span>
              <i class="ph ph-caret-down"></i>
            </button>

            <div v-if="showHeaderMenu" class="kids-dropdown-box">
              <div class="dropdown-kid-info">
                <i class="ph-fill ph-user-circle dropdown-avatar-ph"></i>
                <div class="dropdown-kid-details">
                  <strong>{{ kidUser.name }}</strong>
                  <span class="dropdown-stars-pill"><i class="ph-fill ph-star"></i> {{ kidUser.stars }} estrelas</span>
                </div>
              </div>

              <button class="dropdown-item" @click="switchTab('profile')">
                <i class="ph ph-user-circle"></i> Ver meu Perfil
              </button>

              <div class="dropdown-profile-picker">
                <span class="dropdown-picker-label">Trocar dependente</span>
                <button
                  v-for="dep in kidProfileOptions"
                  :key="dep.id"
                  type="button"
                  class="dropdown-profile-option"
                  :class="{ active: String(dep.id) === String(activeProfileId) }"
                  @click="switchProfile(dep.id); showHeaderMenu = false"
                >
                  <span>{{ dep.name.split(' ')[0] }}</span>
                  <i v-if="String(dep.id) === String(activeProfileId)" class="ph-bold ph-check"></i>
                </button>
              </div>

              <div class="dropdown-sep"></div>
              <button v-if="hasKidsAccess" class="dropdown-item text-danger" @click="handleLogout">
                <i class="ph ph-sign-out"></i> Sair
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
            <img src="/kids/banners/home-dashboard-banner-v3.png" alt="Viva Mais Club Kids" class="kids-hero-img home-dashboard-img" />
            
            <div class="hero-content-overlay">
              <h1 class="hero-main-title">Olá, <span class="highlight-name">{{ kidUser.name }}!</span></h1>
              <p class="hero-desc">Vamos criar algo incrível hoje?</p>
            </div>
          </div>

          <h2 class="section-title">✨ Escolha sua Aventura de Hoje</h2>
          <div class="hub-grid">
            
            <div class="hub-card card-games" @click="switchTab('games')">
              <div class="card-top-content">
                <div class="card-icon-box bg-purple">
                  <i class="ph-fill ph-game-controller"></i>
                </div>
                <div class="card-text-col">
                  <h3>Sala de Jogos</h3>
                  <p>Memoria, blocos coloridos e desafios rapidos feitos dentro do Viva Kids.</p>
                </div>
              </div>
              <button class="btn-card-action btn-game">
                <span>Jogar Agora</span>
                <i class="ph ph-arrow-right"></i>
              </button>
              <img src="/kids/illustrations/adventure-games-clean.png" alt="" class="card-illustration games-illustration" loading="lazy" />
            </div>

            <!-- Card 2: Livro de Pintura -->
            <div class="hub-card card-paint" @click="switchTab('paint')">
              <div class="card-top-content">
                <div class="card-icon-box bg-yellow">
                  <i class="ph-fill ph-paint-brush"></i>
                </div>
                <div class="card-text-col">
                  <h3>Livro de Pintura</h3>
                  <p>Pinte os personagens da turminha Viva Mais com o balde de tinta mágica!</p>
                </div>
              </div>
              <button class="btn-card-action btn-outline-yellow">
                <span>Colorir Agora</span>
                <i class="ph ph-arrow-right"></i>
              </button>
              <img src="/kids/illustrations/adventure-paint-clean.png" alt="" class="card-illustration paint-illustration" loading="lazy" />
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
              <img src="/kids/illustrations/adventure-draw-clean.png" alt="" class="card-illustration draw-illustration" loading="lazy" />
            </div>

          </div>
        </section>

        <!-- 2. SALA DE JOGOS (Viva Kids) -->
        <section v-else-if="activeTab === 'games'" class="kids-section-fade">
          <!-- Banner da Sala de Jogos -->
          <div class="games-hero-banner-container">
            <img src="/kids/banners/games-bg-light-gamer-wide-v1.png" alt="Sala de Jogos" class="games-hero-img" />
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
                  v-if="game.image"
                  :src="game.image"
                  :alt="game.title"
                  class="kid-game-thumb"
                  loading="lazy"
                />
                <div v-else class="kid-game-thumb local-game-thumb" :style="{ background: game.accent }">
                  <span>{{ game.thumb }}</span>
                </div>
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
          <!-- Banner do Livro de Pintura Mágica -->
          <div class="paint-hero-banner-container">
            <img src="/kids/banners/paint-bg-light-v3.png" alt="Livro de Pintura Mágica" class="paint-hero-img" />
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

          <div v-if="showPaintPicker" class="paint-template-picker-card">
            <div class="paint-picker-heading">
              <div>
                <span class="paint-picker-kicker">Escolha uma pintura</span>
                <h2>Qual desenho vamos colorir?</h2>
              </div>
              <div class="paint-picker-arrows">
                <button type="button" aria-label="Voltar pinturas" @click="changePaintPickerPage(-1)">
                  <i class="ph ph-arrow-left"></i>
                </button>
                <button type="button" aria-label="Avançar pinturas" @click="changePaintPickerPage(1)">
                  <i class="ph ph-arrow-right"></i>
                </button>
              </div>
            </div>

            <div class="paint-template-carousel">
              <button
                v-for="tmpl in visiblePaintTemplates"
                :key="tmpl.id"
                type="button"
                class="paint-template-big-card"
                :class="{ active: tmpl.id === activeColoringId }"
                @click="selectColoringTemplate(tmpl.id)"
              >
                <span class="paint-template-preview">
                  <img :src="tmpl.svgUrl" :alt="tmpl.title" />
                </span>
                <strong>{{ tmpl.title }}</strong>
                <small>{{ tmpl.category }}</small>
              </button>
            </div>
          </div>

          <!-- Workspace da Pintura -->
          <div v-else class="paint-workspace-card paint-workspace-active">

            <!-- Área Principal do Canvas -->
            <main class="paint-canvas-area">
              <div class="paint-active-template-bar">
                <div>
                  <span>Pintura escolhida</span>
                  <strong>{{ activeColoringTemplate.title }}</strong>
                </div>
              </div>

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
              <div class="canvas-zoom-controls">
                <button type="button" aria-label="Diminuir zoom" @click="changeCanvasZoom('paint', -0.15)">
                  <i class="ph ph-minus"></i>
                </button>
                <button type="button" class="zoom-value" @click="resetCanvasZoom('paint')">
                  {{ Math.round(paintZoom * 100) }}%
                </button>
                <button type="button" aria-label="Aumentar zoom" @click="changeCanvasZoom('paint', 0.15)">
                  <i class="ph ph-plus"></i>
                </button>
              </div>

              <div class="paint-dashed-wrapper">
                <canvas
                  ref="paintCanvasRef"
                  @click="handlePaintClick"
                  class="paint-studio-canvas"
                  :style="{ transform: `scale(${paintZoom})` }"
                ></canvas>
              </div>

              <!-- Ações do Canvas -->
              <div class="paint-actions-footer">
                <button type="button" class="btn-paint-ctrl" @click="openPaintPicker">
                  <i class="ph ph-images"></i>
                  <span>Trocar pintura</span>
                </button>
                <button type="button" class="btn-paint-ctrl" @click="resetPaintTemplate">
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
            <img src="/kids/banners/draw-bg-light-v2.png" alt="Lousa de Desenho Livre" class="lousa-hero-img" />
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
            <div class="canvas-zoom-controls lousa-zoom-controls">
              <button type="button" aria-label="Diminuir zoom" @click="changeCanvasZoom('draw', -0.15)">
                <i class="ph ph-minus"></i>
              </button>
              <button type="button" class="zoom-value" @click="resetCanvasZoom('draw')">
                {{ Math.round(freehandZoom * 100) }}%
              </button>
              <button type="button" aria-label="Aumentar zoom" @click="changeCanvasZoom('draw', 0.15)">
                <i class="ph ph-plus"></i>
              </button>
            </div>

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
                :style="{ transform: `scale(${freehandZoom})` }"
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
            <img src="/kids/banners/profile-bg-light-v2.png" alt="Perfil" class="profile-hero-img" />
            <div class="profile-hero-content">
              <div class="profile-user-inline">
                <div class="profile-big-avatar-circle">
                  <i class="ph-fill ph-star"></i>
                </div>
                <div class="profile-info-col">
                  <h1 class="profile-name-title">{{ kidUser.name }}</h1>
                  <p class="profile-subtitle-text">Assinante Viva Mais · Desbravador em Turma</p>
                </div>
              </div>

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

            <div class="ach-card card-unlocked">
              <div class="ach-icon-circle icon-game"><i class="ph-fill ph-game-controller"></i></div>
              <div class="ach-body">
                <h4>Campeao dos Jogos</h4>
                <p>Jogou desafios na Sala de Jogos</p>
              </div>
              <span class="ach-status-badge">Ativo ⭐</span>
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
              <span>Minha Galeria</span>
            </div>
          </div>

          <div v-if="galleryArtworks.length === 0" class="empty-gallery-dashed">
            <div class="empty-ico-circle">
              <i class="ph-fill ph-palette"></i>
            </div>
            <h3>Sua galeria ainda está vazia!</h3>
            <p>Vá até a <strong>Lousa de Desenho</strong> ou o <strong>Livro de Pintura</strong> para salvar sua primeira obra!</p>
            <div class="gallery-action-row">
              <button type="button" class="btn-create-artwork-pill" @click="switchTab('draw')">
                <i class="ph-bold ph-pencil-simple-line"></i>
                <span>Criar desenho</span>
              </button>
              <button type="button" class="btn-create-artwork-pill alt" @click="switchTab('paint')">
                <i class="ph-bold ph-paint-brush"></i>
                <span>Fazer pintura</span>
              </button>
            </div>
          </div>
          <div v-else class="artworks-grid-4col">
            <div class="gallery-summary-card">
              <div>
                <span>{{ galleryDrawingsCount }} desenhos</span>
                <strong>{{ galleryPaintingsCount }} pinturas</strong>
              </div>
              <div class="gallery-action-row compact">
                <button type="button" class="btn-create-artwork-pill" @click="switchTab('draw')">
                  <i class="ph-bold ph-pencil-simple-line"></i>
                  <span>Novo desenho</span>
                </button>
                <button type="button" class="btn-create-artwork-pill alt" @click="switchTab('paint')">
                  <i class="ph-bold ph-paint-brush"></i>
                  <span>Nova pintura</span>
                </button>
              </div>
            </div>
            <div
              v-for="art in galleryArtworks"
              :key="art.id"
              class="profile-art-card"
            >
              <div class="profile-art-thumb">
                <img :src="art.dataUrl || art.serverUrl" :alt="art.title" />
              </div>
              <div class="profile-art-info">
                <h4>{{ art.title }}</h4>
                <span class="art-date">{{ art.date }}</span>
                <span class="art-type-pill">{{ art.type === 'pintura' ? 'Pintura' : 'Desenho' }}</span>
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
          <i class="ph-fill ph-house bottom-ico"></i>
          <span>Início</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'games' }" @click="switchTab('games')">
          <i class="ph-fill ph-game-controller bottom-ico"></i>
          <span>Jogos</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'paint' }" @click="switchTab('paint')">
          <i class="ph-fill ph-paint-brush bottom-ico"></i>
          <span>Pintura</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'draw' }" @click="switchTab('draw')">
          <i class="ph-fill ph-palette bottom-ico"></i>
          <span>Lousa</span>
        </button>
        <button class="bottom-item" :class="{ active: activeTab === 'profile' }" @click="switchTab('profile')">
          <i class="ph-fill ph-trophy bottom-ico"></i>
          <span>Perfil</span>
        </button>
      </nav>

    </div>

    <!-- Modal de jogos do Viva Kids -->
    <div v-if="activeGame" class="game-modal-overlay">
      <div class="game-modal-box">
        <div class="game-modal-top">
          <div>
            <h2>{{ activeGame.thumb }} {{ activeGame.title }}</h2>
            <p>{{ activeGame.description }}</p>
          </div>
          <button class="btn-close-game" @click="closeGame" aria-label="Fechar jogo">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <div class="game-play-area">
          <div v-if="gameLoading" class="game-loading-overlay" aria-live="polite">
            <div class="kid-loader-box">
              <div class="kid-loader-ring"></div>
              <div class="kid-loader-star">⭐</div>
            </div>
            <strong class="game-loading-title">Carregando o jogo...</strong>
            <span class="game-loading-sub">Preparando uma super aventura para você!</span>
          </div>

          <div v-else-if="gameCountdown > 0" class="game-countdown-overlay" aria-live="polite">
            <span>Prepare-se</span>
            <strong>{{ gameCountdown }}</strong>
          </div>

          <div v-if="activeGame.type === 'memory'" class="memory-game-shell">
            <div class="game-score-row">
              <span>Jogadas: <strong>{{ memoryGame.moves }}</strong></span>
              <span>Pares: <strong>{{ memoryGame.matched.length / 2 }}/{{ memoryIcons.length }}</strong></span>
            </div>

            <div class="memory-grid">
              <button
                v-for="(card, index) in memoryGame.cards"
                :key="card.id"
                type="button"
                class="memory-card"
                :class="{ flipped: memoryGame.flipped.includes(index) || memoryGame.matched.includes(index) }"
                @click="flipMemoryCard(index)"
              >
                <span>{{ memoryGame.flipped.includes(index) || memoryGame.matched.includes(index) ? card.icon : '?' }}</span>
              </button>
            </div>

            <button class="btn-auth-action btn-game-reset" type="button" @click="restartActiveGame">
              <span>Recomecar</span>
              <i class="ph ph-arrow-counter-clockwise"></i>
            </button>
          </div>

          <div v-else-if="activeGame.type === 'blocks'" class="blocks-game-shell">
            <div class="game-score-row">
              <span>Pontos: <strong>{{ blocksGame.score }}</strong></span>
              <span>Linhas: <strong>{{ blocksGame.lines }}</strong></span>
            </div>

            <div class="blocks-board">
              <div v-for="row in blockRows" :key="`row-${row}`" class="blocks-row">
                <span
                  v-for="col in blockCols"
                  :key="`cell-${row}-${col}`"
                  class="blocks-cell"
                  :class="{ filled: blockCellColor(row - 1, col - 1) }"
                  :style="{ backgroundColor: blockCellColor(row - 1, col - 1) || '' }"
                ></span>
              </div>

              <div v-if="blocksGame.gameOver" class="blocks-game-over">
                <strong>Fim de jogo!</strong>
                <button class="btn-auth-action" type="button" @click="restartActiveGame">Jogar de novo</button>
              </div>
            </div>

            <div class="blocks-controls">
              <button type="button" @click="moveBlock(-1)"><i class="ph ph-arrow-left"></i></button>
              <button type="button" @click="rotateBlock"><i class="ph ph-arrow-clockwise"></i></button>
              <button type="button" @click="moveBlock(1)"><i class="ph ph-arrow-right"></i></button>
              <button type="button" class="wide" @click="dropBlock"><i class="ph ph-arrow-fat-down"></i> Soltar</button>
            </div>
          </div>

          <div v-else-if="activeGame.type === 'flappy'" class="flappy-game-shell">
            <div class="game-score-row">
              <span>Pontos: <strong>{{ flappyGame.score }}</strong></span>
              <span>{{ flappyGame.gameOver ? 'Fim de jogo' : 'Toque para voar' }}</span>
            </div>

            <div class="flappy-stage" @click="flapBird">
              <div
                v-for="(pipe, index) in flappyGame.pipes"
                :key="`pipe-${index}`"
                class="flappy-pipe"
                :style="{ left: `${pipe.x}%` }"
              >
                <span class="pipe-top" :style="{ height: `${Math.max(8, pipe.gap - 16)}%` }"></span>
                <span class="pipe-bottom" :style="{ height: `${Math.max(8, 100 - pipe.gap - 16)}%` }"></span>
              </div>
              <span class="flappy-bird" :style="{ top: `${flappyGame.birdY}%` }">🐤</span>
              <div v-if="flappyGame.gameOver" class="game-overlay-message">
                <strong>Fim de jogo!</strong>
                <button class="btn-auth-action" type="button" @click.stop="restartActiveGame">Jogar de novo</button>
              </div>
            </div>
          </div>

          <div v-else-if="activeGame.type === 'snake'" class="snake-game-shell">
            <div class="game-score-row">
              <span>Frutas: <strong>{{ snakeGame.score }}</strong></span>
              <span>{{ snakeGame.gameOver ? 'Fim de jogo' : 'Use as setas' }}</span>
            </div>

            <div class="snake-board">
              <span
                v-for="cell in snakeSize * snakeSize"
                :key="`snake-cell-${cell}`"
                class="snake-cell"
                :class="snakeCellAt((cell - 1) % snakeSize, Math.floor((cell - 1) / snakeSize))"
              ></span>
              <div v-if="snakeGame.gameOver" class="game-overlay-message">
                <strong>Fim de jogo!</strong>
                <button class="btn-auth-action" type="button" @click="restartActiveGame">Jogar de novo</button>
              </div>
            </div>

            <div class="snake-controls">
              <button type="button" class="up" aria-label="Cima" @click="setSnakeDirection('up')"><i class="ph ph-arrow-up"></i></button>
              <button type="button" class="left" aria-label="Esquerda" @click="setSnakeDirection('left')"><i class="ph ph-arrow-left"></i></button>
              <button type="button" class="down" aria-label="Baixo" @click="setSnakeDirection('down')"><i class="ph ph-arrow-down"></i></button>
              <button type="button" class="right" aria-label="Direita" @click="setSnakeDirection('right')"><i class="ph ph-arrow-right"></i></button>
            </div>
          </div>

          <div v-else-if="activeGame.type === 'dino'" class="dino-game-shell">
            <div class="game-score-row">
              <span>Distancia: <strong>{{ dinoGame.score }}</strong></span>
              <span>{{ dinoGame.gameOver ? 'Fim de jogo' : 'Toque para pular' }}</span>
            </div>

            <div class="dino-stage" @click="jumpDino">
              <span class="dino-ground"></span>
              <span class="dino-player" :style="{ bottom: `${20 + dinoGame.y}%` }">🦕</span>
              <span class="dino-obstacle" :style="{ left: `${dinoGame.obstacleX}%` }">🌵</span>
              <div v-if="dinoGame.gameOver" class="game-overlay-message">
                <strong>Fim de jogo!</strong>
                <button class="btn-auth-action" type="button" @click.stop="restartActiveGame">Jogar de novo</button>
              </div>
            </div>
          </div>

          <div v-else-if="activeGame.type === 'target'" class="target-game-shell">
            <div class="game-score-row">
              <span>Estrelas: <strong>{{ targetGame.score }}</strong></span>
              <span>Tempo: <strong>{{ targetGame.timeLeft }}s</strong></span>
            </div>

            <div class="target-stage">
              <button
                v-if="targetGame.running"
                type="button"
                class="target-star"
                :style="{ left: `${targetGame.position.x}%`, top: `${targetGame.position.y}%` }"
                @click="hitTarget"
              >
                🌟
              </button>
              <div v-else class="target-finished">
                <strong>Tempo encerrado!</strong>
                <span>{{ targetGame.score }} estrela(s) encontradas</span>
                <button class="btn-auth-action" type="button" @click="restartActiveGame">Jogar de novo</button>
              </div>
            </div>
          </div>

          <div v-else-if="activeGame.type === 'tictactoe'" class="tictactoe-game-shell">
            <div class="game-score-row">
              <span>{{ ticTacToeGame.status }}</span>
            </div>

            <div class="tictactoe-board">
              <button
                v-for="(cell, index) in ticTacToeGame.cells"
                :key="`ttt-${index}`"
                type="button"
                class="tictactoe-cell"
                :class="{ player: cell === 'X', computer: cell === 'O' }"
                @click="playTicTacToe(index)"
              >
                {{ cell }}
              </button>
            </div>

            <button class="btn-auth-action btn-game-reset" type="button" @click="restartActiveGame">
              <span>Jogar de novo</span>
              <i class="ph ph-arrow-counter-clockwise"></i>
            </button>
          </div>

          <div v-else-if="activeGame.type === 'sequence'" class="sequence-game-shell">
            <div class="game-score-row">
              <span>Nivel: <strong>{{ sequenceGame.level }}</strong></span>
              <span>{{ sequenceGame.status }}</span>
            </div>

            <div class="sequence-pad">
              <button
                v-for="color in sequenceColors"
                :key="color.id"
                type="button"
                class="sequence-button"
                :class="{ active: sequenceGame.activeColor === color.id }"
                :style="{ backgroundColor: color.color }"
                @click="pressSequenceColor(color.id)"
              >
                <span>{{ color.label }}</span>
              </button>
            </div>

            <button class="btn-auth-action btn-game-reset" type="button" @click="restartActiveGame">
              <span>Iniciar de novo</span>
              <i class="ph ph-arrow-counter-clockwise"></i>
            </button>
          </div>

          <div v-else-if="activeGame.type === 'math'" class="math-game-shell">
            <div class="game-score-row">
              <span>Rodada: <strong>{{ mathGame.round }}/{{ mathGame.totalRounds }}</strong></span>
              <span>Pontos: <strong>{{ mathGame.score }}</strong></span>
            </div>

            <div class="math-card">
              <span class="math-status">{{ mathGame.done ? 'Fim do desafio!' : mathGame.status }}</span>
              <strong class="math-question">{{ mathGame.done ? `${mathGame.score} acerto(s)` : mathGame.question }}</strong>

              <div v-if="!mathGame.done" class="math-options">
                <button
                  v-for="option in mathGame.options"
                  :key="`math-${option}`"
                  type="button"
                  @click="answerMath(option)"
                >
                  {{ option }}
                </button>
              </div>

              <button v-else class="btn-auth-action btn-game-reset" type="button" @click="restartActiveGame">
                <span>Jogar de novo</span>
                <i class="ph ph-arrow-counter-clockwise"></i>
              </button>
            </div>
          </div>
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
  background: #ffffff;
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
  background-image: url('/kids/banners/auth-kids-integrated-landscape-v3.png');
  background-size: auto 100%;
  background-position: left bottom;
  background-repeat: no-repeat;
  background-color: #f2fbfb;
  overflow: hidden;
  isolation: isolate;
}

.kids-login-view::before {
  content: none;
  position: absolute;
  inset: 68px 0 0;
  pointer-events: none;
  z-index: 0;
  opacity: 0.52;
  background:
    radial-gradient(circle at 10% 17%, #ffcf32 0 13px, transparent 14px),
    radial-gradient(circle at 31% 23%, rgba(176, 136, 255, 0.45) 0 10px, transparent 11px),
    radial-gradient(circle at 52% 19%, #0bb8bf 0 8px, transparent 9px),
    radial-gradient(circle at 59% 17%, #ffb800 0 12px, transparent 13px),
    radial-gradient(circle at 72% 62%, rgba(6, 40, 84, 0.12) 0 11px, transparent 12px),
    radial-gradient(circle at 86% 28%, rgba(255, 255, 255, 0.72) 0 8px, transparent 9px);
  animation: kidsAmbientFloat 7s ease-in-out infinite alternate;
}

.kids-login-view::after {
  content: none;
  position: absolute;
  left: -5%;
  right: -5%;
  bottom: -12%;
  height: 38%;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse at 29% 48%, rgba(5, 36, 83, 0.08) 0%, rgba(5, 36, 83, 0) 38%),
    linear-gradient(7deg, rgba(146, 220, 163, 0.54) 0%, rgba(201, 238, 186, 0.72) 35%, rgba(242, 252, 232, 0.86) 58%, rgba(255, 255, 255, 0) 59%);
  filter: blur(0.1px);
}

@keyframes kidsAmbientFloat {
  from { transform: translate3d(0, 0, 0) rotate(0deg); }
  to { transform: translate3d(14px, -10px, 0) rotate(1.5deg); }
}

.kids-dashboard-view {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  flex: 1;
  background: #ffffff;
}

.kids-page-decor {
  position: absolute;
  inset: 72px 0 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}

.decor-shape {
  position: absolute;
  display: block;
  opacity: 0.52;
  will-change: transform;
  filter: drop-shadow(0 12px 18px rgba(5, 36, 83, 0.05));
  transition: left 900ms ease, top 900ms ease, opacity 900ms ease;
}

.decor-circle {
  border-radius: 999px;
  background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.86), rgba(255, 214, 74, 0.82) 52%, rgba(255, 184, 0, 0.5) 100%);
}

.decor-ring {
  border-radius: 999px;
  border: 7px solid rgba(0, 188, 196, 0.28);
  box-shadow: inset 0 0 0 8px rgba(255, 255, 255, 0.45);
}

.decor-star,
.decor-plus {
  font-weight: 900;
  line-height: 1;
  color: rgba(0, 188, 196, 0.42);
  text-shadow: 0 8px 20px rgba(0, 188, 196, 0.1);
}

.decor-circle-a {
  width: 82px;
  height: 82px;
  left: 3%;
  top: 19%;
  animation: kidsPageDriftA 13s ease-in-out infinite alternate;
}

.decor-circle-b {
  width: 44px;
  height: 44px;
  right: 6%;
  top: 39%;
  background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.9), rgba(19, 198, 200, 0.55) 62%, rgba(16, 185, 129, 0.36) 100%);
  animation: kidsPageDriftB 11s ease-in-out infinite alternate;
}

.decor-circle-c {
  width: 58px;
  height: 58px;
  left: 12%;
  bottom: 16%;
  opacity: 0.35;
  background: radial-gradient(circle at 32% 28%, rgba(255, 255, 255, 0.88), rgba(176, 136, 255, 0.48) 62%, rgba(124, 58, 237, 0.22) 100%);
  animation: kidsPageDriftC 15s ease-in-out infinite alternate;
}

.decor-ring-a {
  width: 74px;
  height: 74px;
  right: 18%;
  top: 16%;
  animation: kidsPageSpinFloat 18s ease-in-out infinite alternate;
}

.decor-ring-b {
  width: 46px;
  height: 46px;
  left: 22%;
  top: 52%;
  border-color: rgba(255, 184, 0, 0.22);
  animation: kidsPageDriftB 16s ease-in-out infinite alternate-reverse;
}

.decor-star-a {
  left: 7%;
  top: 47%;
  font-size: 48px;
  color: rgba(255, 184, 0, 0.36);
  animation: kidsPageTwinkle 8s ease-in-out infinite alternate;
}

.decor-star-b {
  right: 11%;
  bottom: 18%;
  font-size: 34px;
  color: rgba(255, 214, 74, 0.42);
  animation: kidsPageTwinkle 9s ease-in-out infinite alternate-reverse;
}

.decor-plus-a {
  right: 31%;
  top: 58%;
  font-size: 42px;
  animation: kidsPageSpinFloat 17s ease-in-out infinite alternate-reverse;
}

@keyframes kidsPageDriftA {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(28px, -22px, 0) scale(1.05); }
}

@keyframes kidsPageDriftB {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(-24px, 18px, 0) scale(0.96); }
}

@keyframes kidsPageDriftC {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(18px, 26px, 0) scale(1.08); }
}

@keyframes kidsPageSpinFloat {
  from { transform: translate3d(0, 0, 0) rotate(0deg); }
  to { transform: translate3d(-18px, -16px, 0) rotate(16deg); }
}

@keyframes kidsPageTwinkle {
  from { transform: translate3d(0, 0, 0) scale(0.94) rotate(-4deg); opacity: 0.25; }
  to { transform: translate3d(12px, -14px, 0) scale(1.08) rotate(8deg); opacity: 0.58; }
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
  padding: 40px clamp(32px, 4vw, 72px) 48px 40px;
  width: 100%;
  min-height: calc(100vh - 68px);
  box-sizing: border-box;
  position: relative;
  z-index: 5;
}

.kids-auth-mobile-visual {
  display: none;
}

.kids-auth-main-container::before {
  content: none;
  position: absolute;
  left: -6%;
  right: -4%;
  bottom: -8%;
  height: 38%;
  border-radius: 50% 50% 0 0;
  pointer-events: none;
  z-index: 0;
  background:
    radial-gradient(ellipse at 28% 38%, rgba(255, 255, 255, 0.74) 0%, rgba(255, 255, 255, 0) 48%),
    linear-gradient(8deg, rgba(132, 216, 159, 0.62) 0%, rgba(201, 240, 188, 0.78) 48%, rgba(242, 252, 232, 0.88) 72%, rgba(255, 255, 255, 0) 73%);
  filter: saturate(1.08);
}

.auth-ground-shadow {
  position: absolute;
  left: 4.2%;
  bottom: 34px;
  width: min(48vw, 780px);
  height: clamp(44px, 5.4vw, 78px);
  pointer-events: none;
  z-index: 1;
  opacity: 0.62;
  background: radial-gradient(ellipse at center, rgba(5, 36, 83, 0.24) 0%, rgba(5, 36, 83, 0.10) 45%, rgba(5, 36, 83, 0) 72%);
  filter: blur(8px);
  transform: rotate(-1deg);
}

.auth-banner-character {
  position: absolute;
  left: 2.8%;
  bottom: 4px;
  width: clamp(520px, 50vw, 820px);
  max-height: calc(100vh - 128px);
  object-fit: contain;
  object-position: bottom center;
  z-index: 2;
  pointer-events: none;
  filter: drop-shadow(0 18px 20px rgba(5, 36, 83, 0.18));
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

@media (min-width: 769px) and (max-width: 992px) {
  .kids-login-view {
    background-image: url('/kids/banners/auth-kids-mobile-integrated-v1.png');
    background-size: cover;
    background-position: center bottom;
    overflow: hidden;
  }
  .kids-auth-main-container {
    justify-content: center;
    align-items: flex-start;
    padding: 28px 20px 40px;
  }
  .auth-banner-character {
    display: none;
  }
  .kids-auth-main-container::before {
    content: none;
  }
  .auth-ground-shadow {
    display: none;
  }
  .kids-auth-topbar {
    padding: 16px 20px;
  }
}

@media (min-width: 769px) and (max-width: 1366px) {
  .kids-login-view {
    background-image: url('/kids/banners/auth-kids-tablet-no-children-v1.png');
    background-size: cover;
    background-position: center bottom;
  }

  .kids-auth-main-container {
    justify-content: center;
    align-items: center;
    padding: 36px clamp(32px, 5vw, 72px);
  }

  .kids-auth-form-col {
    max-width: min(560px, 72vw);
  }

  .kids-auth-card {
    padding: clamp(40px, 4vw, 52px) clamp(38px, 4vw, 54px);
    border-radius: 32px;
  }

  .kids-auth-card .card-title {
    font-size: clamp(1.9rem, 3vw, 2.35rem);
  }

  .kids-auth-card .card-desc {
    font-size: clamp(1rem, 1.5vw, 1.12rem);
  }

  .kids-auth-card .btn-auth-action {
    min-height: 54px;
    font-size: 1.05rem;
  }
}

@media (max-width: 768px) {
  .kids-login-view {
    height: 100vh;
    min-height: 100vh;
    background: #ffffff;
    overflow: hidden;
  }

  .kids-auth-topbar {
    display: none;
  }

  .kids-auth-main-container {
    height: 100vh;
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 50vh 50vh;
    gap: 0;
    padding: 0;
    width: 100vw;
    max-width: none;
    background: #ffffff;
    overflow: visible;
  }

  .kids-auth-mobile-visual {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 48vh;
    padding: 0;
    box-sizing: border-box;
    background:
      radial-gradient(circle at 22% 18%, rgba(255, 255, 255, 0.62) 0 42px, transparent 43px),
      radial-gradient(circle at 82% 22%, rgba(255, 255, 255, 0.5) 0 34px, transparent 35px),
      linear-gradient(180deg, #7fc3ff 0%, #bfeaff 62%, #eef7ff 100%);
    overflow: hidden;
  }

  .kids-auth-mobile-img {
    display: block;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    object-fit: cover;
    object-position: center top;
    transform: none;
  }

  .kids-auth-form-col {
    width: 100%;
    max-width: none;
    min-height: calc(42vh + 34px);
    margin: -34px 0 0;
    justify-self: stretch;
    border-radius: 32px 32px 0 0;
    background: #ffffff;
    box-shadow: 0 -14px 34px rgba(15, 23, 42, 0.10);
    padding: 22px 22px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    position: relative;
    z-index: 10;
  }

  .kids-auth-card {
    background: transparent;
    border: none;
    box-shadow: none;
    border-radius: 0;
    padding: 0;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
  }

  .kids-auth-card .card-title {
    font-size: 1.55rem;
    font-weight: 800;
    color: #052453;
    text-align: center;
    margin-bottom: 2px;
  }

  .kids-auth-card .card-desc {
    display: block !important;
    font-size: 0.88rem;
    color: #64748b;
    text-align: center;
    margin: 0 0 12px 0;
    line-height: 1.4;
  }

  .kids-security-box {
    display: none !important;
  }

  .kids-custom-form {
    margin-top: 6px;
    gap: 10px;
  }

  .kids-auth-card .form-group-custom label {
    font-size: 12px;
    font-weight: 600;
    color: #334155;
    margin-bottom: 6px;
  }

  .kids-auth-card .input-icon-wrap {
    min-height: 52px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid #cbd5e1;
  }

  .kids-auth-card .input-icon-wrap input {
    font-size: 14px;
  }

  .kids-auth-card .btn-auth-action {
    min-height: 52px;
    border-radius: 14px;
    justify-content: center;
    font-size: 15px;
    font-weight: 700;
  }

  .kids-auth-card .btn-auth-action i {
    display: none;
  }
}

@media (max-width: 768px) and (min-height: 820px) {
  .kids-auth-form-col {
    min-height: calc(50vh + 34px);
    padding: 28px 22px 32px;
    justify-content: center;
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

@media (min-width: 769px) and (max-width: 992px) {
  .kids-auth-main-container {
    gap: 32px;
    padding: 28px 20px 40px;
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

.kids-profile-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  background: white;
  border: 1px solid #e2e8f0;
  min-width: 42px;
  height: 36px;
  padding: 0 12px;
  border-radius: 999px;
  cursor: pointer;
  font-family: inherit;
  font-weight: 700;
  color: #052453;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.kids-profile-menu-btn i:first-child {
  color: #0284c7;
  font-size: 1.25rem;
}

.kids-profile-menu-btn i:last-child {
  font-size: 0.9rem;
  color: #64748b;
}

.kids-profile-menu-btn:hover {
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
  position: relative;
  z-index: 2;
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 48px 80px;
  flex: 1;
  box-sizing: border-box;
}

.kids-section-fade {
  position: relative;
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
  height: clamp(280px, 28vw, 405px);
  border-radius: 34px;
  overflow: hidden;
  box-shadow: 0 18px 38px rgba(5, 36, 83, 0.08);
  margin-bottom: 28px;
  display: block;
}

.kids-hero-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center center;
  border-radius: 34px;
}

.home-dashboard-img {
  object-position: right top;
}

.kids-hero-banner-container::before,
.games-hero-banner-container::before,
.paint-hero-banner-container::before,
.lousa-hero-banner-container::before,
.profile-hero-banner-container::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.72;
  background:
    radial-gradient(circle at 13% 19%, rgba(255, 216, 84, 0.78) 0 9px, transparent 10px),
    radial-gradient(circle at 92% 16%, rgba(255, 216, 84, 0.62) 0 8px, transparent 9px),
    radial-gradient(circle at 22% 69%, rgba(255, 255, 255, 0.92) 0 7px, transparent 8px),
    radial-gradient(circle at 86% 30%, rgba(255, 255, 255, 0.82) 0 6px, transparent 7px);
  animation: kidsBannerSparkles 5.8s ease-in-out infinite alternate;
}

.kids-hero-banner-container::after,
.games-hero-banner-container::after,
.paint-hero-banner-container::after,
.lousa-hero-banner-container::after,
.profile-hero-banner-container::after {
  content: '';
  position: absolute;
  right: 6%;
  bottom: 5%;
  width: min(34vw, 460px);
  height: clamp(22px, 4vw, 58px);
  border-radius: 999px;
  pointer-events: none;
  z-index: 2;
  background: radial-gradient(ellipse at center, rgba(5, 36, 83, 0.22) 0%, rgba(5, 36, 83, 0.10) 42%, rgba(5, 36, 83, 0) 74%);
  filter: blur(9px);
  transform: rotate(-2deg);
}

.paint-hero-banner-container::after,
.lousa-hero-banner-container::after {
  right: 9%;
  width: min(30vw, 390px);
}

.profile-hero-banner-container::after {
  right: 10%;
  bottom: 4%;
  width: min(31vw, 420px);
}

.kids-hero-banner-container::after {
  right: 7%;
  bottom: 4%;
  width: min(27vw, 360px);
}

@keyframes kidsBannerSparkles {
  from {
    transform: translate3d(0, 0, 0);
    opacity: 0.56;
  }
  to {
    transform: translate3d(10px, -8px, 0);
    opacity: 0.86;
  }
}

.banner-character {
  position: absolute;
  z-index: 3;
  bottom: 0;
  object-fit: contain;
  object-position: bottom center;
  pointer-events: none;
  filter: drop-shadow(0 12px 14px rgba(5, 36, 83, 0.18));
}

.home-banner-character {
  right: 7%;
  bottom: -14%;
  width: auto;
  max-width: 40%;
  height: 114%;
  filter: drop-shadow(0 18px 20px rgba(5, 36, 83, 0.18));
}

.home-turma-character {
  right: 3.5%;
  bottom: -4px;
  height: 96%;
  max-width: 55%;
  filter: drop-shadow(0 18px 22px rgba(5, 36, 83, 0.18));
}

.games-banner-character {
  right: 9%;
  bottom: -3%;
  width: auto;
  max-width: 34%;
  height: 94%;
  filter: drop-shadow(0 20px 24px rgba(5, 36, 83, 0.16));
}

.paint-banner-character {
  right: 7%;
  width: clamp(160px, 21vw, 325px);
  height: 104%;
}

.draw-banner-character {
  right: 8%;
  width: clamp(160px, 20vw, 310px);
  height: 104%;
}

.profile-banner-character {
  right: 7%;
  width: clamp(160px, 21vw, 320px);
  height: 104%;
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

.kids-hero-banner-container .hero-content-overlay {
  width: 48%;
  padding: 48px 0 48px 62px;
  background: transparent;
  border-radius: 0;
}

.kids-hero-banner-container .hero-main-title {
  color: #062854 !important;
  text-shadow: none;
}

.kids-hero-banner-container .hero-desc {
  color: #0c356b !important;
  text-shadow: none;
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
  font-size: clamp(2.55rem, 4.1vw, 4.35rem);
  font-weight: 900;
  line-height: 1.04;
  color: #ffffff !important;
  margin: 0 0 18px 0;
  letter-spacing: 0;
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
}

.hero-main-title .highlight-name {
  color: #0aaec0 !important;
  text-shadow: none;
}

.hero-desc {
  color: rgba(255, 255, 255, 0.95) !important;
  font-size: clamp(1.25rem, 2vw, 2rem);
  line-height: 1.34;
  font-weight: 800;
  max-width: 560px;
  margin: 0;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
}

.hero-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.btn-hero-action {
  padding: 12px 20px;
  border-radius: 50px;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 800;
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
  background: #0bb8bf;
  color: #ffffff;
  box-shadow: 0 10px 24px rgba(11, 184, 191, 0.28);
}

.btn-hero-action.btn-paint {
  background: #ffb800;
  color: #062854;
  box-shadow: 0 6px 18px rgba(255, 184, 0, 0.35);
}

.btn-hero-action.btn-draw {
  background: #ffffff;
  color: #062854;
  box-shadow: 0 8px 20px rgba(5, 36, 83, 0.1);
  border: 1.5px solid #ffffff;
}

.btn-hero-action:hover {
  transform: translateY(-2px) scale(1.02);
}

@media (max-width: 768px) {
.kids-hero-banner-container {
    height: 210px !important;
    min-height: 210px !important;
    max-height: 210px !important;
    border-radius: 24px !important;
    margin-bottom: 20px !important;
  }
  .kids-hero-img {
    border-radius: 24px !important;
  }
  .home-dashboard-img {
    object-position: right top;
  }
  .banner-character {
    bottom: 0;
    right: 2%;
    width: 37%;
    height: 100%;
  }
  .banner-character:not(.home-banner-character) {
    height: 104% !important;
  }
  .home-banner-character {
    right: -2%;
    bottom: -10%;
    width: auto;
    max-width: 52%;
    height: 104%;
  }
  .home-turma-character {
    right: -8%;
    bottom: -2px;
    max-width: 62%;
    height: 86%;
  }
  .hero-content-overlay {
    position: absolute !important;
    width: 56% !important;
    padding: 22px 22px !important;
    background: transparent !important;
  }
  .hero-main-title {
    font-size: 1.65rem !important;
    line-height: 1.06 !important;
    margin: 0 0 10px 0 !important;
  }
  .hero-desc {
    font-size: 1rem !important;
    line-height: 1.32 !important;
    margin: 0 !important;
    display: block !important;
  }
  .hero-actions {
    gap: 8px !important;
    margin-top: 14px !important;
  }
  .btn-hero-action {
    padding: 8px 12px !important;
    font-size: 0.72rem !important;
  }
  .btn-hero-action span {
    display: none !important;
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
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  width: 100%;
  max-width: none;
  margin: 0 auto;
  justify-content: center;
}

.hub-card {
  background: #ffffff;
  border-radius: 24px;
  min-height: 212px;
  padding: 28px 26px;
  cursor: pointer;
  border: 1px solid #f1f5f9;
  box-shadow: 0 18px 44px rgba(5, 36, 83, 0.13), 0 6px 16px rgba(5, 36, 83, 0.06);
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
  box-shadow: 0 24px 54px rgba(5, 36, 83, 0.18), 0 10px 22px rgba(5, 36, 83, 0.08);
}

.card-games {
  border-color: #fef8e7;
  background: linear-gradient(135deg, #f8f4ff 0%, #fffafd 100%);
}
.card-games:hover {
  border-color: #8b5cf6;
}

.card-paint {
  border-color: #fef8e7;
  background: linear-gradient(135deg, #f8f4ff 0%, #fffafd 100%);
}
.card-paint:hover {
  border-color: #f59e0b;
}

.card-draw {
  border-color: #fef8e7;
  background: linear-gradient(135deg, #f8f4ff 0%, #fffafd 100%);
}
.card-draw:hover {
  border-color: #8b5cf6;
}

.card-top-content {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  width: 100%;
  position: relative;
  z-index: 2;
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
  max-width: 98%;
}

.btn-card-action {
  width: fit-content;
  min-width: 46px;
  min-height: 46px;
  padding: 9px 18px;
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

.card-illustration {
  position: absolute;
  right: 0;
  bottom: -2px;
  width: min(40%, 210px);
  height: auto;
  object-fit: contain;
  pointer-events: none;
  z-index: 1;
  filter: drop-shadow(0 16px 16px rgba(5, 36, 83, 0.14));
}

.games-illustration {
  right: -10px;
  bottom: -12px;
  width: min(48%, 235px);
}

.paint-illustration {
  right: -8px;
  bottom: -10px;
  width: min(42%, 222px);
}

.draw-illustration {
  right: -8px;
  bottom: -8px;
  width: min(40%, 210px);
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
    padding: 16px 20px 128px;
  }
  .hub-grid {
    grid-template-columns: 1fr;
  }
  .hub-card {
    min-height: 170px;
  }
  .card-top-content {
    width: 100%;
  }
  .card-illustration {
    width: min(38%, 230px);
    right: 12px;
  }
}

@media (max-width: 992px) {
  .kids-hero-banner {
    grid-template-columns: 1fr;
    padding: 32px 24px;
    text-align: center;
  }
  .kids-hero-banner .hero-desc {
    margin: 0 auto 20px;
  }
  .kids-hero-banner .hero-actions {
    justify-content: center;
  }
}

@media (max-width: 520px) {
  .hub-card {
    min-height: 205px;
    padding: 22px 18px;
  }
  .card-top-content {
    width: 100%;
    padding-right: 0;
  }
  .card-icon-box {
    width: 48px;
    height: 48px;
    font-size: 24px;
    border-radius: 14px;
  }
  .card-text-col h3 {
    font-size: 1.08rem;
  }
  .card-text-col p {
    font-size: 0.78rem;
  }
  .card-illustration {
    width: 142px;
    right: -8px;
    bottom: 4px;
  }
  .games-illustration {
    bottom: -8px;
  }
}

/* --- SALA DE JOGOS (BANNER COM MENINO E GRID DE 4 COLUNAS) --- */
.games-hero-banner-container {
  position: relative;
  width: 100% !important;
  height: clamp(280px, 28vw, 405px);
  max-height: 405px;
  border-radius: 34px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 26px 62px rgba(5, 36, 83, 0.17), 0 10px 26px rgba(5, 36, 83, 0.08);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.games-hero-img {
  width: 100% !important;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center top;
  border-radius: 34px;
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
  align-items: flex-start;
  justify-content: center;
  gap: 7px;
}

.games-main-title {
  font-size: clamp(1.8rem, 2.8vw, 2.6rem);
  font-weight: 900;
  color: #062854;
  text-shadow: none;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.games-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #315272;
  text-shadow: none;
  margin: 0;
  line-height: 1.35;
  max-width: 480px;
}

.btn-games-hero {
  margin-top: 10px;
  border: none;
  border-radius: 999px;
  background: #0bb8bf;
  color: #ffffff;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 800;
  padding: 10px 18px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(11, 184, 191, 0.28);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn-games-hero:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(2, 42, 91, 0.22);
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
    width: 100% !important;
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
  .btn-games-hero {
    margin-top: 4px !important;
    padding: 7px 12px !important;
    font-size: 0.72rem !important;
  }
  .games-banner-character {
    right: 2% !important;
    bottom: -2% !important;
    width: auto !important;
    max-width: 34% !important;
    height: 90% !important;
  }
}

.kids-games-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
  margin-bottom: 36px;
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
  box-shadow: 0 18px 42px rgba(5, 36, 83, 0.12), 0 6px 16px rgba(5, 36, 83, 0.06);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
}

.kid-game-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 24px 54px rgba(5, 36, 83, 0.16), 0 10px 24px rgba(5, 36, 83, 0.08);
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

.local-game-thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
}

.local-game-thumb span {
  font-size: clamp(4rem, 10vw, 7rem);
  line-height: 1;
  filter: drop-shadow(0 10px 18px rgba(15, 23, 42, 0.18));
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
  background: #ffffff;
}

.paint-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(280px, 28vw, 405px);
  max-height: 405px;
  border-radius: 34px;
  overflow: hidden;
  box-shadow: 0 26px 62px rgba(5, 36, 83, 0.17), 0 10px 26px rgba(5, 36, 83, 0.08);
  margin-bottom: 32px;
  line-height: 0;
  display: flex;
  align-items: center;
  z-index: 1;
  box-sizing: border-box;
  background: #ffffff;
}

.paint-hero-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: right top;
  border-radius: 34px;
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
  color: #062854;
  text-shadow: none;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.paint-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0c356b;
  text-shadow: none;
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
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.paint-workspace-active {
  grid-template-columns: 1fr;
}

.paint-template-picker-card {
  background: #ffffff;
  border-radius: 26px;
  border: 1.5px solid #eef2f6;
  box-shadow: 0 20px 48px rgba(5, 36, 83, 0.12), 0 7px 18px rgba(5, 36, 83, 0.06);
  padding: 24px;
  position: relative;
  z-index: 2;
}

.paint-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-bottom: 20px;
}

.paint-picker-kicker {
  color: #00a99c;
  font-size: 0.82rem;
  font-weight: 900;
  text-transform: uppercase;
}

.paint-picker-heading h2 {
  color: #052453;
  font-size: clamp(1.35rem, 2vw, 2rem);
  margin: 4px 0 0;
  line-height: 1.1;
}

.paint-picker-arrows {
  display: inline-flex;
  gap: 10px;
  flex-shrink: 0;
}

.paint-picker-arrows button {
  width: 46px;
  height: 46px;
  border-radius: 999px;
  border: 0;
  background: #00bba6;
  color: #ffffff;
  display: grid;
  place-items: center;
  font-size: 1.2rem;
  cursor: pointer;
  box-shadow: 0 8px 18px rgba(0, 187, 166, 0.24);
}

.paint-template-carousel {
  display: grid;
  grid-template-columns: repeat(var(--paint-template-cols, 3), minmax(0, 1fr));
  gap: 18px;
}

.paint-template-big-card {
  border: 2px solid #e2e8f0;
  background: #f8fafc;
  box-shadow: 0 14px 32px rgba(5, 36, 83, 0.08);
  border-radius: 24px;
  padding: 16px;
  min-height: 280px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.paint-template-big-card:hover,
.paint-template-big-card.active {
  transform: translateY(-3px);
  border-color: #00bba6;
  box-shadow: 0 20px 42px rgba(5, 36, 83, 0.14);
}

.paint-template-preview {
  flex: 1;
  min-height: 190px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  display: grid;
  place-items: center;
  padding: 12px;
  overflow: hidden;
}

.paint-template-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.paint-template-big-card strong {
  color: #052453;
  font-size: 1.02rem;
  font-weight: 900;
}

.paint-template-big-card small {
  color: #64748b;
  font-weight: 700;
}

.paint-active-template-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 18px;
  padding: 12px 16px;
}

.paint-active-template-bar span {
  display: block;
  color: #64748b;
  font-size: 0.76rem;
  font-weight: 800;
}

.paint-active-template-bar strong {
  color: #052453;
  font-size: 1rem;
  font-weight: 900;
}

@media (max-width: 900px) {
  .paint-workspace-card {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .paint-template-carousel {
    grid-template-columns: 1fr;
  }

  .paint-template-big-card {
    min-height: 240px;
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
  min-width: 0;
  max-width: 100%;
}

.canvas-zoom-controls {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  align-self: flex-end;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 999px;
  padding: 5px;
  box-shadow: 0 14px 30px rgba(5, 36, 83, 0.1);
}

.canvas-zoom-controls button {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 999px;
  background: #e6fbf9;
  color: #008f8c;
  display: grid;
  place-items: center;
  font-family: inherit;
  font-weight: 900;
  cursor: pointer;
}

.canvas-zoom-controls .zoom-value {
  width: auto;
  min-width: 58px;
  padding: 0 10px;
  background: #00bba6;
  color: #ffffff;
}


.paint-palette-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  padding: 10px 18px;
  border-radius: 50px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
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
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.swatch-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
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
  overflow: auto;
  padding: 22px;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.paint-studio-canvas {
  background: #ffffff;
  cursor: crosshair;
  max-width: none;
  height: auto;
  display: block;
  flex: 0 0 auto;
  transform-origin: top center;
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
  background: #ffffff;
}

.lousa-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(280px, 28vw, 405px);
  max-height: 405px;
  border-radius: 34px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 26px 62px rgba(5, 36, 83, 0.17), 0 10px 26px rgba(5, 36, 83, 0.08);
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
  object-position: center top;
  border-radius: 34px;
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
  color: #062854;
  text-shadow: none;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.lousa-subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: #0c356b;
  text-shadow: none;
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
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.lousa-swatch-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  flex-shrink: 0;
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
  overflow: auto;
  padding: 10px;
}

.lousa-studio-canvas {
  background: #ffffff;
  cursor: crosshair;
  max-width: none;
  height: auto;
  display: block;
  flex: 0 0 auto;
  transform-origin: top center;
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

/* No celular, a criação vem antes das ferramentas. */
@media (max-width: 768px) {
  .paint-template-picker-card {
    padding: 16px;
    --paint-template-cols: 1;
  }

  .paint-picker-heading {
    align-items: flex-start;
  }

  .paint-picker-arrows button {
    width: 42px;
    height: 42px;
  }

  .paint-template-preview {
    min-height: 180px;
  }

  .paint-workspace-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 12px;
  }

  .paint-templates-sidebar {
    order: 1;
  }

  .templates-header {
    display: none;
  }

  .templates-list-scroll {
    flex-direction: row;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 8px;
  }

  .tmpl-card-btn {
    flex: 0 0 74px;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    padding: 7px;
    text-align: center;
  }

  .tmpl-thumb-img {
    width: 38px;
    height: 38px;
  }

  .tmpl-thumb-title {
    font-size: 0.68rem;
    line-height: 1.1;
  }

  .paint-canvas-area {
    order: 2;
  }

  .paint-active-template-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .paint-dashed-wrapper {
    order: 1;
    min-height: 360px;
    padding: 12px;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .paint-palette-bar {
    order: 2;
    border-radius: 18px;
    align-items: flex-start;
    justify-content: flex-start;
    flex-direction: column;
    padding: 14px;
    width: 100%;
  }

  .paint-actions-footer {
    order: 4;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .canvas-zoom-controls {
    order: 3;
    align-self: stretch;
    justify-content: center;
  }

  .btn-paint-ctrl,
  .btn-paint-save-award {
    width: 100%;
    min-height: 48px;
    justify-content: center;
    border-radius: 16px;
    white-space: normal;
    text-align: center;
  }

  .lousa-canvas-dashed-frame {
    order: 1;
    min-height: 360px;
    padding: 12px;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .lousa-zoom-controls {
    order: 2;
    align-self: stretch;
    justify-content: center;
  }

  .lousa-top-toolbar {
    order: 3;
  }

  .lousa-stamps-picker-bar {
    order: 4;
  }

  .lousa-colors-bar {
    order: 5;
    border-radius: 18px;
  }

  .lousa-bottom-bar {
    order: 6;
  }
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
  background: #ffffff;
}

.profile-hero-banner-container {
  position: relative;
  width: 100%;
  height: clamp(280px, 28vw, 405px);
  max-height: 405px;
  border-radius: 34px;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 26px 62px rgba(5, 36, 83, 0.17), 0 10px 26px rgba(5, 36, 83, 0.08);
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
  object-position: center top;
  display: block;
  border-radius: 34px;
}

.profile-hero-content {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 54%;
  padding: 24px 36px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 18px;
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
  color: #062854;
  text-shadow: none;
  margin: 0;
  line-height: 1.1;
  letter-spacing: -0.5px;
}

.profile-subtitle-text {
  margin: 4px 0 0;
  color: #35506f;
  font-size: 0.94rem;
  font-weight: 700;
  line-height: 1.25;
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
  box-shadow: 0 10px 24px rgba(5, 36, 83, 0.08);
}

.profile-stat-badge i.ph-game-controller {
  color: #0284c7;
}

.profile-stat-badge i.ph-trophy {
  color: #f59e0b;
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
    width: 62% !important;
    padding: 12px 16px !important;
    background: transparent !important;
    justify-content: flex-start !important;
    align-items: flex-start !important;
    gap: 8px !important;
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
  .profile-subtitle-text {
    font-size: 0.78rem !important;
    margin-top: 2px !important;
  }
  .profile-stats-line {
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
  padding: 28px 16px 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(5, 36, 83, 0.03);
  position: relative;
}

.ach-body {
  min-width: 0;
  padding-right: 4px;
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

.icon-game {
  background: #ede9fe;
  color: #7c3aed;
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
  line-height: 1.15;
}

.ach-body p {
  font-size: 0.76rem;
  color: #64748b;
  margin: 0;
  line-height: 1.3;
}

.ach-status-badge {
  position: absolute;
  top: 8px;
  right: 16px;
  font-size: 0.68rem;
  font-weight: 800;
  color: #d97706;
  line-height: 1;
  white-space: nowrap;
}

.ach-progress-pill {
  position: absolute;
  top: 8px;
  right: 16px;
  font-size: 0.75rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #64748b;
  padding: 2px 8px;
  border-radius: 50px;
  line-height: 1.1;
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

.btn-create-artwork-pill.alt {
  background: #7c3aed;
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.24);
}

.btn-create-artwork-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 187, 166, 0.4);
}

.gallery-action-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.gallery-action-row.compact .btn-create-artwork-pill {
  margin-top: 0;
  padding: 9px 16px;
  font-size: 0.82rem;
}

.gallery-summary-card {
  grid-column: 1 / -1;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 22px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.gallery-summary-card span,
.gallery-summary-card strong {
  display: inline-flex;
  align-items: center;
  color: #052453;
  font-weight: 900;
  margin-right: 12px;
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
  box-shadow: 0 18px 42px rgba(5, 36, 83, 0.12), 0 6px 16px rgba(5, 36, 83, 0.06);
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
  margin-bottom: 6px;
}

.art-type-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  background: #e6fbf9;
  color: #008f8c;
  font-size: 0.72rem;
  font-weight: 900;
  padding: 3px 9px;
  margin-bottom: 9px;
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

.bottom-item:focus {
  outline: none;
}

.bottom-item:focus-visible {
  outline: 2px solid rgba(0, 185, 181, 0.45);
  outline-offset: 3px;
  border-radius: 12px;
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
  max-width: 900px;
  max-height: 90vh;
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
  color: #ffffff !important;
  margin: 0;
}

.game-modal-top p {
  margin-top: 4px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 0.86rem;
}

.game-play-area {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: clamp(12px, 2vw, 20px);
  background: #f8fafc;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
}

.game-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  color: #052453;
  text-align: center;
  padding: 20px;
}

.game-loading-spinner {
  position: relative;
  width: 90px;
  height: 90px;
  display: grid;
  place-items: center;
}

.spinner-orbit {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 5px solid #e0f2fe;
  border-top-color: #00b9b5;
  border-right-color: #f59e0b;
  animation: gameSpin 1s linear infinite;
}

.spinner-stars {
  font-size: 2.2rem;
  animation: starPulse 1.2s ease-in-out infinite alternate;
}

@keyframes gameSpin {
  to { transform: rotate(360deg); }
}

@keyframes starPulse {
  from { transform: scale(0.85); }
  to { transform: scale(1.18) rotate(15deg); }
}

.game-loading-title {
  font-size: 1.35rem;
  font-weight: 900;
  color: #052453;
}

.game-loading-sub {
  font-size: 0.9rem;
  color: #64748b;
  font-weight: 600;
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

.game-countdown-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: rgba(248, 250, 252, 0.82);
  backdrop-filter: blur(4px);
  color: #052453;
  text-align: center;
}

.game-countdown-overlay span {
  font-size: 1.05rem;
  font-weight: 800;
}

.game-countdown-overlay strong {
  width: 96px;
  height: 96px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  background: #00b9a5;
  color: #ffffff;
  font-size: 3.6rem;
  line-height: 1;
  box-shadow: 0 18px 34px rgba(0, 185, 165, 0.24);
}

.game-score-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.game-score-row span {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 0.9rem;
  color: #334155;
  font-weight: 700;
}

.game-score-row strong {
  color: #052453;
}

.memory-game-shell,
.blocks-game-shell,
.target-game-shell,
.flappy-game-shell,
.snake-game-shell,
.dino-game-shell,
.tictactoe-game-shell,
.sequence-game-shell,
.math-game-shell {
  max-width: 560px;
  margin: 0 auto;
}

.memory-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(58px, 1fr));
  gap: 10px;
}

.memory-card {
  aspect-ratio: 1;
  border: 2px solid #c7d2fe;
  border-radius: 18px;
  background: linear-gradient(145deg, #4f46e5, #8b5cf6);
  color: #ffffff;
  font-size: clamp(1.5rem, 7vw, 2.8rem);
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 20px rgba(79, 70, 229, 0.18);
  transition: transform 0.16s ease, background 0.16s ease;
}

.memory-card.flipped {
  background: #ffffff;
  color: #052453;
  transform: translateY(-2px);
}

.btn-game-reset {
  width: min(260px, 100%);
  margin: 18px auto 0;
}

.blocks-board {
  position: relative;
  width: min(320px, 86vw);
  margin: 0 auto;
  padding: 10px;
  border-radius: 20px;
  background: #052453;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08), 0 18px 38px rgba(5, 36, 83, 0.22);
}

.blocks-row {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
}

.blocks-row + .blocks-row {
  margin-top: 4px;
}

.blocks-cell {
  aspect-ratio: 1;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.blocks-cell.filled {
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12);
}

.blocks-game-over,
.game-overlay-message,
.target-finished {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(5, 36, 83, 0.86);
  color: #ffffff;
  text-align: center;
  padding: 18px;
}

.blocks-game-over {
  border-radius: 20px;
}

.blocks-controls {
  width: min(360px, 92vw);
  margin: 16px auto 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.blocks-controls button {
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  background: #00b9b5;
  color: white;
  font-size: 1.15rem;
  font-weight: 800;
  cursor: pointer;
}

.blocks-controls button.wide {
  grid-column: 1 / -1;
}

.target-stage {
  position: relative;
  height: min(430px, 58vh);
  min-height: 320px;
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.9)), #eef2ff;
  border: 2px solid #dbeafe;
  overflow: hidden;
}

.target-star {
  position: absolute;
  transform: translate(-50%, -50%);
  width: 74px;
  height: 74px;
  border: 0;
  border-radius: 50%;
  background: #ffffff;
  font-size: 2.35rem;
  cursor: pointer;
  box-shadow: 0 14px 28px rgba(255, 184, 0, 0.28);
  animation: starPulse 0.82s ease-in-out infinite alternate;
}

@keyframes starPulse {
  from { transform: translate(-50%, -50%) scale(0.94); }
  to { transform: translate(-50%, -50%) scale(1.08); }
}

.target-finished {
  background: rgba(255, 255, 255, 0.88);
  color: #052453;
}

.flappy-stage,
.dino-stage {
  position: relative;
  height: min(430px, 58vh);
  min-height: 320px;
  border-radius: 24px;
  overflow: hidden;
  border: 2px solid #bae6fd;
  cursor: pointer;
  user-select: none;
  background:
    linear-gradient(180deg, #7dd3fc 0%, #e0f2fe 72%, #bbf7d0 72%, #86efac 100%);
}

.flappy-bird {
  position: absolute;
  left: 18%;
  transform: translate(-50%, -50%);
  font-size: 2.7rem;
  z-index: 3;
  filter: drop-shadow(0 8px 10px rgba(5, 36, 83, 0.18));
}

.flappy-pipe {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 14%;
}

.pipe-top,
.pipe-bottom {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: 0 0 16px 16px;
  background: linear-gradient(180deg, #10b981, #059669);
  box-shadow: inset 0 0 0 3px rgba(255, 255, 255, 0.22);
}

.pipe-top {
  top: 0;
}

.pipe-bottom {
  bottom: 0;
  border-radius: 16px 16px 0 0;
}

.snake-board {
  position: relative;
  width: min(340px, 58vh, 88vw);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 4px;
  padding: 10px;
  border-radius: 24px;
  background: #dcfce7;
  border: 2px solid #86efac;
  box-shadow: 0 18px 34px rgba(16, 185, 129, 0.12);
}

.snake-cell {
  aspect-ratio: 1;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.72);
}

.snake-cell.snake {
  background: #10b981;
  box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.12);
}

.snake-cell.food {
  background: #ff5a79;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(255, 90, 121, 0.18);
}

.snake-controls {
  width: min(224px, 72vw);
  margin: 18px auto 0;
  display: none;
  grid-template-columns: repeat(3, 64px);
  grid-template-rows: repeat(2, 58px);
  justify-content: center;
  gap: 10px;
}

.snake-controls button {
  width: 64px;
  height: 58px;
  border: 0;
  border-radius: 18px;
  background: #10b981;
  color: #ffffff;
  font-size: 1.3rem;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(16, 185, 129, 0.22);
  transition: transform 0.15s ease, background 0.15s ease;
}

.snake-controls button:hover {
  background: #059669;
  transform: translateY(-1px);
}

.snake-controls .up {
  grid-column: 2;
  grid-row: 1;
}

.snake-controls .left {
  grid-column: 1;
  grid-row: 2;
}

.snake-controls .down {
  grid-column: 2;
  grid-row: 2;
}

.snake-controls .right {
  grid-column: 3;
  grid-row: 2;
}

@media (max-width: 768px) {
  .game-play-area {
    overflow: auto;
  }

  .snake-board {
    width: min(420px, 88vw);
    padding: 12px;
  }

  .snake-controls {
    display: grid;
  }
}

.dino-stage {
  background:
    linear-gradient(180deg, #bfdbfe 0%, #fef3c7 72%, #fde68a 72%, #f59e0b 100%);
}

.dino-ground {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 18%;
  height: 4px;
  background: rgba(120, 53, 15, 0.35);
}

.dino-player {
  position: absolute;
  left: 20%;
  font-size: 3rem;
  z-index: 3;
  filter: drop-shadow(0 8px 10px rgba(5, 36, 83, 0.16));
}

.dino-obstacle {
  position: absolute;
  bottom: 20%;
  font-size: 2.5rem;
  transform: translateX(-50%);
}

.game-overlay-message {
  z-index: 5;
  background: rgba(5, 36, 83, 0.82);
}

.tictactoe-board {
  width: min(360px, 88vw);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.tictactoe-cell {
  aspect-ratio: 1;
  border: 2px solid #bae6fd;
  border-radius: 20px;
  background: #ffffff;
  color: #052453;
  font-family: inherit;
  font-size: clamp(2.2rem, 12vw, 4rem);
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(14, 165, 233, 0.12);
}

.tictactoe-cell.player {
  color: #00b9b5;
  background: #ecfeff;
}

.tictactoe-cell.computer {
  color: #8b5cf6;
  background: #f5f3ff;
}

.sequence-pad {
  width: min(420px, 88vw);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.sequence-button {
  min-height: 132px;
  border: 0;
  border-radius: 24px;
  color: #ffffff;
  font-family: inherit;
  font-size: 1rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: inset 0 -10px 0 rgba(0, 0, 0, 0.12), 0 14px 28px rgba(15, 23, 42, 0.13);
  opacity: 0.72;
  transform: scale(0.98);
  transition: transform 0.12s ease, opacity 0.12s ease, filter 0.12s ease;
}

.sequence-button.active {
  opacity: 1;
  transform: scale(1.04);
  filter: brightness(1.12);
}

.math-card {
  width: min(460px, 90vw);
  margin: 0 auto;
  background: #ffffff;
  border: 2px solid #dcfce7;
  border-radius: 26px;
  padding: clamp(20px, 5vw, 34px);
  text-align: center;
  box-shadow: 0 16px 34px rgba(16, 185, 129, 0.12);
}

.math-status {
  display: inline-flex;
  margin-bottom: 10px;
  color: #64748b;
  font-size: 0.95rem;
  font-weight: 800;
}

.math-question {
  display: block;
  color: #052453;
  font-size: clamp(2.8rem, 12vw, 5rem);
  line-height: 1;
  margin-bottom: 22px;
}

.math-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.math-options button {
  min-height: 64px;
  border: 0;
  border-radius: 18px;
  background: #10b981;
  color: #ffffff;
  font-family: inherit;
  font-size: 1.6rem;
  font-weight: 900;
  cursor: pointer;
  box-shadow: inset 0 -6px 0 rgba(0, 0, 0, 0.12);
}

@media (max-width: 640px) {
  .game-modal-overlay {
    padding: 10px;
  }

  .game-modal-box {
    border-radius: 20px;
    max-height: 92vh;
  }

  .game-modal-top {
    align-items: flex-start;
    gap: 10px;
  }

  .memory-grid {
    gap: 8px;
  }

  .target-star {
    width: 64px;
    height: 64px;
    font-size: 2rem;
  }

  .sequence-button {
    min-height: 104px;
  }

  .math-options {
    grid-template-columns: 1fr;
  }
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

@media (min-width: 769px) and (max-width: 1100px) {
  .kids-top-header {
    padding: 12px 28px;
  }

  .kids-main-body {
    max-width: 100%;
    padding: 24px 28px 96px;
    background: #ffffff;
  }

  .kids-hero-banner-container,
  .games-hero-banner-container,
  .paint-hero-banner-container,
  .lousa-hero-banner-container,
  .profile-hero-banner-container {
    height: clamp(220px, 31vw, 330px);
    border-radius: 28px;
    margin-bottom: 24px;
  }

  .kids-hero-img,
  .games-hero-img,
  .paint-hero-img,
  .lousa-hero-img,
  .profile-hero-img {
    border-radius: 28px;
  }

  .kids-hero-banner-container .hero-content-overlay,
  .games-hero-content,
  .paint-hero-content,
  .lousa-hero-content,
  .profile-hero-content {
    width: 56%;
    padding: 24px 28px;
  }

  .hero-main-title,
  .games-main-title,
  .paint-main-title,
  .lousa-main-title,
  .profile-name-title {
    font-size: clamp(1.6rem, 3vw, 2.7rem);
  }

  .hero-desc,
  .games-subtitle,
  .paint-subtitle,
  .lousa-subtitle {
    font-size: clamp(0.92rem, 1.7vw, 1.2rem);
  }

  .hub-grid {
    gap: 18px;
  }

  .hub-card {
    min-height: 190px;
    padding: 22px 20px;
    border-radius: 22px;
  }

  .card-top-content {
    width: 100%;
    gap: 12px;
  }

  .card-illustration {
    width: min(34%, 190px);
    right: 8px;
  }

  .kids-games-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
  }

  .paint-template-picker-card,
  .paint-workspace-card {
    padding: 18px;
  }

  .paint-template-carousel {
    --paint-template-cols: 2;
  }

  .paint-template-big-card {
    min-height: 240px;
  }

  .paint-dashed-wrapper,
  .lousa-canvas-dashed-frame {
    min-height: min(430px, 54vh);
  }

  .paint-palette-bar,
  .lousa-colors-bar {
    border-radius: 22px;
    align-items: flex-start;
    justify-content: flex-start;
  }

  .game-modal-box {
    max-width: min(760px, calc(100vw - 28px));
    max-height: calc(100vh - 28px);
  }

  .game-modal-top {
    padding: 12px 16px;
  }

  .game-play-area {
    padding: 14px;
  }
}

@media (min-width: 769px) and (max-width: 1366px) {
  .kids-app-container,
  .kids-dashboard-view {
    overflow-x: hidden;
  }

  .kids-top-header {
    padding: 12px clamp(20px, 3vw, 36px);
    gap: 14px;
  }

  .kids-logo-img {
    height: clamp(30px, 3vw, 36px);
  }

  .nav-tab-btn {
    padding: 8px 12px;
    font-size: 0.84rem;
  }

  .kids-profile-menu-btn span {
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kids-main-body {
    max-width: none;
    padding: clamp(20px, 3vw, 34px) clamp(20px, 3vw, 36px) 92px;
  }

  .kids-hero-banner-container,
  .games-hero-banner-container,
  .paint-hero-banner-container,
  .lousa-hero-banner-container,
  .profile-hero-banner-container {
    height: clamp(230px, 27vw, 360px);
    border-radius: 28px;
    margin-bottom: 24px;
  }

  .kids-hero-img,
  .games-hero-img,
  .paint-hero-img,
  .lousa-hero-img,
  .profile-hero-img {
    border-radius: 28px;
  }

  .kids-hero-banner-container .hero-content-overlay,
  .games-hero-content,
  .paint-hero-content,
  .lousa-hero-content,
  .profile-hero-content {
    width: min(62%, 640px);
    padding: clamp(20px, 3vw, 34px);
  }

  .hero-main-title,
  .games-main-title,
  .paint-main-title,
  .lousa-main-title,
  .profile-name-title {
    font-size: clamp(1.55rem, 3.1vw, 2.7rem);
    letter-spacing: 0;
  }

  .hero-desc,
  .games-subtitle,
  .paint-subtitle,
  .lousa-subtitle,
  .profile-subtitle-text {
    font-size: clamp(0.88rem, 1.45vw, 1.08rem);
    max-width: 42ch;
  }

  .hub-grid {
    gap: 18px;
  }

  .hub-card {
    min-width: 0;
    padding: 22px 20px;
  }

  .card-top-content {
    width: 100%;
  }

  .kids-games-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr));
  }

  .paint-template-picker-card,
  .paint-workspace-card,
  .lousa-workspace-card {
    max-width: 100%;
    overflow: hidden;
  }

  .paint-active-template-bar {
    min-width: 0;
  }

  .paint-palette-bar {
    border-radius: 22px;
    padding: 14px 16px;
  }

  .palette-swatches-row {
    flex-basis: 100%;
    width: 100%;
  }

  .custom-color-picker-label {
    max-width: 100%;
    white-space: normal;
  }

  .canvas-zoom-controls {
    align-self: center;
    max-width: 100%;
  }

  .paint-dashed-wrapper,
  .lousa-canvas-dashed-frame {
    min-height: min(430px, 54vh);
    padding: 14px;
  }

  .paint-studio-canvas,
  .lousa-studio-canvas {
    max-width: 100%;
  }
}

@media (min-width: 769px) and (max-width: 900px) {
  .hub-grid,
  .kids-games-grid {
    grid-template-columns: 1fr;
  }

  .hub-card {
    min-height: 180px;
  }

  .card-top-content {
    width: 100%;
  }
}

@media (min-width: 769px) and (max-width: 1366px) {
  .paint-workspace-card {
    padding: 18px;
    overflow: hidden;
  }

  .paint-canvas-area {
    gap: 14px;
  }

  .paint-active-template-bar {
    align-items: flex-start;
  }

  .paint-palette-bar {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    border-radius: 22px;
    padding: 14px 16px;
  }

  .palette-swatches-row {
    width: 100%;
    gap: 8px;
  }

  .custom-color-picker-label {
    align-self: flex-start;
  }

  .canvas-zoom-controls {
    align-self: center;
    justify-content: center;
    margin: 0 auto;
  }

  .paint-dashed-wrapper {
    min-height: min(430px, 54vh);
    padding: 14px;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
  }

  .paint-studio-canvas {
    max-width: 100%;
  }
}

@media (max-width: 768px) {
  .kids-child-pill,
  .kids-stars-pill {
    display: none !important;
  }
  .kids-profile-menu-btn {
    width: 40px;
    min-width: 40px;
    padding: 0;
  }
  .kids-profile-menu-btn span,
  .kids-profile-menu-btn i:last-child {
    display: none;
  }
  .kids-dropdown-box {
    right: 0;
    width: min(260px, calc(100vw - 28px));
  }
  .kids-bottom-bar {
    display: flex;
    padding-bottom: calc(8px + env(safe-area-inset-bottom));
  }
  .kids-main-body {
    padding-bottom: calc(148px + env(safe-area-inset-bottom));
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
  .kids-hero-banner .hero-actions {
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

.dropdown-profile-option {
  width: 100%;
  border: 1px solid #d8f3f3;
  background: #ffffff;
  color: #052453;
  border-radius: 10px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.dropdown-profile-option:hover,
.dropdown-profile-option.active {
  background: #e9fbfb;
  border-color: #00b9b5;
  color: #007f7c;
}

.dropdown-profile-option i {
  font-size: 0.95rem;
}


@media (max-width: 768px) {
  .kids-app-container,
  .kids-dashboard-view {
    width: 100%;
    max-width: 100vw;
    overflow-x: hidden;
  }

  .kids-top-header {
    width: 100%;
    max-width: 100vw;
    min-height: 62px;
    padding: 9px 12px;
    gap: 8px;
    box-sizing: border-box;
    overflow: visible;
  }

  .kids-brand {
    min-width: 0;
    max-width: calc(100vw - 70px);
    gap: 7px;
    overflow: hidden;
  }

  .kids-logo-img {
    height: 30px;
    max-width: 132px;
  }

  .badge-kids {
    flex: 0 0 auto;
    font-size: 0.66rem;
    padding: 2px 7px;
  }

  .kids-desktop-nav {
    display: none !important;
  }

  .kids-header-right {
    flex: 0 0 auto;
    margin-left: auto;
    gap: 0;
  }

  .kids-profile-menu-btn {
    width: 40px;
    min-width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }

  .kids-main-body {
    width: 100%;
    max-width: 100vw;
    padding: 14px 12px calc(94px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow-x: hidden;
  }

  .kids-hero-banner-container {
    border-radius: 24px;
    margin-bottom: 22px;
  }

  .kids-hero-img {
    border-radius: 24px;
  }

  .section-title {
    display: block;
    max-width: 100%;
    font-size: clamp(1.45rem, 7.2vw, 1.85rem);
    line-height: 1.18;
    margin: 0 auto 22px;
    padding: 0 6px;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .hub-grid {
    grid-template-columns: 1fr;
    gap: 18px;
    width: 100%;
  }

  .hub-card {
    min-height: 222px;
    padding: 18px 18px 16px;
    border-radius: 22px;
    gap: 10px;
    overflow: hidden;
  }

  .card-top-content {
    width: 100%;
    max-width: 100%;
    padding-right: 0;
    flex-direction: row;
    gap: 12px;
    align-items: flex-start;
  }

  .card-icon-box {
    width: 50px;
    flex: 0 0 50px;
    height: 50px;
    border-radius: 13px;
    font-size: 25px;
  }

  .card-text-col {
    width: auto;
    flex: 1;
    min-width: 0;
  }

  .card-text-col h3 {
    font-size: 1.2rem;
    line-height: 1.22;
    margin-bottom: 6px;
  }

  .card-text-col p {
    max-width: 100%;
    font-size: 0.88rem;
    line-height: 1.48;
  }

  .card-illustration,
  .games-illustration,
  .paint-illustration,
  .draw-illustration {
    width: min(36%, 126px);
    max-height: 118px;
    right: 12px;
    bottom: 14px;
    object-fit: contain;
  }

  .paint-illustration {
    width: min(42%, 142px);
  }

  .btn-card-action {
    align-self: flex-start;
    margin-top: auto;
    max-width: calc(100% - 8px);
    min-height: 44px;
    padding: 8px 17px;
    white-space: nowrap;
  }

  .kids-bottom-bar {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 2px;
    width: 100%;
    max-width: 100vw;
    padding: 7px 6px calc(8px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    z-index: 250;
  }

  .bottom-item {
    min-width: 0;
    padding: 4px 2px;
    gap: 3px;
    font-size: 0.66rem;
    line-height: 1.1;
    overflow: hidden;
  }

  .bottom-item span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bottom-ico {
    font-size: 1.24rem;
  }
}
</style>

