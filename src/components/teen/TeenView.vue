<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { api, clearToken } from '../../services/api'
import { teenStorage } from './services/teenStorage'
import TeenAdminView from './TeenAdminView.vue'

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
    default: 'dashboard'
  }
})

const emit = defineEmits(['goHome', 'login', 'logout', 'triggerDevModal'])

// --- NAVEGAÇÃO PRINCIPAL TEEN ---
// 'courses' | 'course-detail' | 'watch' | 'calendar'
const currentTeenTab = ref('courses')
const showAdminPanel = ref(false)
const showProfileMenu = ref(false)
const showMobileDrawer = ref(false)

// Abas internas da Página do Curso: 'live' | 'recorded' | 'materials'
const courseInternalTab = ref('live')

// Cursos e Seleção de Curso & Aula
const courses = ref([])
const activeCourse = ref(null)
const activeModule = ref(null)
const activeLesson = ref(null)

// Painel Lateral da Sala de Aula: 'chat' | 'people'
const livePanelTab = ref('chat')

// Filtros do Catálogo
const searchKeyword = ref('')

// Agenda / Calendário State (Mês Corrente)
const calendarYear = ref(2026)
const calendarMonth = ref(7) // 0 = Jan, 7 = Agosto
const selectedCalendarDay = ref(18)

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const weekDayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Chat Ao Vivo State
const chatMessages = ref([])
const newChatMessage = ref('')
const chatScrollRef = ref(null)

// Pessoas Conectadas
const liveParticipants = ref([])

// Presenças Confirmadas (Array de IDs de aulas - usado na agenda)
const attendedLessons = ref([])

// Perfil Ativo
const availableProfiles = ref([])
const activeProfile = ref({
  id: 'titular',
  name: props.user?.name || 'Estudante',
  email: props.user?.email || '',
  initials: 'ES',
  level: props.user?.plan || 'Viva Mais Idiomas'
})

const studentProfileId = computed(() => activeProfile.value?.id || props.user?.id || 'default_teen')

// Login Teen State — apenas CPF, sem senha (mesma sessão local do Kids)
const KIDS_TEEN_SESSION_KEY = 'viva_kidsteen_session'
const loginCpf = ref('')
const loginLoading = ref(false)
const loginError = ref('')
const kidsTeenSession = ref(null)
const forceAuth = ref(props.subRoute === 'auth')

function loadKidsTeenSession() {
  try {
    const saved = localStorage.getItem(KIDS_TEEN_SESSION_KEY)
    if (saved) {
      const session = JSON.parse(saved)
      kidsTeenSession.value = session?.module === 'teen' ? session : null
    }
  } catch {
    kidsTeenSession.value = null
  }
}
loadKidsTeenSession()

const hasTeenAccess = computed(() => {
  if (kidsTeenSession.value?.module === 'teen') return true
  return false
})
const showAuthScreen = computed(() => !hasTeenAccess.value || forceAuth.value)

function getInitials(name) {
  if (!name) return 'UN'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

async function fetchDependentsAndSetupProfiles() {
  const list = []

  if (kidsTeenSession.value?.module === 'teen' && kidsTeenSession.value.user) {
    list.push({
      id: `dep-${kidsTeenSession.value.user.id}`,
      name: kidsTeenSession.value.user.name || 'Dependente',
      email: kidsTeenSession.value.user.email || '',
      initials: getInitials(kidsTeenSession.value.user.name || 'Dependente'),
      role: 'dependent',
      isDependent: true,
      level: 'Dependente Teen'
    })
  }

  availableProfiles.value = list
  const savedProfileId = localStorage.getItem('viva_teen_active_profile_id')
  const matched = list.find(p => String(p.id) === String(savedProfileId))
  activeProfile.value = matched || list[0] || {
    id: 'sem-teen',
    name: 'Sem dependente Teen',
    email: '',
    initials: 'ST',
    role: 'dependent',
    isDependent: true,
    level: 'Nenhum dependente de 11 a 17 anos'
  }
  loadAllData()
}

function selectStudentProfile(profile) {
  activeProfile.value = profile
  localStorage.setItem('viva_teen_active_profile_id', String(profile.id))
  showProfileMenu.value = false
  showMobileDrawer.value = false
  loadAllData()
}

function loadAllData() {
  courses.value = teenStorage.getCourses()
  attendedLessons.value = teenStorage.getAttendance(studentProfileId.value)

  if (!activeCourse.value && courses.value.length > 0) {
    activeCourse.value = courses.value[0]
  } else if (activeCourse.value) {
    const updated = courses.value.find(c => c.id === activeCourse.value.id)
    if (updated) activeCourse.value = updated
  }

  if (activeLesson.value) {
    loadChatAndParticipants(activeLesson.value.id)
  }
}

function loadChatAndParticipants(lessonId) {
  chatMessages.value = teenStorage.getChatMessages(lessonId)
  liveParticipants.value = teenStorage.getLiveParticipants(lessonId)
  scrollChatToBottom()
}

function scrollChatToBottom() {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
    }
  })
}

onMounted(() => {
  courses.value = teenStorage.getCourses()
  fetchDependentsAndSetupProfiles()

  window.addEventListener('teen-courses-updated', loadAllData)
  window.addEventListener('teen-attendance-updated', () => {
    attendedLessons.value = teenStorage.getAttendance(studentProfileId.value)
  })
  window.addEventListener('teen-chat-updated', (e) => {
    if (activeLesson.value && e.detail?.lessonId === activeLesson.value.id) {
      chatMessages.value = e.detail.messages
      scrollChatToBottom()
    }
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('teen-courses-updated', loadAllData)
})

watch(() => props.user, () => {
  fetchDependentsAndSetupProfiles()
})

watch(() => props.subRoute, (val) => {
  if (val === 'auth') {
    forceAuth.value = true
  } else if (val === 'dashboard') {
    forceAuth.value = false
  }
})

// Todas as aulas cadastradas
const allScheduledLessons = computed(() => {
  const list = []
  for (const course of courses.value) {
    for (const mod of (course.modules || [])) {
      for (const lesson of (mod.lessons || [])) {
        list.push({
          ...lesson,
          courseId: course.id,
          courseTitle: course.title,
          courseLanguage: course.language,
          courseFlag: course.flag || 'ID',
          instructor: course.instructor,
          moduleTitle: mod.title,
          isAttended: attendedLessons.value.includes(lesson.id)
        })
      }
    }
  }
  return list
})

// Próxima aula ao vivo do curso ativo
const activeCourseNextLesson = computed(() => {
  if (!activeCourse.value) return null
  const courseLessons = []
  const modules = activeCourse.value.modules || []
  for (const m of modules) {
    for (const l of (m.lessons || [])) {
      courseLessons.push({ ...l, moduleTitle: m.title, moduleOrder: m.order })
    }
  }
  if (courseLessons.length === 0) return null
  const liveNow = courseLessons.find(l => l.status === 'ao_vivo')
  if (liveNow) return liveNow
  return courseLessons.find(l => l.status === 'agendada') || courseLessons[0]
})

// Cursos Filtrados
const filteredCourses = computed(() => {
  let list = courses.value || []
  if (searchKeyword.value.trim()) {
    const s = searchKeyword.value.toLowerCase()
    list = list.filter(c => 
      c.title.toLowerCase().includes(s) || 
      c.description?.toLowerCase().includes(s) ||
      c.language?.toLowerCase().includes(s)
    )
  }
  return list
})

// --- LÓGICA DO CALENDÁRIO / AGENDA DE 30/31 DIAS ---
const calendarDaysGrid = computed(() => {
  const daysInMonth = 31 // Agosto tem 31 dias
  const firstDayOfWeek = 6 // 1º de Agosto de 2026 é Sábado (índice 6)
  
  const cells = []
  // Células em branco antes do dia 1
  for (let i = 0; i < firstDayOfWeek; i++) {
    cells.push({ day: null, isCurrentMonth: false, lessons: [] })
  }

  // Dias de 1 a 31
  for (let d = 1; d <= daysInMonth; d++) {
    const dayLessons = allScheduledLessons.value.filter(l => {
      if (l.dayOfMonth) return l.dayOfMonth === d
      const datePart = l.liveDate?.split('T')[0]
      if (datePart) {
        const dayNum = parseInt(datePart.split('-')[2], 10)
        return dayNum === d
      }
      return false
    })

    cells.push({
      day: d,
      isCurrentMonth: true,
      isToday: d === 18,
      lessons: dayLessons
    })
  }

  return cells
})

// Aulas do dia selecionado no calendário
const selectedDayLessons = computed(() => {
  const day = selectedCalendarDay.value
  return allScheduledLessons.value.filter(l => {
    if (l.dayOfMonth) return l.dayOfMonth === day
    const datePart = l.liveDate?.split('T')[0]
    if (datePart) {
      return parseInt(datePart.split('-')[2], 10) === day
    }
    return false
  })
})

// --- NAVEGAÇÃO ---
function selectCourse(course) {
  activeCourse.value = course
  courseInternalTab.value = 'live'
  if (course.modules?.length > 0) {
    activeModule.value = course.modules[0]
  }
  currentTeenTab.value = 'course-detail'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function enterLiveClass(course, module, lesson) {
  activeCourse.value = course || activeCourse.value
  activeModule.value = module || (activeCourse.value?.modules?.[0])
  activeLesson.value = lesson
  loadChatAndParticipants(lesson.id)
  currentTeenTab.value = 'watch'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openRecordedLesson(lesson) {
  activeLesson.value = {
    ...lesson,
    status: 'concluida',
    formattedDate: lesson.recordedDate || 'Gravação'
  }
  loadChatAndParticipants(lesson.id)
  currentTeenTab.value = 'watch'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openLessonFromCalendar(lesson) {
  const course = courses.value.find(c => c.id === lesson.courseId) || courses.value[0]
  let targetMod = null
  for (const m of (course.modules || [])) {
    if ((m.lessons || []).some(l => l.id === lesson.id)) {
      targetMod = m
      break
    }
  }
  enterLiveClass(course, targetMod, lesson)
}

// --- CONFIRMAR PRESENÇA (NA AGENDA) ---
function toggleAttendance(lesson) {
  if (!lesson) return
  const isAttended = attendedLessons.value.includes(lesson.id)
  
  if (isAttended) {
    teenStorage.unmarkAttendance(studentProfileId.value, lesson.id)
    attendedLessons.value = teenStorage.getAttendance(studentProfileId.value)
  } else {
    teenStorage.markAttendance(studentProfileId.value, lesson.id, activeProfile.value.name)
    attendedLessons.value = teenStorage.getAttendance(studentProfileId.value)
  }
}

// --- CHAT AO VIVO ---
function sendChatMessage() {
  if (!newChatMessage.value.trim() || !activeLesson.value) return
  const text = newChatMessage.value.trim()
  teenStorage.addChatMessage(activeLesson.value.id, {
    author: activeProfile.value.name,
    role: activeProfile.value.role === 'admin' ? 'admin' : 'student',
    avatarText: activeProfile.value.initials || 'AL',
    text
  })
  newChatMessage.value = ''
  chatMessages.value = teenStorage.getChatMessages(activeLesson.value.id)
  scrollChatToBottom()
}

// --- LOGIN TEEN — apenas CPF, sem senha ---
async function handleTeenLogin() {
  const cpf = loginCpf.value.replace(/\D/g, '')
  if (cpf.length !== 11) {
    loginError.value = 'Informe um CPF válido (11 números).'
    return
  }
  loginLoading.value = true
  loginError.value = ''
  try {
    const data = await api.post('/auth/login-kids', { cpf, module: 'teen' })
    if (data?.token) {
      kidsTeenSession.value = { token: data.token, user: data.user, module: 'teen' }
      localStorage.setItem(KIDS_TEEN_SESSION_KEY, JSON.stringify(kidsTeenSession.value))
      forceAuth.value = false
      fetchDependentsAndSetupProfiles()
      window.history.pushState({ tab: 'teen-dashboard' }, '', '/teen/dashboard')
    }
  } catch (err) {
    loginError.value = err.status === 401 ? 'CPF não encontrado ou assinatura inativa.' : (err?.message || 'Falha ao autenticar. Tente novamente.')
  } finally {
    loginLoading.value = false
  }
}

function handleTeenLogout() {
  if (kidsTeenSession.value) {
    kidsTeenSession.value = null
    localStorage.removeItem(KIDS_TEEN_SESSION_KEY)
  }
  if (props.isLoggedIn) {
    clearToken()
  }
  forceAuth.value = true
  emit('logout', 'teen-auth')
}
</script>

<template>
  <div class="teen-app-wrapper">
    
    <!-- ================================================================= -->
    <!-- TELA DE AUTH / LOGIN TEEN (CASO DESLOGADO) -->
    <!-- ================================================================= -->
    <div v-if="showAuthScreen" class="teen-auth-shell">
      <header class="teen-auth-topbar">
        <div class="teen-auth-brand">
          <img src="/logo.png" alt="Viva Mais Club" class="teen-auth-logo" />
          <span class="badge-teen-tag">TEEN</span>
        </div>
      </header>

      <main class="teen-auth-screen">
        <section class="teen-auth-visual" aria-label="Estudo de idiomas">
          <img src="/teen/auth-language-student.png" alt="Estudante em aula de idiomas" class="teen-auth-illustration-img" />
        </section>

        <div class="teen-auth-card">

        <h2>Entre na sua conta</h2>
        <p>Digite o CPF do dependente Teen com assinatura ativa para assistir às aulas ao vivo e consultar o cronograma.</p>

        <div v-if="loginError" class="alert-error-box">
          <i class="ph ph-warning-circle"></i> {{ loginError }}
        </div>

        <form @submit.prevent="handleTeenLogin" class="teen-auth-form">
          <div class="form-group">
            <label>CPF</label>
            <div class="input-icon-box">
              <i class="ph ph-user"></i>
              <input v-model="loginCpf" type="text" inputmode="numeric" placeholder="000.000.000-00" required />
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-full-teen" :disabled="loginLoading">
            <span>{{ loginLoading ? 'Autenticando...' : 'Entrar na Plataforma' }}</span>
          </button>
        </form>
        </div>
      </main>
    </div>

    <!-- ================================================================= -->
    <!-- PORTAL VIVA MAIS TEEN (LOGADO) -->
    <!-- ================================================================= -->
    <div v-else class="teen-main-portal">
      
      <!-- NAVBAR SUPERIOR TEEN -->
      <header class="teen-topbar">
        <div class="teen-topbar-container">
          
          <div class="teen-logo-area" @click="currentTeenTab = 'courses'">
            <img src="/logo.png" alt="Viva Mais Club" class="teen-brand-logo" />
            <span class="badge-teen-tag">TEEN</span>
          </div>

          <!-- NAVEGAÇÃO PRINCIPAL SIMPLES -->
          <nav class="teen-nav-menu desktop-only-nav">
            <button 
              class="nav-tab-link" 
              :class="{ active: currentTeenTab === 'courses' || currentTeenTab === 'course-detail' }"
              @click="currentTeenTab = 'courses'"
            >
              <i class="ph ph-books"></i> Cursos
            </button>

            <button 
              class="nav-tab-link" 
              :class="{ active: currentTeenTab === 'calendar' }"
              @click="currentTeenTab = 'calendar'"
            >
              <i class="ph ph-calendar"></i> Agenda
            </button>

            <button 
              v-if="activeLesson"
              class="nav-tab-link highlight-live-tab" 
              :class="{ active: currentTeenTab === 'watch' }"
              @click="currentTeenTab = 'watch'"
            >
              <span class="live-dot-pulse"></span> Sala Ao Vivo
            </button>
          </nav>

          <!-- AÇÕES DIREITA: PERFIL & MENU -->
          <div class="teen-topbar-actions">
            <div class="teen-profile-dropdown-wrapper">
              <div class="teen-user-avatar-btn" @click="showProfileMenu = !showProfileMenu">
                <span class="avatar-initials">{{ activeProfile.initials || 'AL' }}</span>
                <span class="user-first-name">{{ activeProfile.name.split(' ')[0] }}</span>
                <i class="ph ph-caret-down"></i>
              </div>

              <div v-if="showProfileMenu" class="teen-dropdown-card">
                <div class="dropdown-head">
                  <strong>Trocar dependente</strong>
                  <small>{{ activeProfile.name }}</small>
                </div>

                <div v-if="availableProfiles.length > 1">
                  <div class="dropdown-divider"></div>
                  <button 
                    v-for="prof in availableProfiles" 
                    :key="prof.id"
                    class="dropdown-option-btn"
                    :class="{ active: prof.id === activeProfile.id }"
                    @click="selectStudentProfile(prof)"
                  >
                    <span class="avatar-initials-mini">{{ prof.initials }}</span> {{ prof.name }}
                  </button>
                </div>
                <p v-else class="dropdown-empty-note">Nenhum outro dependente disponível.</p>
              </div>
            </div>

            <button class="btn-mobile-hamburger" @click="showMobileDrawer = true" aria-label="Abrir Menu">
              <i class="ph ph-list"></i>
            </button>
          </div>

        </div>
      </header>

      <!-- DRAWER MOBILE -->
      <div v-if="showMobileDrawer" class="mobile-drawer-overlay" @click.self="showMobileDrawer = false">
        <div class="mobile-drawer-card">
          <div class="drawer-header">
            <div class="teen-logo-area" @click="currentTeenTab = 'courses'; showMobileDrawer = false">
              <img src="/logo.png" alt="Viva Mais Club" class="teen-brand-logo" />
              <span class="badge-teen-tag">TEEN</span>
            </div>
            <button class="btn-close-drawer" @click="showMobileDrawer = false">
              <i class="ph ph-x"></i>
            </button>
          </div>

          <div class="drawer-profile-box">
            <span class="avatar-initials-lg">{{ activeProfile.initials }}</span>
            <div>
              <strong>{{ activeProfile.name }}</strong>
              <small>{{ activeProfile.level }}</small>
            </div>
          </div>

          <nav class="drawer-nav-list">
            <button 
              class="drawer-nav-btn" 
              :class="{ active: currentTeenTab === 'courses' }"
              @click="currentTeenTab = 'courses'; showMobileDrawer = false"
            >
              <i class="ph ph-books"></i> Cursos
            </button>

            <button 
              class="drawer-nav-btn" 
              :class="{ active: currentTeenTab === 'calendar' }"
              @click="currentTeenTab = 'calendar'; showMobileDrawer = false"
            >
              <i class="ph ph-calendar"></i> Agenda
            </button>

            <button 
              v-if="activeLesson"
              class="drawer-nav-btn text-danger" 
              :class="{ active: currentTeenTab === 'watch' }"
              @click="currentTeenTab = 'watch'; showMobileDrawer = false"
            >
              <i class="ph ph-broadcast"></i> Sala Ao Vivo
            </button>

            <div class="drawer-divider"></div>

            <button 
              class="drawer-nav-btn text-purple" 
              @click="showAdminPanel = true; showMobileDrawer = false"
            >
              <i class="ph ph-gear"></i> Painel Admin
            </button>

            <button 
              class="drawer-nav-btn text-primary" 
              @click="emit('goHome'); showMobileDrawer = false"
            >
              <i class="ph ph-arrow-left"></i> Voltar ao Viva Mais Club
            </button>

            <button
              class="drawer-nav-btn text-danger"
              @click="handleTeenLogout(); showMobileDrawer = false"
            >
              <i class="ph ph-sign-out"></i> Sair
            </button>
          </nav>
        </div>
      </div>

      <!-- MODAL ADMIN TEEN -->
      <div v-if="showAdminPanel" class="teen-admin-overlay" @click.self="showAdminPanel = false">
        <div class="teen-admin-modal-card">
          <div class="modal-admin-top">
            <div class="admin-modal-title">
              <i class="ph ph-shield-check"></i>
              <strong>Gestão de Aulas Ao Vivo e Cursos</strong>
            </div>
            <button class="btn-close-modal-admin" @click="showAdminPanel = false">
              <i class="ph ph-x"></i> Fechar
            </button>
          </div>
          <div class="admin-modal-body">
            <TeenAdminView :embedded="true" @triggerDevModal="(d) => emit('triggerDevModal', d)" />
          </div>
        </div>
      </div>

      <!-- =============================================================== -->
      <!-- 1. TELA DE CURSOS (CATÁLOGO INICIAL) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'courses'" class="teen-content-container animated-fade">
        
        <div class="page-simple-header">
          <div>
            <h1>Cursos de Idiomas</h1>
            <p>Selecione um curso para acessar as aulas ao vivo, gravações e materiais.</p>
          </div>

          <div class="search-simple-box">
            <i class="ph ph-magnifying-glass"></i>
            <input v-model="searchKeyword" type="text" placeholder="Buscar curso..." />
          </div>
        </div>

        <!-- GRID DE CARDS DE CURSOS -->
        <div v-if="filteredCourses.length > 0" class="courses-white-grid">
          <div 
            v-for="course in filteredCourses" 
            :key="course.id" 
            class="course-card-interactive"
            @click="selectCourse(course)"
          >
            <div class="card-cover-image" :style="{ backgroundImage: `url(${course.banner})` }">
              <span class="cover-flag-pill">{{ course.language }}</span>
              <span class="cover-tag-pill">{{ course.tag }}</span>
            </div>

            <div class="card-main-body">
              <div class="card-meta-row">
                <span class="meta-badge">{{ course.levelBadge }}</span>
                <span class="meta-badge">{{ course.totalHours }}</span>
              </div>

              <h3 class="course-card-title">{{ course.title }}</h3>
              <p class="course-card-desc">{{ course.description }}</p>

              <!-- Próxima Aula em Destaque no Card -->
              <div v-if="course.nextLivePreview" class="course-next-live-pill">
                <div class="next-live-left">
                  <span class="live-dot-pulse"></span>
                  <div>
                    <strong class="next-live-countdown">{{ course.nextLivePreview.countdownText }}</strong>
                    <span class="next-live-name">{{ course.nextLivePreview.lessonTitle }}</span>
                  </div>
                </div>
              </div>

              <div class="card-footer-box">
                <div class="instructor-mini-profile">
                  <img :src="course.instructor?.avatar" :alt="course.instructor?.name" />
                  <div>
                    <strong>{{ course.instructor?.name }}</strong>
                    <small>{{ course.instructor?.role }}</small>
                  </div>
                </div>

                <button class="btn btn-primary btn-enter-course" @click.stop="selectCourse(course)">
                  <span>Acessar</span>
                  <i class="ph ph-arrow-right"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ESTADO VAZIO CASO NÃO HAJA CURSOS -->
        <div v-else class="empty-courses-box">
          <div class="empty-courses-icon-circle">
            <i class="ph ph-books"></i>
          </div>
          <h3>Nenhum Curso Disponível</h3>
          <p>Os cursos e transmissões de idiomas aparecerão aqui assim que cadastrados.</p>
          <button v-if="props.user?.role === 'admin' || activeProfile.role === 'admin'" class="btn btn-primary btn-admin-empty" @click="showAdminPanel = true">
            <i class="ph ph-plus-circle"></i> Cadastrar Primeiro Curso
          </button>
        </div>

      </main>

      <!-- =============================================================== -->
      <!-- 2. PÁGINA DO CURSO SELECIONADO (COM ABAS: AO VIVO, GRAVADAS, MATERIAIS) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'course-detail' && activeCourse" class="teen-content-container animated-fade">
        
        <div class="course-detail-header-nav">
          <button class="btn-back-courses" @click="currentTeenTab = 'courses'">
            <i class="ph ph-arrow-left"></i> Voltar para Todos os Cursos
          </button>
        </div>

        <!-- Banner do Curso com CARD DA PRÓXIMA AULA -->
        <div class="course-hero-banner">
          <div class="course-hero-info">
            <span class="course-hero-tag">{{ activeCourse.language }} • {{ activeCourse.levelBadge }}</span>
            <h1 class="hero-white-title">{{ activeCourse.title }}</h1>
            <p class="hero-white-desc">{{ activeCourse.description }}</p>

            <div class="course-instructor-hero">
              <img :src="activeCourse.instructor?.avatar" :alt="activeCourse.instructor?.name" />
              <div>
                <strong class="instructor-white-name">{{ activeCourse.instructor?.name }}</strong>
                <span class="instructor-white-role">{{ activeCourse.instructor?.role }}</span>
              </div>
            </div>
          </div>

          <!-- CARD DA PRÓXIMA AULA -->
          <div v-if="activeCourseNextLesson" class="next-lesson-highlight-card">
            <div class="next-lesson-card-head">
              <span class="badge-next-live">
                <span class="live-dot-pulse"></span> PROXIMA AULA AO VIVO
              </span>
              <span class="countdown-badge-pill">
                {{ activeCourseNextLesson.countdownText || activeCourseNextLesson.formattedDate }}
              </span>
            </div>

            <div class="next-lesson-card-body">
              <h3>{{ activeCourseNextLesson.title }}</h3>
              <p>{{ activeCourseNextLesson.description }}</p>

              <div class="next-lesson-meta">
                <span><i class="ph ph-clock"></i> {{ activeCourseNextLesson.duration }}</span>
                <span><i class="ph ph-calendar"></i> {{ activeCourseNextLesson.formattedDate }}</span>
              </div>

              <div class="next-lesson-actions">
                <button 
                  class="btn btn-primary btn-join-live"
                  @click="enterLiveClass(activeCourse, null, activeCourseNextLesson)"
                >
                  <i :class="activeCourseNextLesson.status === 'ao_vivo' ? 'ph ph-broadcast' : 'ph ph-play'"></i>
                  <span>{{ activeCourseNextLesson.status === 'ao_vivo' ? 'Entrar na Sala Ao Vivo' : 'Abrir Aula' }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ABAS DO CURSO: AULAS AO VIVO, GRAVADAS E MATERIAIS -->
        <div class="course-tabs-bar">
          <button 
            class="course-tab-btn" 
            :class="{ active: courseInternalTab === 'live' }"
            @click="courseInternalTab = 'live'"
          >
            <i class="ph ph-broadcast"></i> Aulas Ao Vivo
          </button>

          <button 
            class="course-tab-btn" 
            :class="{ active: courseInternalTab === 'recorded' }"
            @click="courseInternalTab = 'recorded'"
          >
            <i class="ph ph-video"></i> Aulas Gravadas ({{ activeCourse.recordedLessons?.length || 0 }})
          </button>

          <button 
            class="course-tab-btn" 
            :class="{ active: courseInternalTab === 'materials' }"
            @click="courseInternalTab = 'materials'"
          >
            <i class="ph ph-file-pdf"></i> Materiais de Apoio ({{ activeCourse.materials?.length || 0 }})
          </button>
        </div>

        <!-- ABA 1: AULAS AO VIVO / CRONOGRAMA -->
        <div v-if="courseInternalTab === 'live'" class="course-tab-content-pane">
          <div class="modules-vertical-stack">
            <div 
              v-for="mod in activeCourse.modules" 
              :key="mod.id" 
              class="module-group-card"
            >
              <div class="module-group-header">
                <h3>{{ mod.title }}</h3>
                <span class="module-lessons-count">{{ mod.lessons?.length || 0 }} Aulas Ao Vivo</span>
              </div>

              <div class="lessons-vertical-column">
                <div 
                  v-for="lesson in mod.lessons" 
                  :key="lesson.id" 
                  class="lesson-item-card"
                  :class="{ 
                    'is-live-now': lesson.status === 'ao_vivo', 
                    'is-locked': lesson.status === 'agendada'
                  }"
                >
                  <div class="lesson-thumb-col" :style="{ backgroundImage: `url(${lesson.thumbnail || activeCourse.banner})` }">
                    <span v-if="lesson.status === 'ao_vivo'" class="thumb-status-pill status-live">
                      <span class="live-dot-pulse"></span> AO VIVO
                    </span>
                    <span v-else-if="lesson.status === 'agendada'" class="thumb-status-pill status-locked">
                      <i class="ph ph-lock"></i> Agendada
                    </span>
                    <span v-else class="thumb-status-pill status-recorded">
                      Gravação
                    </span>
                  </div>

                  <div class="lesson-info-col">
                    <div class="lesson-timing-row">
                      <span class="lesson-countdown-tag" :class="{ 'tag-live': lesson.status === 'ao_vivo' }">
                        {{ lesson.countdownText || lesson.formattedDate }}
                      </span>
                      <span class="lesson-duration-badge"><i class="ph ph-timer"></i> {{ lesson.duration }}</span>
                    </div>

                    <h4 class="lesson-title">{{ lesson.title }}</h4>
                    <p class="lesson-desc">{{ lesson.description }}</p>

                    <div class="lesson-footer-actions">
                      <button 
                        class="btn btn-sm btn-primary" 
                        @click="enterLiveClass(activeCourse, mod, lesson)"
                      >
                        <i :class="lesson.status === 'ao_vivo' ? 'ph ph-broadcast' : 'ph ph-play'"></i>
                        <span>{{ lesson.status === 'ao_vivo' ? 'Entrar na Sala' : 'Abrir Aula' }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        <!-- ABA 2: AULAS GRAVADAS -->
        <div v-else-if="courseInternalTab === 'recorded'" class="course-tab-content-pane">
          <div v-if="activeCourse.recordedLessons && activeCourse.recordedLessons.length > 0" class="recorded-lessons-grid">
            <div 
              v-for="rec in activeCourse.recordedLessons" 
              :key="rec.id" 
              class="recorded-card-item"
            >
              <div class="recorded-thumb" :style="{ backgroundImage: `url(${rec.thumbnail || activeCourse.banner})` }">
                <span class="recorded-badge"><i class="ph ph-play-circle"></i> Gravação</span>
                <span class="recorded-duration">{{ rec.duration }}</span>
              </div>

              <div class="recorded-info">
                <span class="recorded-date">Disponibilizada em {{ rec.recordedDate }}</span>
                <h4>{{ rec.title }}</h4>
                <p>{{ rec.description }}</p>

                <button class="btn btn-sm btn-primary btn-watch-recorded" @click="openRecordedLesson(rec)">
                  <i class="ph ph-play"></i> Assistir Gravação
                </button>
              </div>
            </div>
          </div>

          <div v-else class="empty-tab-box">
            <i class="ph ph-video"></i>
            <h4>Nenhuma aula gravada ainda</h4>
            <p>As transmissões ao vivo encerradas ficarão disponíveis nesta seção.</p>
          </div>
        </div>

        <!-- ABA 3: MATERIAIS DE APOIO -->
        <div v-else-if="courseInternalTab === 'materials'" class="course-tab-content-pane">
          <div v-if="activeCourse.materials && activeCourse.materials.length > 0" class="materials-list-grid">
            <div 
              v-for="mat in activeCourse.materials" 
              :key="mat.id" 
              class="material-item-card"
            >
              <div class="material-pdf-icon">
                <i class="ph ph-file-pdf"></i>
              </div>
              <div class="material-item-details">
                <h4>{{ mat.title }}</h4>
                <p>{{ mat.description }}</p>
                <small class="mat-size-badge">{{ mat.size }} • Documento PDF</small>
              </div>
              <a :href="mat.downloadUrl" target="_blank" class="btn btn-sm btn-secondary-clean-dark">
                <i class="ph ph-download-simple"></i> Download
              </a>
            </div>
          </div>

          <div v-else class="empty-tab-box">
            <i class="ph ph-file-pdf"></i>
            <h4>Nenhum material cadastrado</h4>
            <p>Apostilas e guias em PDF serão publicados aqui.</p>
          </div>
        </div>

      </main>

      <!-- =============================================================== -->
      <!-- 3. SALA DE AULA AO VIVO (LIMPA: SEM BOTÃO DE PRESENÇA) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'watch' && activeLesson" class="live-classroom-container animated-fade">
        
        <div class="classroom-topbar">
          <div class="classroom-breadcrumb">
            <button class="btn-back-nav" @click="currentTeenTab = 'course-detail'">
              <i class="ph ph-arrow-left"></i> Voltar ao Curso
            </button>
            <span class="crumb-divider">/</span>
            <span class="crumb-course">{{ activeCourse?.title }}</span>
            <span class="crumb-divider">/</span>
            <span class="crumb-lesson">{{ activeLesson?.title }}</span>
          </div>

          <div class="classroom-top-actions">
            <span v-if="activeLesson.status === 'ao_vivo'" class="live-pill-header">
              <span class="live-dot-pulse"></span> AO VIVO
            </span>
            <span v-else-if="activeLesson.status === 'agendada'" class="locked-pill-header">
              <i class="ph ph-clock"></i> {{ activeLesson.formattedDate }}
            </span>
            <span v-else class="recorded-pill-header">
              <i class="ph ph-video"></i> GRAVAÇÃO
            </span>
          </div>
        </div>

        <div class="classroom-split-layout">
          
          <!-- COLUNA ESQUERDA: PLAYER -->
          <div class="classroom-left-col">
            <div class="live-player-box">
              <div v-if="activeLesson.status === 'agendada'" class="live-locked-overlay">
                <div class="locked-content-box">
                  <div class="lock-icon-circle">
                    <i class="ph ph-lock-simple"></i>
                  </div>
                  <h3 class="locked-white-title">Aula Ao Vivo Agendada</h3>
                  <p class="locked-white-desc">Esta transmissão estará liberada em <strong>{{ activeLesson.formattedDate }}</strong>.</p>
                </div>
              </div>

              <iframe 
                v-else
                :src="activeLesson.videoUrl" 
                class="live-iframe-player" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowfullscreen
              ></iframe>
            </div>

            <!-- DETALHES DA AULA (LIMPO E SEM PRESENÇA) -->
            <div class="classroom-lesson-details">
              <div class="lesson-header-row-clean">
                <h1 class="lesson-main-title">{{ activeLesson.title }}</h1>
                <div class="lesson-meta-chips">
                  <span><i class="ph ph-clock"></i> {{ activeLesson.duration }}</span>
                  <span><i class="ph ph-calendar"></i> {{ activeLesson.formattedDate }}</span>
                </div>
              </div>

              <div class="lesson-body-section">
                <p class="lesson-full-desc">{{ activeLesson.description }}</p>

                <div class="instructor-card-row">
                  <img :src="activeCourse?.instructor?.avatar" :alt="activeCourse?.instructor?.name" class="instructor-avatar-lg" />
                  <div class="instructor-details">
                    <strong>{{ activeCourse?.instructor?.name }}</strong>
                    <span>{{ activeCourse?.instructor?.role }}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- COLUNA DIREITA: CHAT & PESSOAS -->
          <div class="classroom-right-col">
            <div class="live-interaction-panel">
              
              <div class="interaction-tabs-header">
                <button 
                  class="tab-interact-btn" 
                  :class="{ active: livePanelTab === 'chat' }"
                  @click="livePanelTab = 'chat'"
                >
                  <i class="ph ph-chat-circle-dots"></i> Chat Ao Vivo
                </button>

                <button 
                  class="tab-interact-btn" 
                  :class="{ active: livePanelTab === 'people' }"
                  @click="livePanelTab = 'people'"
                >
                  <i class="ph ph-users"></i> Pessoas ({{ liveParticipants.length }})
                </button>
              </div>

              <!-- CHAT AO VIVO -->
              <div v-if="livePanelTab === 'chat'" class="live-chat-wrapper">
                <div ref="chatScrollRef" class="chat-messages-feed">
                  <div 
                    v-for="msg in chatMessages" 
                    :key="msg.id" 
                    class="chat-msg-row"
                    :class="{ 'is-instructor': msg.role === 'instructor', 'is-me': msg.author === activeProfile.name }"
                  >
                    <span class="chat-user-initials">{{ msg.avatarText || 'AL' }}</span>
                    <div class="chat-msg-content">
                      <div class="chat-msg-meta">
                        <strong class="chat-author-name">{{ msg.author }}</strong>
                        <span v-if="msg.role === 'instructor'" class="badge-role-instructor">Professor</span>
                        <small class="chat-time">{{ msg.time }}</small>
                      </div>
                      <div class="chat-bubble-text">{{ msg.text }}</div>
                    </div>
                  </div>
                </div>

                <form @submit.prevent="sendChatMessage" class="chat-input-form">
                  <input 
                    v-model="newChatMessage" 
                    type="text" 
                    placeholder="Digite sua mensagem no chat..." 
                    class="form-control chat-input" 
                    required 
                  />
                  <button type="submit" class="btn-send-chat" aria-label="Enviar">
                    <i class="ph ph-paper-plane-right"></i>
                  </button>
                </form>
              </div>

              <!-- ABA DE PESSOAS -->
              <div v-else class="live-people-wrapper">
                <div class="people-list-scroll">
                  <div class="person-row is-me">
                    <span class="person-initials">{{ activeProfile.initials || 'VO' }}</span>
                    <div class="person-info">
                      <strong>{{ activeProfile.name }}</strong>
                      <small><span class="status-dot-green"></span> Conectado</small>
                    </div>
                  </div>

                  <div 
                    v-for="person in liveParticipants" 
                    :key="person.id" 
                    class="person-row"
                  >
                    <span class="person-initials">{{ person.avatarText || 'AL' }}</span>
                    <div class="person-info">
                      <strong>{{ person.name }}</strong>
                      <small v-if="person.isHost">Professor / Host</small>
                      <small v-else><span class="status-dot-green"></span> Online</small>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </main>

      <!-- =============================================================== -->
      <!-- 4. AGENDA / CALENDÁRIO VISUAL GRANDE (EM BLOCO COM DETALHES EMBAIXO) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'calendar'" class="teen-content-container animated-fade">
        
        <div class="calendar-page-header">
          <div>
            <h1>Agenda de Aulas Ao Vivo</h1>
            <p>Selecione um dia no calendário para visualizar as aulas agendadas e confirmar presença.</p>
          </div>
          <div class="calendar-month-selector">
            <span class="month-label">{{ monthNames[calendarMonth] }} {{ calendarYear }}</span>
          </div>
        </div>

        <!-- LAYOUT VERTICAL: CALENDÁRIO GRANDE NO TOPO + DETALHES DO DIA EMBAIXO -->
        <div class="calendar-vertical-layout">
          
          <!-- 1. GRADE DO CALENDÁRIO EXPANDIDA (LARGURA TOTAL) -->
          <div class="calendar-grid-card-large">
            
            <div class="calendar-weekdays-row-large">
              <span v-for="wd in weekDayNames" :key="wd" class="weekday-header">{{ wd }}</span>
            </div>

            <div class="calendar-days-grid-large">
              <div 
                v-for="(cell, index) in calendarDaysGrid" 
                :key="index"
                class="calendar-day-cell-large"
                :class="{ 
                  'is-empty': !cell.day, 
                  'is-today': cell.isToday,
                  'is-selected': cell.day === selectedCalendarDay,
                  'has-lessons': cell.lessons?.length > 0 
                }"
                @click="cell.day && (selectedCalendarDay = cell.day)"
              >
                <div v-if="cell.day" class="day-cell-inner-large">
                  <div class="day-number-row">
                    <span class="day-number-lg">{{ cell.day }}</span>
                    <span v-if="cell.lessons?.length > 0" class="day-badge-counter-lg">
                      {{ cell.lessons.length }}
                    </span>
                  </div>
                  
                  <div v-if="cell.lessons?.length > 0" class="day-lessons-markers-lg">
                    <div 
                      v-for="les in cell.lessons.slice(0, 2)" 
                      :key="les.id" 
                      class="day-lesson-pill-lg"
                      :class="{ 
                        'pill-live': les.status === 'ao_vivo', 
                        'pill-attended': attendedLessons.includes(les.id) 
                      }"
                    >
                      <span class="pill-dot"></span>
                      <span class="pill-text">{{ les.courseLanguage }} • {{ les.formattedDate.split(' ')[0] }}</span>
                    </div>

                    <div v-if="cell.lessons.length > 2" class="day-more-indicator">
                      +{{ cell.lessons.length - 2 }} aula(s)
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="mobile-selected-day-card">
              <div class="bottom-detail-header">
                <div class="bottom-detail-title-group">
                  <h3>Aulas do Dia {{ selectedCalendarDay }}</h3>
                  <span class="bottom-detail-count">{{ selectedDayLessons.length }} Aula(s) Programada(s)</span>
                </div>
              </div>

              <div v-if="selectedDayLessons.length > 0" class="bottom-day-lessons-grid">
                <div
                  v-for="les in selectedDayLessons"
                  :key="`mobile-${les.id}`"
                  class="bottom-lesson-card"
                  :class="{ 'card-live': les.status === 'ao_vivo' }"
                >
                  <div class="bottom-card-top">
                    <span class="lesson-flag-tag">{{ les.courseLanguage }} • {{ les.courseTitle }}</span>
                    <span v-if="les.status === 'ao_vivo'" class="live-badge-sm">AO VIVO</span>
                    <span v-else class="scheduled-badge-sm"><i class="ph ph-clock"></i> {{ les.formattedDate }}</span>
                  </div>

                  <h4 class="bottom-lesson-title">{{ les.title }}</h4>
                  <p class="bottom-lesson-desc">{{ les.description }}</p>

                  <div class="bottom-card-footer">
                    <div class="instructor-mini">
                      <img :src="les.instructor?.avatar" :alt="les.instructor?.name" />
                      <div>
                        <strong>{{ les.instructor?.name }}</strong>
                        <small>{{ les.duration }}</small>
                      </div>
                    </div>

                    <div class="bottom-card-actions">
                      <button
                        class="btn-confirm-presence-bottom"
                        :class="{ active: attendedLessons.includes(les.id) }"
                        @click="toggleAttendance(les)"
                      >
                        <i :class="attendedLessons.includes(les.id) ? 'ph ph-check-circle-fill' : 'ph ph-check-circle'"></i>
                        <span>{{ attendedLessons.includes(les.id) ? 'Presença Confirmada' : 'Confirmar Presença' }}</span>
                      </button>

                      <button
                        class="btn btn-sm btn-primary btn-open-live-bottom"
                        @click="openLessonFromCalendar(les)"
                      >
                        <i :class="les.status === 'ao_vivo' ? 'ph ph-broadcast' : 'ph ph-play'"></i>
                        <span>{{ les.status === 'ao_vivo' ? 'Entrar na Sala' : 'Abrir Aula' }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div v-else class="bottom-empty-state">
                <i class="ph ph-calendar-blank"></i>
                <h4>Nenhuma aula no dia {{ selectedCalendarDay }}</h4>
                <p>Toque em um dia com marcador para ver aulas e confirmar presença.</p>
              </div>
            </div>

          </div>

          <!-- 2. SEÇÃO DE AULAS DO DIA SELECIONADO (POSICIONADA EMBAIXO DA GRADE) -->
          <div class="calendar-bottom-detail-section">
            <div class="bottom-detail-header">
              <div class="bottom-detail-title-group">
                <h3>Aulas Agendadas para o Dia {{ selectedCalendarDay }} de {{ monthNames[calendarMonth] }}</h3>
                <span class="bottom-detail-count">{{ selectedDayLessons.length }} Aula(s) Programada(s)</span>
              </div>
            </div>

            <!-- Grid de Aulas do Dia Selecionado -->
            <div v-if="selectedDayLessons.length > 0" class="bottom-day-lessons-grid">
              <div 
                v-for="les in selectedDayLessons" 
                :key="les.id" 
                class="bottom-lesson-card"
                :class="{ 'card-live': les.status === 'ao_vivo' }"
              >
                <div class="bottom-card-top">
                  <span class="lesson-flag-tag">{{ les.courseLanguage }} • {{ les.courseTitle }}</span>
                  <span v-if="les.status === 'ao_vivo'" class="live-badge-sm">AO VIVO</span>
                  <span v-else class="scheduled-badge-sm"><i class="ph ph-clock"></i> {{ les.formattedDate }}</span>
                </div>

                <h4 class="bottom-lesson-title">{{ les.title }}</h4>
                <p class="bottom-lesson-desc">{{ les.description }}</p>

                <div class="bottom-card-footer">
                  <div class="instructor-mini">
                    <img :src="les.instructor?.avatar" :alt="les.instructor?.name" />
                    <div>
                      <strong>{{ les.instructor?.name }}</strong>
                      <small>{{ les.duration }}</small>
                    </div>
                  </div>

                  <div class="bottom-card-actions">
                    <button 
                      class="btn-confirm-presence-bottom"
                      :class="{ active: attendedLessons.includes(les.id) }"
                      @click="toggleAttendance(les)"
                    >
                      <i :class="attendedLessons.includes(les.id) ? 'ph ph-check-circle-fill' : 'ph ph-check-circle'"></i>
                      <span>{{ attendedLessons.includes(les.id) ? 'Presença Confirmada' : 'Confirmar Presença' }}</span>
                    </button>

                    <button 
                      class="btn btn-sm btn-primary btn-open-live-bottom"
                      @click="openLessonFromCalendar(les)"
                    >
                      <i :class="les.status === 'ao_vivo' ? 'ph ph-broadcast' : 'ph ph-play'"></i>
                      <span>{{ les.status === 'ao_vivo' ? 'Entrar na Sala' : 'Abrir Aula' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="bottom-empty-state">
              <i class="ph ph-calendar-blank"></i>
              <h4>Nenhuma aula programada para o dia {{ selectedCalendarDay }} de {{ monthNames[calendarMonth] }}</h4>
              <p>Clique em qualquer dia com marcador colorido na agenda acima para visualizar as aulas correspondentes.</p>
            </div>
          </div>

        </div>

      </main>

    </div>

  </div>
</template>

<style scoped>
/* RESET & GERAL */
.teen-app-wrapper {
  min-height: 100vh;
  background: #F8FAFC;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1E293B;
  display: flex;
  flex-direction: column;
}

/* AUTH */
.teen-auth-shell {
  min-height: 100vh;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

.teen-auth-topbar {
  height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 clamp(20px, 4vw, 56px);
  background: #ffffff;
  border-bottom: 1px solid #e6eef6;
  flex-shrink: 0;
}

.teen-auth-brand {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  border: 0;
  background: transparent;
  padding: 0;
  font-family: inherit;
}

.teen-auth-logo {
  height: 42px;
  width: auto;
  object-fit: contain;
}

.teen-auth-help-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid #dce8f5;
  background: #ffffff;
  color: #052453;
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 800;
  cursor: pointer;
}

.teen-auth-help-btn:hover {
  border-color: #00b9b5;
  color: #009c9a;
}

.teen-auth-screen {
  min-height: calc(100vh - 76px);
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(340px, 420px);
  align-items: center;
  justify-content: start;
  gap: clamp(18px, 3vw, 42px);
  padding: clamp(28px, 5vw, 64px);
  background: #ffffff;
  overflow: hidden;
}

.teen-auth-card {
  background: #ffffff;
  border: 1px solid rgba(0, 185, 181, 0.16);
  border-radius: 24px;
  padding: 36px;
  width: 100%;
  max-width: 420px;
  box-shadow: none;
  position: relative;
  z-index: 3;
  justify-self: start;
  margin-left: -18px;
}

.teen-auth-visual {
  min-height: 520px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  isolation: isolate;
}

.teen-auth-visual::before {
  content: none;
  position: absolute;
  inset: 8% 5% 2%;
  border-radius: 40px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.78), rgba(255, 255, 255, 0.32)),
    radial-gradient(circle at 72% 25%, rgba(20, 184, 166, 0.15), transparent 32%);
  border: 1px solid rgba(180, 231, 232, 0.65);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
  z-index: -2;
}

.teen-auth-visual::after {
  content: none;
  position: absolute;
  width: 62%;
  height: 22%;
  left: 18%;
  bottom: 8%;
  border-radius: 999px;
  background: radial-gradient(ellipse at center, rgba(15, 23, 42, 0.12), transparent 68%);
  filter: blur(12px);
  z-index: -1;
}

.teen-auth-illustration-img {
  display: block;
  width: min(760px, 100%);
  max-height: 74vh;
  object-fit: contain;
  object-position: center;
  filter: none;
}

.teen-floating-card {
  position: absolute;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 12px 16px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(203, 213, 225, 0.76);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
  transform: rotate(var(--tilt, 0deg));
}

.teen-floating-card span {
  font-size: 0.72rem;
  color: #64748b;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.teen-floating-card strong {
  font-size: clamp(1rem, 1.6vw, 1.28rem);
  color: #0f172a;
  white-space: nowrap;
}

.card-english {
  --tilt: -3deg;
  top: 13%;
  left: 10%;
  border-color: rgba(20, 184, 166, 0.34);
}

.card-spanish {
  --tilt: 4deg;
  top: 26%;
  right: 10%;
  padding: 14px 18px;
  border-color: rgba(79, 70, 229, 0.28);
}

.card-french {
  --tilt: -5deg;
  right: 16%;
  bottom: 18%;
  border-color: rgba(14, 165, 233, 0.32);
}

.card-practice {
  --tilt: 3deg;
  left: 13%;
  bottom: 20%;
  padding: 10px 14px;
  border-color: rgba(45, 212, 191, 0.34);
}

.teen-study-illustration {
  position: relative;
  width: min(560px, 88%);
  aspect-ratio: 1.28;
  margin-top: 46px;
}

.study-desk {
  position: absolute;
  left: 5%;
  right: 2%;
  bottom: 13%;
  height: 16%;
  border-radius: 24px;
  background: linear-gradient(180deg, #ffffff, #dff8f7);
  border: 1px solid rgba(20, 184, 166, 0.24);
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.11);
}

.study-desk::before,
.study-desk::after {
  content: '';
  position: absolute;
  bottom: -76px;
  width: 14px;
  height: 82px;
  border-radius: 999px;
  background: #bfe7e8;
}

.study-desk::before { left: 12%; transform: rotate(7deg); }
.study-desk::after { right: 13%; transform: rotate(-7deg); }

.study-chair {
  position: absolute;
  left: 11%;
  bottom: 14%;
  width: 20%;
  height: 42%;
  border-radius: 34px 34px 18px 18px;
  background: linear-gradient(160deg, #dbeafe, #a5b4fc);
  opacity: 0.95;
}

.study-person {
  position: absolute;
  left: 16%;
  bottom: 22%;
  width: 27%;
  height: 57%;
}

.person-head {
  position: absolute;
  left: 30%;
  top: 1%;
  width: 46%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: #ffd7bd;
  box-shadow: inset -10px -8px 0 rgba(245, 158, 11, 0.08);
}

.person-hair {
  position: absolute;
  inset: -8% -4% 42% -10%;
  border-radius: 52% 48% 38% 44%;
  background: #243047;
}

.headphone-band {
  position: absolute;
  left: -18%;
  right: -18%;
  top: 4%;
  height: 62%;
  border: 6px solid #4f46e5;
  border-bottom-color: transparent;
  border-radius: 50% 50% 0 0;
}

.headphone {
  position: absolute;
  top: 34%;
  width: 22%;
  aspect-ratio: 0.72;
  border-radius: 999px;
  background: linear-gradient(180deg, #2dd4bf, #0ea5e9);
}

.headphone.left { left: -17%; }
.headphone.right { right: -17%; }

.person-body {
  position: absolute;
  left: 18%;
  top: 38%;
  width: 58%;
  height: 57%;
  border-radius: 34px 34px 18px 18px;
  background: linear-gradient(150deg, #14b8a6, #2563eb);
  transform: rotate(-3deg);
}

.person-arm {
  position: absolute;
  top: 56%;
  width: 48%;
  height: 12%;
  border-radius: 999px;
  background: #ffd7bd;
}

.person-arm.left {
  left: 40%;
  transform: rotate(28deg);
}

.person-arm.right {
  left: 48%;
  top: 67%;
  transform: rotate(9deg);
}

.study-laptop {
  position: absolute;
  right: 16%;
  bottom: 28%;
  width: 38%;
  aspect-ratio: 1.45;
  border-radius: 16px;
  background: #26324d;
  box-shadow: 0 16px 24px rgba(15, 23, 42, 0.14);
}

.study-laptop::after {
  content: '';
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: -12px;
  height: 16px;
  border-radius: 0 0 18px 18px;
  background: #667eea;
}

.laptop-screen {
  position: absolute;
  inset: 9%;
  border-radius: 10px;
  background: #f8fafc;
  overflow: hidden;
}

.play-dot {
  position: absolute;
  left: 13%;
  top: 22%;
  width: 34%;
  height: 42%;
  border-radius: 12px;
  background: #dbeafe;
}

.play-dot::after {
  content: '';
  position: absolute;
  left: 42%;
  top: 34%;
  border-left: 12px solid #14b8a6;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
}

.screen-line {
  position: absolute;
  right: 9%;
  height: 8px;
  border-radius: 999px;
  background: #c7d2fe;
}

.line-a { top: 26%; width: 34%; }
.line-b { top: 43%; width: 27%; }

.screen-pill {
  position: absolute;
  left: 13%;
  bottom: 13%;
  width: 30%;
  height: 12px;
  border-radius: 999px;
  background: #2dd4bf;
}

.study-notebook {
  position: absolute;
  left: 42%;
  bottom: 25%;
  width: 20%;
  height: 9%;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff, #dbeafe);
  border: 1px solid #bfdbfe;
  transform: rotate(4deg);
}

.study-cup {
  position: absolute;
  right: 7%;
  bottom: 27%;
  width: 7%;
  height: 15%;
  border-radius: 0 0 12px 12px;
  background: linear-gradient(180deg, #99f6e4, #14b8a6);
}

.auth-logo-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.auth-logo-img { max-height: 36px; }

.badge-teen-tag {
  background: #00b9b5;
  color: #FFFFFF;
  font-weight: 800;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
}

.teen-auth-card h2 { font-size: 24px; font-weight: 800; color: #0F172A; margin-bottom: 8px; }
.teen-auth-card p { font-size: 13px; color: #64748B; line-height: 1.5; margin-bottom: 20px; }

.admin-quick-pill {
  margin-bottom: 16px;
  padding: 10px 12px;
  background: #F0FDF4;
  border: 1px dashed #22C55E;
  border-radius: 8px;
  font-size: 12px;
  color: #166534;
}

.admin-quick-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.btn-fill-admin { background: #16A34A; color: white; border: none; border-radius: 4px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-weight: 600; }
.admin-quick-details { font-size: 11px; }
.admin-quick-details code { background: #DCFCE7; padding: 2px 4px; border-radius: 4px; }

.teen-auth-form .form-group { margin-bottom: 16px; }
.teen-auth-form label { display: block; font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }

.input-icon-box { position: relative; }
.input-icon-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; font-size: 18px; }
.input-icon-box input { width: 100%; padding: 10px 12px 10px 38px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 14px; outline: none; }
.input-icon-box input:focus { border-color: #14b8a6; box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.14); }

.btn-full-teen { width: 100%; padding: 12px; background: #00b9b5; color: white; border: none; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; box-shadow: none; }
.btn-full-teen:hover:not(:disabled) { background: #009c9a; }
.btn-full-teen:disabled { opacity: 0.72; cursor: not-allowed; }
@media (max-width: 960px) {
  .teen-auth-topbar {
    height: 70px;
    padding: 0 18px;
  }

  .teen-auth-logo {
    height: 36px;
  }

  .teen-auth-help-btn {
    min-height: 38px;
    padding: 0 12px;
    font-size: 0.84rem;
  }

  .teen-auth-screen {
    min-height: calc(100vh - 70px);
    grid-template-columns: 1fr;
    gap: 18px;
    padding: 22px;
    overflow-y: auto;
  }

  .teen-auth-visual {
    order: 2;
    min-height: auto;
    width: 100%;
  }

  .teen-auth-visual::before {
    inset: 4% 0 0;
    border-radius: 28px;
  }

  .teen-auth-illustration-img {
    width: min(440px, 100%);
    max-height: 38vh;
  }

  .teen-study-illustration {
    width: min(420px, 92%);
    margin-top: 34px;
  }

  .teen-floating-card {
    padding: 9px 12px;
    border-radius: 14px;
  }

  .teen-floating-card span {
    font-size: 0.62rem;
  }

  .teen-floating-card strong {
    font-size: 0.9rem;
  }

  .card-english {
    top: 4%;
    left: 4%;
  }

  .card-spanish {
    top: 15%;
    right: 1%;
  }

  .card-french {
    right: 6%;
    bottom: 8%;
  }

  .card-practice {
    left: 5%;
    bottom: 10%;
  }

  .teen-auth-card {
    order: 1;
    max-width: 100%;
    padding: 28px 24px;
    margin-left: 0;
    justify-self: center;
  }
}

@media (max-width: 768px) {
  .teen-auth-shell {
    height: 100vh;
    min-height: 100vh;
    background: #ffffff;
    overflow: hidden;
  }

  .teen-auth-topbar {
    display: none;
  }

  .teen-auth-screen {
    height: 100vh;
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: 58vh 42vh;
    gap: 0;
    padding: 0;
    background: #ffffff;
    overflow: visible;
  }

  .teen-auth-visual {
    order: 1;
    min-height: 58vh;
    width: 100%;
    background: linear-gradient(180deg, #ffffff 0%, #eef7ff 100%);
    overflow: hidden;
  }

  .teen-auth-illustration-img {
    width: 100%;
    height: 100%;
    max-height: none;
    object-fit: cover;
    object-position: center 22%;
  }

  .teen-auth-card {
    order: 2;
    width: 100%;
    max-width: none;
    min-height: calc(42vh + 34px);
    margin: -34px 0 0;
    justify-self: stretch;
    border-radius: 32px 32px 0 0;
    border-left: 0;
    border-right: 0;
    border-bottom: 0;
    padding: 52px 22px 28px;
    box-shadow: 0 -14px 34px rgba(15, 23, 42, 0.10);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .teen-auth-card h2 {
    font-size: 1.55rem;
    text-align: center;
    margin-bottom: 0;
  }

  .teen-auth-card p {
    display: none;
  }

  .teen-auth-form {
    margin-top: 20px;
  }

  .teen-auth-form .form-group {
    margin-bottom: 14px;
  }

  .teen-auth-card .input-icon-box {
    min-height: 52px;
    border-radius: 14px;
  }

  .teen-auth-card .btn-full-teen {
    min-height: 52px;
    border-radius: 14px;
  }
}

/* TOPBAR */
.teen-topbar {
  background: #FFFFFF;
  border-bottom: 1px solid #E2E8F0;
  position: sticky;
  top: 0;
  z-index: 990;
}

.teen-topbar-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 12px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.teen-logo-area { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.teen-brand-logo { max-height: 34px; }

.teen-nav-menu { display: flex; align-items: center; gap: 8px; }
.nav-tab-link {
  background: transparent;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #64748B;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
}

.nav-tab-link:hover { background: #F1F5F9; color: #0F172A; }
.nav-tab-link.active { background: #EEF2FF; color: #4F46E5; }
.highlight-live-tab { color: #EF4444; }
.highlight-live-tab.active { background: #FEE2E2; color: #DC2626; }

.live-dot-pulse {
  width: 8px;
  height: 8px;
  background: #EF4444;
  border-radius: 50%;
  display: inline-block;
}

.teen-topbar-actions { display: flex; align-items: center; gap: 12px; }
.teen-profile-dropdown-wrapper { position: relative; }
.teen-user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #F1F5F9;
  padding: 6px 12px;
  border-radius: 20px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  border: 1px solid #E2E8F0;
}

.avatar-initials {
  background: #4F46E5;
  color: white;
  font-size: 11px;
  font-weight: 700;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-initials-mini {
  background: #E2E8F0;
  color: #334155;
  font-size: 10px;
  font-weight: 700;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avatar-initials-lg {
  background: #4F46E5;
  color: white;
  font-size: 18px;
  font-weight: 700;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.teen-dropdown-card {
  position: absolute;
  right: 0;
  top: 110%;
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  padding: 12px;
  width: 240px;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1);
  z-index: 1000;
}

.dropdown-head strong { font-size: 13px; color: #0F172A; display: block; }
.dropdown-head small { font-size: 11px; color: #64748B; }
.dropdown-divider { height: 1px; background: #E2E8F0; margin: 6px 0; }
.dropdown-section-title { font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; padding: 4px 8px; }
.dropdown-empty-note { margin: 8px 0 0; font-size: 12px; color: #64748B; }

.dropdown-option-btn {
  width: 100%;
  background: transparent;
  border: none;
  padding: 8px;
  border-radius: 6px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dropdown-option-btn:hover { background: #F1F5F9; }
.dropdown-option-btn.active { background: #EEF2FF; color: #4F46E5; font-weight: 700; }
.text-purple { color: #7C3AED !important; }
.text-primary { color: #0B3C82 !important; }
.text-danger { color: #EF4444 !important; }

.btn-mobile-hamburger { display: none; background: transparent; border: none; font-size: 24px; cursor: pointer; color: #334155; }
@media (max-width: 860px) {
  .desktop-only-nav { display: none; }
  .btn-mobile-hamburger { display: block; }
  .teen-topbar-container {
    padding: 12px 16px;
  }
  .teen-user-avatar-btn {
    max-width: 160px;
  }
  .user-first-name {
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .teen-dropdown-card {
    position: fixed;
    top: 68px;
    right: 12px;
    width: min(300px, calc(100vw - 24px));
  }
}

@media (min-width: 861px) and (max-width: 1180px) {
  .desktop-only-nav {
    display: none;
  }

  .btn-mobile-hamburger {
    display: block;
  }
}

/* CONTAINER PRINCIPAL */
.teen-content-container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 28px 24px 60px;
  width: 100%;
  flex-grow: 1;
}

.page-simple-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.page-simple-header h1 { font-size: 24px; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
.page-simple-header p { font-size: 13px; color: #64748B; }

.search-simple-box { position: relative; min-width: 240px; }
.search-simple-box i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94A3B8; }
.search-simple-box input { width: 100%; padding: 8px 12px 8px 34px; border: 1px solid #CBD5E1; border-radius: 8px; font-size: 12px; outline: none; }

/* GRID DE CARDS */
.courses-white-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
}

.course-card-interactive {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s;
}

.course-card-interactive:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
  border-color: #CBD5E1;
}

.card-cover-image {
  height: 150px;
  background-size: cover;
  background-position: center;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.cover-flag-pill { background: rgba(15,23,42,0.85); color: white; font-size: 11px; font-weight: 700; padding: 4px 8px; border-radius: 6px; }
.cover-tag-pill { background: #4F46E5; color: white; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; }

.card-main-body { padding: 18px; display: flex; flex-direction: column; flex-grow: 1; }
.card-meta-row { display: flex; gap: 8px; margin-bottom: 8px; }
.meta-badge { background: #F1F5F9; color: #475569; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; }

.course-card-title { font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 6px; line-height: 1.4; }
.course-card-desc { font-size: 13px; color: #64748B; line-height: 1.5; margin-bottom: 14px; flex-grow: 1; }

.course-next-live-pill {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
}

.next-live-left { display: flex; align-items: center; gap: 8px; }
.next-live-countdown { display: block; font-size: 11px; font-weight: 700; color: #4F46E5; }
.next-live-name { display: block; font-size: 11px; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }

.card-footer-box { display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #F1F5F9; }
.instructor-mini-profile { display: flex; align-items: center; gap: 8px; }
.instructor-mini-profile img { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; }
.instructor-mini-profile strong { font-size: 12px; color: #0F172A; display: block; }
.instructor-mini-profile small { font-size: 10px; color: #94A3B8; }

.btn-enter-course {
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  background: #4F46E5;
  color: white;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.empty-courses-box {
  background: #FFFFFF;
  border: 1px dashed #CBD5E1;
  border-radius: 14px;
  padding: 56px 24px;
  text-align: center;
  max-width: 540px;
  margin: 40px auto;
  box-shadow: 0 4px 12px rgba(0,0,0,0.02);
}

.empty-courses-icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: #EEF2FF;
  color: #4F46E5;
  font-size: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
}

.empty-courses-box h3 {
  font-size: 18px;
  font-weight: 800;
  color: #0F172A;
  margin-bottom: 6px;
}

.empty-courses-box p {
  font-size: 13px;
  color: #64748B;
  line-height: 1.5;
  margin-bottom: 20px;
}

.btn-admin-empty {
  padding: 10px 20px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 8px;
  background: #4F46E5;
  color: white;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ===============================================================
   PÁGINA DO CURSO SELECIONADO
   =============================================================== */
.course-detail-header-nav { margin-bottom: 16px; }
.btn-back-courses { background: transparent; border: none; color: #4F46E5; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }

.course-hero-banner {
  background: #0F172A;
  color: #FFFFFF;
  border-radius: 14px;
  padding: 32px;
  margin-bottom: 24px;
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 28px;
  align-items: center;
}

.course-hero-tag {
  background: #4F46E5;
  color: #FFFFFF !important;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  display: inline-block;
  margin-bottom: 10px;
}

.hero-white-title {
  font-size: 24px;
  font-weight: 800;
  color: #FFFFFF !important;
  margin-bottom: 10px;
  line-height: 1.3;
}

.hero-white-desc {
  font-size: 14px;
  color: #E2E8F0 !important;
  line-height: 1.6;
  margin-bottom: 18px;
}

.course-instructor-hero { display: flex; align-items: center; gap: 10px; }
.course-instructor-hero img { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; }
.instructor-white-name { display: block; font-size: 13px; color: #FFFFFF !important; font-weight: 700; }
.instructor-white-role { font-size: 12px; color: #CBD5E1 !important; }

/* CARD DA PRÓXIMA AULA */
.next-lesson-highlight-card {
  background: #FFFFFF;
  color: #0F172A;
  border-radius: 12px;
  padding: 22px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.next-lesson-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.badge-next-live { background: #FEE2E2; color: #DC2626; font-size: 10px; font-weight: 800; padding: 3px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; }
.countdown-badge-pill { background: #EEF2FF; color: #4F46E5; font-size: 11px; font-weight: 700; padding: 3px 6px; border-radius: 4px; }

.next-lesson-card-body h3 { font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
.next-lesson-card-body p { font-size: 12px; color: #64748B; margin-bottom: 12px; }
.next-lesson-meta { display: flex; gap: 12px; font-size: 12px; color: #64748B; margin-bottom: 14px; }
.next-lesson-actions { display: flex; flex-direction: column; gap: 8px; }

.btn-join-live {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .course-hero-banner { grid-template-columns: 1fr; }
}

/* ABAS INTERNAS DO CURSO */
.course-tabs-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 24px;
  border-bottom: 1px solid #E2E8F0;
  padding-bottom: 8px;
  overflow-x: auto;
}

.course-tab-btn {
  background: transparent;
  border: none;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  color: #64748B;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: all 0.15s;
}

.course-tab-btn:hover {
  background: #F1F5F9;
  color: #0F172A;
}

.course-tab-btn.active {
  background: #4F46E5;
  color: #FFFFFF;
}

.course-tab-content-pane {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* LISTA DE AULAS AO VIVO */
.modules-vertical-stack { display: flex; flex-direction: column; gap: 20px; }
.module-group-card { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; }
.module-group-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #F1F5F9; }
.module-group-header h3 { font-size: 15px; font-weight: 700; color: #0F172A; }
.module-lessons-count { font-size: 12px; color: #64748B; }

.lessons-vertical-column { display: flex; flex-direction: column; gap: 10px; }
.lesson-item-card {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  display: grid;
  grid-template-columns: 160px 1fr;
  overflow: hidden;
}

.lesson-thumb-col { height: 100%; min-height: 110px; background-size: cover; background-position: center; padding: 8px; position: relative; }
.thumb-status-pill { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.status-live { background: #EF4444; color: white; }
.status-locked { background: rgba(15,23,42,0.85); color: white; }
.status-recorded { background: #64748B; color: white; }

.lesson-info-col { padding: 14px 16px; display: flex; flex-direction: column; }
.lesson-timing-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.lesson-countdown-tag { font-size: 11px; font-weight: 700; color: #4F46E5; background: #EEF2FF; padding: 2px 6px; border-radius: 4px; }
.lesson-countdown-tag.tag-live { color: #DC2626; background: #FEE2E2; }
.lesson-duration-badge { font-size: 11px; color: #64748B; }

.lesson-title { font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 2px; }
.lesson-desc { font-size: 12px; color: #64748B; margin-bottom: 10px; flex-grow: 1; }

.lesson-footer-actions { display: flex; align-items: center; gap: 8px; }

/* AULAS GRAVADAS */
.recorded-lessons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.recorded-card-item {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.recorded-thumb {
  height: 160px;
  background-size: cover;
  background-position: center;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: relative;
}

.recorded-badge {
  background: rgba(15, 23, 42, 0.85);
  color: white;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.recorded-duration {
  background: rgba(0,0,0,0.7);
  color: white;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.recorded-info {
  padding: 16px;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.recorded-date {
  font-size: 11px;
  font-weight: 600;
  color: #64748B;
  margin-bottom: 4px;
}

.recorded-info h4 {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 6px;
}

.recorded-info p {
  font-size: 12px;
  color: #64748B;
  line-height: 1.5;
  margin-bottom: 14px;
  flex-grow: 1;
}

.btn-watch-recorded {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
}

/* MATERIAIS DE APOIO */
.materials-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

.material-item-card {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.material-pdf-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #FEE2E2;
  color: #DC2626;
  font-size: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.material-item-details {
  flex-grow: 1;
}

.material-item-details h4 {
  font-size: 13px;
  font-weight: 700;
  color: #0F172A;
  margin-bottom: 2px;
}

.material-item-details p {
  font-size: 11px;
  color: #64748B;
  margin-bottom: 4px;
}

.mat-size-badge {
  font-size: 10px;
  color: #94A3B8;
  font-weight: 600;
}

.empty-tab-box {
  background: #FFFFFF;
  border: 1px dashed #CBD5E1;
  border-radius: 12px;
  padding: 48px 24px;
  text-align: center;
  color: #94A3B8;
}

.empty-tab-box i {
  font-size: 36px;
  margin-bottom: 8px;
  display: block;
}

.empty-tab-box h4 {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
  margin-bottom: 4px;
}

.empty-tab-box p {
  font-size: 12px;
}

@media (max-width: 768px) {
  .lesson-item-card { grid-template-columns: 1fr; }
  .lesson-thumb-col { height: 90px; min-height: auto; }
}

@media (min-width: 769px) and (max-width: 1366px) {
  .teen-main-portal {
    overflow-x: hidden;
  }

  .teen-topbar-container {
    max-width: none;
    padding: 12px clamp(18px, 3vw, 32px);
    gap: 14px;
  }

  .teen-content-container,
  .live-classroom-container {
    max-width: none;
    padding-inline: clamp(18px, 3vw, 32px);
  }

  .courses-white-grid,
  .recorded-lessons-grid,
  .materials-list-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
    gap: 18px;
  }

  .course-hero-banner {
    gap: 18px;
  }

  .lesson-item-card {
    grid-template-columns: minmax(132px, 160px) minmax(0, 1fr);
  }

  .lesson-timing-row,
  .lesson-footer-actions,
  .next-lesson-card-head,
  .next-lesson-meta {
    flex-wrap: wrap;
    gap: 8px;
  }

  .calendar-page-header {
    align-items: flex-start;
  }

  .calendar-grid-card-large,
  .calendar-bottom-detail-section {
    padding: 18px;
  }

  .calendar-days-grid-large {
    gap: 8px;
  }

  .calendar-day-cell-large {
    height: clamp(76px, 8vw, 92px);
    min-height: clamp(76px, 8vw, 92px);
    padding: 8px;
  }

  .day-lesson-pill-lg {
    padding-inline: 5px;
  }

  .bottom-day-lessons-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  }

  .bottom-card-top,
  .bottom-card-footer {
    align-items: flex-start;
  }
}

@media (min-width: 769px) and (max-width: 1180px) {
  .course-hero-banner,
  .classroom-split-layout {
    grid-template-columns: 1fr;
  }

  .next-lesson-highlight-card,
  .classroom-right-col {
    max-width: none;
    width: 100%;
  }
}

/* ===============================================================
   SALA DE AULA AO VIVO (LIMPA: SEM BOTÃO DE PRESENÇA)
   =============================================================== */
.live-classroom-container { max-width: 1320px; margin: 0 auto; padding: 16px 20px 60px; width: 100%; }
.classroom-topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.classroom-breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.btn-back-nav { background: transparent; border: none; color: #4F46E5; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.crumb-divider { color: #CBD5E1; }
.crumb-course { color: #64748B; }
.crumb-lesson { color: #0F172A; font-weight: 700; }

.live-pill-header { background: #FEE2E2; color: #DC2626; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; }
.locked-pill-header { background: #FEF3C7; color: #D97706; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
.recorded-pill-header { background: #E2E8F0; color: #475569; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; }

.classroom-split-layout { display: grid; grid-template-columns: 1fr 360px; gap: 20px; align-items: start; }
@media (max-width: 1080px) { .classroom-split-layout { grid-template-columns: 1fr; } }

.classroom-left-col { display: flex; flex-direction: column; gap: 16px; }
.live-player-box { background: #000000; border-radius: 10px; overflow: hidden; aspect-ratio: 16 / 9; position: relative; }
.live-iframe-player { width: 100%; height: 100%; border: none; }

.live-locked-overlay {
  position: absolute;
  inset: 0;
  background: #0F172A;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  padding: 24px;
  text-align: center;
}

.locked-content-box { max-width: 440px; display: flex; flex-direction: column; align-items: center; }

.lock-icon-circle {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255,255,255,0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  color: #FBBF24;
  margin-bottom: 14px;
}

.locked-white-title {
  font-size: 20px;
  font-weight: 800;
  color: #FFFFFF !important;
  margin-bottom: 8px;
}

.locked-white-desc {
  font-size: 14px;
  color: #E2E8F0 !important;
  margin-bottom: 20px;
  line-height: 1.5;
}

.locked-white-desc strong { color: #FFFFFF !important; }

.classroom-lesson-details { background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; }
.lesson-header-row-clean { padding-bottom: 14px; border-bottom: 1px solid #F1F5F9; }
.lesson-main-title { font-size: 18px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
.lesson-meta-chips { display: flex; gap: 12px; font-size: 12px; color: #64748B; }

.lesson-body-section { padding-top: 16px; }
.lesson-full-desc { font-size: 13px; color: #475569; line-height: 1.6; margin-bottom: 16px; }
.instructor-card-row { display: flex; align-items: center; gap: 10px; background: #F8FAFC; padding: 10px 14px; border-radius: 8px; }
.instructor-avatar-lg { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.instructor-details strong { display: block; font-size: 13px; color: #0F172A; }
.instructor-details span { font-size: 11px; color: #64748B; }

/* CHAT & PESSOAS */
.live-interaction-panel {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  height: 560px;
  overflow: hidden;
}

.interaction-tabs-header { display: flex; border-bottom: 1px solid #E2E8F0; background: #F8FAFC; }
.tab-interact-btn {
  flex: 1;
  background: transparent;
  border: none;
  padding: 10px;
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.tab-interact-btn.active { color: #4F46E5; background: #FFFFFF; border-bottom: 2px solid #4F46E5; }
.live-chat-wrapper { display: flex; flex-direction: column; flex-grow: 1; height: calc(100% - 40px); }
.chat-messages-feed { flex-grow: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }

.chat-msg-row { display: flex; align-items: flex-start; gap: 8px; }
.chat-user-initials {
  font-size: 10px;
  font-weight: 700;
  background: #E2E8F0;
  color: #334155;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-msg-content { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 10px; max-width: calc(100% - 36px); }
.chat-msg-row.is-instructor .chat-msg-content { background: #EEF2FF; border-color: #C7D2FE; }
.chat-msg-row.is-me .chat-msg-content { background: #F0FDF4; border-color: #BBF7D0; }

.chat-msg-meta { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.chat-author-name { font-size: 11px; color: #0F172A; }
.badge-role-instructor { background: #4F46E5; color: white; font-size: 9px; font-weight: 700; padding: 1px 4px; border-radius: 4px; }
.chat-time { font-size: 10px; color: #94A3B8; margin-left: auto; }
.chat-bubble-text { font-size: 12px; color: #334155; line-height: 1.4; word-break: break-word; }

.chat-input-form { padding: 10px; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; align-items: center; }
.chat-input { flex-grow: 1; border: 1px solid #CBD5E1; border-radius: 6px; padding: 8px 12px; font-size: 12px; outline: none; }
.chat-input:focus { border-color: #4F46E5; }

.btn-send-chat {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #4F46E5;
  color: #FFFFFF !important;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  transition: all 0.15s;
}

.btn-send-chat:hover { background: #4338CA; }
.btn-send-chat i { color: #FFFFFF !important; }

.live-people-wrapper { display: flex; flex-direction: column; height: calc(100% - 40px); }
.people-list-scroll { flex-grow: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.person-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; }
.person-row.is-me { background: #F0FDF4; border-color: #86EFAC; }
.person-initials { font-size: 10px; font-weight: 700; background: #E2E8F0; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.person-info { flex-grow: 1; }
.person-info strong { display: block; font-size: 12px; color: #0F172A; }
.person-info small { font-size: 10px; color: #64748B; display: flex; align-items: center; gap: 4px; }
.status-dot-green { width: 6px; height: 6px; background: #22C55E; border-radius: 50%; }

/* ===============================================================
   AGENDA / CALENDÁRIO VISUAL GRANDE (LAYOUT VERTICAL COM DETALHES EMBAIXO)
   =============================================================== */
.calendar-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
}

.calendar-page-header h1 { font-size: 24px; font-weight: 800; color: #0F172A; margin-bottom: 4px; }
.calendar-page-header p { font-size: 13px; color: #64748B; }
.calendar-month-selector { background: #FFFFFF; border: 1px solid #CBD5E1; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 700; color: #0F172A; }

.calendar-vertical-layout {
  display: flex;
  flex-direction: column;
  gap: 28px;
  width: 100%;
}

/* GRADE DO CALENDÁRIO GRANDE */
.calendar-grid-card-large {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 24px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.02);
  width: 100%;
  box-sizing: border-box;
}

.calendar-weekdays-row-large {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #64748B;
  padding-bottom: 12px;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 12px;
}

.calendar-days-grid-large {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 10px;
}

.calendar-day-cell-large {
  min-height: 95px;
  height: 95px;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  background: #FFFFFF;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
  box-sizing: border-box;
}

.calendar-day-cell-large:hover:not(.is-empty) {
  border-color: #4F46E5;
  background: #F8FAFC;
  transform: translateY(-1px);
}

.calendar-day-cell-large.is-empty {
  background: #F8FAFC;
  border-color: #F1F5F9;
  cursor: default;
}

.calendar-day-cell-large.is-today {
  border-color: #4F46E5;
  background: #EEF2FF;
}

.calendar-day-cell-large.is-selected {
  border-color: #4F46E5;
  background: #EEF2FF;
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.3);
}

.day-cell-inner-large {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.day-number-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.day-number-lg {
  font-size: 13px;
  font-weight: 800;
  color: #334155;
}

.is-today .day-number-lg { color: #4F46E5; }

.day-badge-counter-lg {
  background: #4F46E5;
  color: white;
  font-size: 10px;
  font-weight: 800;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.day-lessons-markers-lg {
  display: flex;
  flex-direction: column;
  gap: 3px;
  overflow: hidden;
}

.day-lesson-pill-lg {
  background: #EEF2FF;
  border: 1px solid #C7D2FE;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  color: #3730A3;
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-lesson-pill-lg.pill-live {
  background: #FEE2E2;
  border-color: #FCA5A5;
  color: #991B1B;
}

.day-lesson-pill-lg.pill-attended {
  background: #DCFCE7;
  border-color: #86EFAC;
  color: #166534;
}

.pill-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.pill-text { overflow: hidden; text-overflow: ellipsis; }

.day-more-indicator {
  font-size: 9px;
  font-weight: 700;
  color: #64748B;
  padding-left: 2px;
}

/* 2. SEÇÃO DE DETALHES DO DIA (EMBAIXO DO CALENDÁRIO) */
.calendar-bottom-detail-section {
  background: #FFFFFF;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

.mobile-selected-day-card {
  display: none;
}

.bottom-detail-header {
  padding-bottom: 16px;
  border-bottom: 1px solid #F1F5F9;
  margin-bottom: 20px;
}

.bottom-detail-title-group h3 {
  font-size: 17px;
  font-weight: 800;
  color: #0F172A;
  margin-bottom: 4px;
}

.bottom-detail-count {
  font-size: 12px;
  color: #64748B;
  font-weight: 600;
}

.bottom-day-lessons-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}

.bottom-lesson-card {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bottom-lesson-card.card-live {
  border-color: #E2E8F0;
  background: #F8FAFC;
}

.bottom-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lesson-flag-tag { font-size: 11px; font-weight: 700; color: #4F46E5; }
.live-badge-sm {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  width: max-content;
  background: #EF4444;
  color: white;
  font-size: 9px;
  font-weight: 800;
  padding: 4px 8px;
  border-radius: 999px;
  line-height: 1;
  white-space: nowrap;
}
.scheduled-badge-sm { font-size: 11px; font-weight: 600; color: #64748B; display: inline-flex; align-items: center; gap: 4px; }

.bottom-lesson-title { font-size: 14px; font-weight: 700; color: #0F172A; }
.bottom-lesson-desc { font-size: 12px; color: #64748B; line-height: 1.5; flex-grow: 1; }

.bottom-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.05);
  gap: 12px;
  flex-wrap: wrap;
}

.bottom-card-footer .instructor-mini {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bottom-card-footer .instructor-mini img {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
}

.bottom-card-footer .instructor-mini strong { font-size: 11px; color: #334155; }
.bottom-card-footer .instructor-mini small { font-size: 10px; color: #94A3B8; margin-left: 4px; }

.bottom-card-actions {
  display: flex;
  gap: 8px;
}

.btn-confirm-presence-bottom {
  background: #F0FDF4;
  border: 1px solid #86EFAC;
  color: #166534;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-confirm-presence-bottom.active { background: #22C55E; border-color: #22C55E; color: white; }
.btn-open-live-bottom { padding: 6px 14px; font-size: 11px; }

.bottom-empty-state {
  text-align: center;
  padding: 48px 24px;
  color: #94A3B8;
}

.bottom-empty-state i { font-size: 40px; margin-bottom: 10px; display: block; }
.bottom-empty-state h4 { font-size: 14px; font-weight: 700; color: #334155; margin-bottom: 4px; }
.bottom-empty-state p { font-size: 12px; line-height: 1.5; }

@media (max-width: 768px) {
  .calendar-page-header {
    align-items: flex-start;
    margin-bottom: 18px;
  }

  .calendar-page-header h1 {
    font-size: 24px;
    line-height: 1.16;
  }

  .calendar-page-header p {
    max-width: 30ch;
  }

  .calendar-vertical-layout {
    gap: 16px;
  }

  .calendar-grid-card-large {
    padding: 16px 12px;
    border-radius: 14px;
  }

  .calendar-weekdays-row-large {
    font-size: 12px;
    padding-bottom: 10px;
    margin-bottom: 10px;
  }

  .calendar-days-grid-large {
    gap: 6px;
  }

  .calendar-day-cell-large {
    height: 70px;
    min-height: 70px;
    padding: 8px 6px;
    border-radius: 10px;
  }

  .day-number-row {
    margin-bottom: 0;
  }

  .day-number-lg {
    font-size: 13px;
  }

  .day-badge-counter-lg {
    width: 8px;
    height: 8px;
    min-width: 8px;
    overflow: hidden;
    color: transparent;
  }

  .day-lessons-markers-lg {
    margin-top: auto;
    align-items: center;
    flex-direction: row;
    justify-content: center;
  }

  .day-lesson-pill-lg {
    width: 10px;
    height: 10px;
    padding: 0;
    border-radius: 999px;
    justify-content: center;
  }

  .day-lesson-pill-lg .pill-text {
    display: none;
  }

  .pill-dot {
    width: 5px;
    height: 5px;
  }

  .day-more-indicator {
    display: none;
  }

  .calendar-bottom-detail-section {
    display: none;
  }

  .mobile-selected-day-card {
    display: block;
    margin-top: 16px;
    padding: 18px;
    background: #FFFFFF;
    border: 1px solid #E2E8F0;
    border-radius: 14px;
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.07);
  }

  .mobile-selected-day-card .bottom-detail-header {
    padding-bottom: 12px;
    margin-bottom: 14px;
  }

  .mobile-selected-day-card .bottom-detail-title-group h3 {
    font-size: 18px;
    line-height: 1.25;
  }

  .bottom-day-lessons-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .bottom-lesson-card {
    padding: 16px;
    border-radius: 12px;
  }

  .bottom-card-footer,
  .bottom-card-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .bottom-card-top {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .bottom-card-actions {
    width: 100%;
  }

  .btn-confirm-presence-bottom,
  .btn-open-live-bottom {
    width: 100%;
    justify-content: center;
    min-height: 42px;
  }
}

/* MODAL ADMIN */
.teen-admin-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
.teen-admin-modal-card { background: #FFFFFF; border-radius: 14px; width: 100%; max-width: 1200px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
.modal-admin-top { padding: 14px 20px; background: #0F172A; color: white; display: flex; justify-content: space-between; align-items: center; }
.admin-modal-title { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.btn-close-modal-admin { background: rgba(255,255,255,0.15); color: white; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 11px; }
.admin-modal-body { overflow-y: auto; padding: 20px; }

/* DRAWER MOBILE */
.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 99999;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease-out;
}

.mobile-drawer-card {
  width: min(380px, 92vw);
  height: 100dvh;
  min-height: 100dvh;
  background: #FFFFFF;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 28px rgba(0, 0, 0, 0.16);
  animation: slideDrawerFromRight 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  padding: 22px;
  overflow-y: auto;
  box-sizing: border-box;
}

@media (max-width: 860px) {
  .mobile-drawer-card {
    width: min(360px, 86vw);
    border-radius: 0;
  }
}

@media (max-width: 520px) {
  .mobile-drawer-card {
    width: min(340px, 86vw);
  }
}

@keyframes slideDrawerFromRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid #F1F5F9;
}

.btn-close-drawer {
  background: #F1F5F9;
  border: 1px solid #E2E8F0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748B;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-close-drawer:hover {
  background: #E2E8F0;
  color: #0F172A;
}

.drawer-profile-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 20px;
}

.drawer-profile-box strong {
  display: block;
  font-size: 13px;
  color: #0F172A;
}

.drawer-profile-box small {
  font-size: 11px;
  color: #64748B;
}

.drawer-nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-grow: 1;
}

.drawer-nav-btn {
  width: 100%;
  background: transparent;
  border: none;
  padding: 12px 14px;
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.15s;
}

.drawer-nav-btn i {
  font-size: 18px;
  color: #64748B;
}

.drawer-nav-btn:hover {
  background: #F1F5F9;
  color: #0F172A;
}

.drawer-nav-btn.active {
  background: #EEF2FF;
  color: #4F46E5;
  font-weight: 700;
}

.drawer-nav-btn.active i {
  color: #4F46E5;
}

.drawer-divider {
  height: 1px;
  background: #E2E8F0;
  margin: 12px 0;
}

@media (min-width: 769px) and (max-width: 1366px) {
  .teen-main-portal {
    overflow-x: hidden;
  }

  .teen-topbar-container,
  .teen-content-container,
  .live-classroom-container {
    max-width: none;
  }

  .teen-topbar-container {
    padding-inline: clamp(18px, 3vw, 32px);
  }

  .teen-content-container,
  .live-classroom-container {
    padding-inline: clamp(18px, 3vw, 32px);
  }

  .courses-white-grid,
  .recorded-lessons-grid,
  .materials-list-grid,
  .bottom-day-lessons-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  }

  .calendar-grid-card-large,
  .calendar-bottom-detail-section,
  .module-group-card,
  .course-card-interactive,
  .next-lesson-highlight-card {
    max-width: 100%;
    min-width: 0;
  }

  .calendar-days-grid-large {
    gap: 8px;
  }

  .calendar-day-cell-large {
    height: clamp(76px, 8vw, 92px);
    min-height: clamp(76px, 8vw, 92px);
  }
}

@media (min-width: 769px) and (max-width: 1180px) {
  .course-hero-banner,
  .classroom-split-layout {
    grid-template-columns: 1fr;
  }
}
</style>
