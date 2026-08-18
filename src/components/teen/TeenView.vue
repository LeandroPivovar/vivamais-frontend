<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { api, setToken, getToken, clearToken } from '../../services/api'
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
    default: 'dashboard' // 'auth' | 'dashboard'
  }
})

const emit = defineEmits(['goHome', 'login', 'logout', 'triggerDevModal'])

// --- NAVEGAÇÃO PRINCIPAL TEEN ---
// 'home' | 'courses' | 'watch' | 'materials'
const currentTeenTab = ref('home')
const showAdminPanel = ref(false)
const showCelebrationModal = ref(false)
const showProfileMenu = ref(false)
const showMobileDrawer = ref(false)

// Cursos e Seleção
const courses = ref([])
const activeCourse = ref(null)
const activeModule = ref(null)
const activeLesson = ref(null)
const lessonActiveTab = ref('vocabulary') // 'vocabulary' | 'materials' | 'quiz' | 'notes'

// Controle de Dropdown dos Módulos (Abrir / Fechar)
const openModules = reactive({})

// Filtros do Catálogo
const selectedLanguage = ref('todos')
const selectedCategory = ref('todos')
const selectedLevel = ref('todos')
const searchKeyword = ref('')

// Progresso e Gamificação
const availableProfiles = ref([])
const activeProfile = ref({
  id: 'titular',
  name: props.user?.name || 'Estudante',
  email: props.user?.email || '',
  avatar: '🎓',
  level: props.user?.plan || 'Viva Mais Idiomas'
})

const studentProfileId = computed(() => activeProfile.value?.id || props.user?.id || 'default_teen')
const studentProgress = ref(teenStorage.getProgress(studentProfileId.value))
const currentNoteText = ref('')
const quizSelectedOption = ref(null)
const quizAnswered = ref(false)
const quizIsCorrect = ref(false)

// Login Teen State
const loginForm = ref({ email: '', password: '' })
const loginLoading = ref(false)
const loginError = ref('')

async function fetchDependentsAndSetupProfiles() {
  const current = props.user || {}
  const list = [
    {
      id: current.id ? `user-${current.id}` : 'titular',
      name: current.name || 'Titular',
      email: current.email || '',
      avatar: '🎓',
      role: current.role || 'user',
      isDependent: false,
      level: current.plan ? `Plano ${current.plan}` : 'Titular'
    }
  ]

  if (props.isLoggedIn && getToken()) {
    try {
      const deps = await api.get('/dependents')
      if (Array.isArray(deps)) {
        deps.forEach(dep => {
          list.push({
            id: `dep-${dep.id}`,
            name: dep.name,
            email: dep.email || '',
            avatar: '🧑‍🎓',
            role: 'dependent',
            isDependent: true,
            level: 'Dependente'
          })
        })
      }
    } catch {
      // Falha silenciosa se offline
    }
  }

  availableProfiles.value = list
  const savedProfileId = localStorage.getItem('viva_teen_active_profile_id')
  const matched = list.find(p => String(p.id) === String(savedProfileId))
  activeProfile.value = matched || list[0]
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
  studentProgress.value = teenStorage.getProgress(studentProfileId.value)
  if (!activeCourse.value && courses.value.length > 0) {
    activeCourse.value = courses.value[0]
    if (courses.value[0].modules?.length > 0) {
      activeModule.value = courses.value[0].modules[0]
      openModules[courses.value[0].modules[0].id] = true
      if (courses.value[0].modules[0].lessons?.length > 0) {
        activeLesson.value = courses.value[0].modules[0].lessons[0]
      }
    }
  }
}

onMounted(() => {
  courses.value = teenStorage.getCourses()
  if (!courses.value.some(c => c.id === 'course-en-demo') || courses.value.length > 2) {
    teenStorage.resetToDefault()
  }
  fetchDependentsAndSetupProfiles()
  window.addEventListener('teen-courses-updated', loadAllData)
  window.addEventListener('teen-progress-updated', loadAllData)
})

onBeforeUnmount(() => {
  window.removeEventListener('teen-courses-updated', loadAllData)
  window.removeEventListener('teen-progress-updated', loadAllData)
})

watch(() => props.user, () => {
  fetchDependentsAndSetupProfiles()
})

// Computados
const filteredCourses = computed(() => {
  let list = courses.value || []
  if (selectedCategory.value !== 'todos') {
    list = list.filter(c => c.category?.toLowerCase().includes(selectedCategory.value.toLowerCase()))
  }
  if (selectedLanguage.value !== 'todos') {
    list = list.filter(c => c.language === selectedLanguage.value)
  }
  if (selectedLevel.value !== 'todos') {
    list = list.filter(c => c.level.toLowerCase().includes(selectedLevel.value.toLowerCase()))
  }
  if (searchKeyword.value.trim()) {
    const s = searchKeyword.value.toLowerCase()
    list = list.filter(c => 
      c.title.toLowerCase().includes(s) || 
      c.description?.toLowerCase().includes(s) ||
      c.category?.toLowerCase().includes(s)
    )
  }
  return list
})

const allMaterialsList = computed(() => {
  const mats = []
  courses.value.forEach(c => {
    if (c.materials) {
      c.materials.forEach(m => {
        mats.push({
          ...m,
          courseTitle: c.title,
          courseLanguage: c.language,
          courseFlag: c.flag
        })
      })
    }
  })
  return mats
})

const isCurrentLessonCompleted = computed(() => {
  if (!activeLesson.value) return false
  return (studentProgress.value.completedLessons || []).includes(activeLesson.value.id)
})

// Toggle Accordion do Módulo (Abrir / Fechar)
function toggleModule(modId) {
  openModules[modId] = !openModules[modId]
}

function isModuleOpen(modId) {
  return openModules[modId] !== false // Abre por padrão o ativo ou true
}

function isModuleCompleted(mod) {
  if (!mod.lessons || mod.lessons.length === 0) return false
  return mod.lessons.every(l => (studentProgress.value.completedLessons || []).includes(l.id))
}

// AÇÃO: ASSISTIR CURSO
function watchCourse(course, startMod = null, startLes = null) {
  activeCourse.value = course
  if (startMod && startLes) {
    activeModule.value = startMod
    activeLesson.value = startLes
    openModules[startMod.id] = true
  } else if (course.modules && course.modules.length > 0) {
    activeModule.value = course.modules[0]
    openModules[course.modules[0].id] = true
    activeLesson.value = course.modules[0].lessons?.[0] || null
  } else {
    activeModule.value = null
    activeLesson.value = null
  }

  currentNoteText.value = activeLesson.value ? (studentProgress.value.notes?.[activeLesson.value.id] || '') : ''
  quizSelectedOption.value = null
  quizAnswered.value = false
  lessonActiveTab.value = 'vocabulary'
  
  currentTeenTab.value = 'watch'
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// Seleciona aula
function selectLesson(mod, lesson) {
  activeModule.value = mod
  activeLesson.value = lesson
  openModules[mod.id] = true
  currentNoteText.value = studentProgress.value.notes?.[lesson.id] || ''
  quizSelectedOption.value = null
  quizAnswered.value = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function navigateNextLesson() {
  if (!activeCourse.value || !activeModule.value || !activeLesson.value) return
  const currentLessons = activeModule.value.lessons || []
  const currentIndex = currentLessons.findIndex(l => l.id === activeLesson.value.id)
  
  if (currentIndex >= 0 && currentIndex < currentLessons.length - 1) {
    selectLesson(activeModule.value, currentLessons[currentIndex + 1])
  } else {
    const modIndex = activeCourse.value.modules.findIndex(m => m.id === activeModule.value.id)
    if (modIndex >= 0 && modIndex < activeCourse.value.modules.length - 1) {
      const nextMod = activeCourse.value.modules[modIndex + 1]
      if (nextMod.lessons && nextMod.lessons.length > 0) {
        selectLesson(nextMod, nextMod.lessons[0])
      }
    }
  }
}

function navigatePrevLesson() {
  if (!activeCourse.value || !activeModule.value || !activeLesson.value) return
  const currentLessons = activeModule.value.lessons || []
  const currentIndex = currentLessons.findIndex(l => l.id === activeLesson.value.id)
  
  if (currentIndex > 0) {
    selectLesson(activeModule.value, currentLessons[currentIndex - 1])
  }
}

function toggleCompleteLesson() {
  if (!activeLesson.value) return
  const res = teenStorage.toggleLessonComplete(studentProfileId.value, activeLesson.value.id, 0)
  studentProgress.value = teenStorage.getProgress(studentProfileId.value)
  
  if (res.isCompleted) {
    showCelebrationModal.value = true
    setTimeout(() => {
      showCelebrationModal.value = false
    }, 2800)
  }
}

function speakPronunciation(term) {
  if (!('speechSynthesis' in window)) {
    alert(`Pronúncia: "${term}"`)
    return
  }
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(term)
  const codeMap = {
    'Inglês': 'en-US',
    'Espanhol': 'es-ES',
    'Japonês': 'ja-JP',
    'Francês': 'fr-FR',
    'Alemão': 'de-DE',
    'Italiano': 'it-IT',
    'Coreano': 'ko-KR',
    'Mandarim': 'zh-CN'
  }
  utterance.lang = codeMap[activeCourse.value?.language || 'Inglês'] || 'en-US'
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

function handleSaveNote() {
  if (!activeLesson.value) return
  teenStorage.saveLessonNote(studentProfileId.value, activeLesson.value.id, currentNoteText.value)
  studentProgress.value = teenStorage.getProgress(studentProfileId.value)
}

function submitQuizAnswer() {
  if (quizSelectedOption.value === null || !activeLesson.value?.quiz) return
  quizAnswered.value = true
  quizIsCorrect.value = quizSelectedOption.value === activeLesson.value.quiz.correctIndex
}

async function handleTeenLogin() {
  if (!loginForm.value.email || !loginForm.value.password) {
    loginError.value = 'Preencha seu e-mail ou CPF e sua senha de acesso.'
    return
  }
  loginLoading.value = true
  loginError.value = ''
  try {
    const data = await api.post('/auth/login', {
      username: loginForm.value.email.trim(),
      password: loginForm.value.password.trim()
    })
    if (data?.token) {
      setToken(data.token)
    }
    if (data?.user) {
      emit('login', data.user)
      fetchDependentsAndSetupProfiles()
    }
  } catch (err) {
    loginError.value = err?.message || 'Falha ao autenticar. Verifique suas credenciais.'
  } finally {
    loginLoading.value = false
  }
}
</script>

<template>
  <div class="teen-app-wrapper">
    
    <!-- ================================================================= -->
    <!-- TELA DE LOGIN / AUTH TEEN (CASO DESLOGADO OU ROTA /teen/auth) -->
    <!-- ================================================================= -->
    <div v-if="!isLoggedIn || subRoute === 'auth'" class="teen-auth-screen">
      <div class="teen-auth-card">
        <div class="auth-logo-row">
          <img src="/logo.png" alt="Viva Mais Club" class="auth-logo-img" />
          <span class="badge-teen-tag">TEEN</span>
        </div>

        <h2>Plataforma de Cursos de Idiomas</h2>
        <p>Acesse com sua conta Viva Mais para assistir aulas de Inglês, Espanhol, Japonês, Francês, Alemão, Mandarim e Italiano.</p>

        <div v-if="loginError" class="alert-error-box" style="margin-bottom: 16px; padding: 10px 14px; background: #fee2e2; color: #b91c1c; border-radius: 8px; font-size: 13px;">
          <i class="ph ph-warning-circle"></i> {{ loginError }}
        </div>

        <form @submit.prevent="handleTeenLogin" class="teen-auth-form">
          <div class="form-group">
            <label>E-mail ou CPF</label>
            <div class="input-icon-box">
              <i class="ph ph-user"></i>
              <input v-model="loginForm.email" type="text" placeholder="seuemail@exemplo.com ou CPF" required />
            </div>
          </div>

          <div class="form-group">
            <label>Senha de Acesso</label>
            <div class="input-icon-box">
              <i class="ph ph-lock"></i>
              <input v-model="loginForm.password" type="password" placeholder="••••••••" required />
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-full-teen" :disabled="loginLoading">
            <span>{{ loginLoading ? 'Autenticando...' : 'Entrar no Viva Mais Teen' }}</span>
          </button>
        </form>

        <button class="btn-back-club-link" @click="emit('goHome')">
          <i class="ph ph-arrow-left"></i> Voltar ao Viva Mais Club Principal
        </button>
      </div>
    </div>

    <!-- ================================================================= -->
    <!-- PORTAL VIVA MAIS TEEN (LOGADO) - TEMA BRANCO PADRÃO VIVA MAIS CLUB -->
    <!-- ================================================================= -->
    <div v-else class="teen-main-portal">
      
      <!-- NAVBAR SUPERIOR LIMPA: APENAS LOGO, NAV E PERFIL -->
      <header class="teen-topbar">
        <div class="teen-topbar-container">
          
          <!-- 1. LOGO OFICIAL COM BADGE TEEN -->
          <div class="teen-logo-area" @click="currentTeenTab = 'home'">
            <img src="/logo.png" alt="Viva Mais Club" class="teen-brand-logo" />
            <span class="badge-teen-tag">TEEN</span>
          </div>

          <!-- 2. NAVEGAÇÃO PRINCIPAL (DESKTOP) -->
          <nav class="teen-nav-menu desktop-only-nav">
            <button 
              class="nav-tab-link" 
              :class="{ active: currentTeenTab === 'home' }"
              @click="currentTeenTab = 'home'"
            >
              <i class="ph ph-house"></i> Início
            </button>

            <button 
              class="nav-tab-link" 
              :class="{ active: currentTeenTab === 'courses' || currentTeenTab === 'watch' }"
              @click="currentTeenTab = 'courses'"
            >
              <i class="ph ph-books"></i> Cursos de Idiomas
            </button>

            <button 
              class="nav-tab-link" 
              :class="{ active: currentTeenTab === 'materials' }"
              @click="currentTeenTab = 'materials'"
            >
              <i class="ph ph-file-pdf"></i> Materiais de Apoio
            </button>
          </nav>

          <!-- 3. AÇÕES DIREITA: PERFIL & BOTÃO HAMBURGUER MOBILE -->
          <div class="teen-topbar-actions">
            <!-- Dropdown do Aluno -->
            <div class="teen-profile-dropdown-wrapper">
              <div class="teen-user-avatar-btn" @click="showProfileMenu = !showProfileMenu">
                <span class="avatar-emoji">{{ activeProfile.avatar }}</span>
                <span class="user-first-name">{{ activeProfile.name.split(' ')[0] }}</span>
                <i class="ph ph-caret-down"></i>
              </div>

              <div v-if="showProfileMenu" class="teen-dropdown-card">
                <div class="dropdown-head">
                  <strong>{{ activeProfile.name }}</strong>
                  <small>{{ activeProfile.level }}</small>
                </div>

                <!-- Se houver múltiplos perfis (titular + dependentes), exibe switcher -->
                <div v-if="availableProfiles.length > 1">
                  <div class="dropdown-divider"></div>
                  <div style="padding: 4px 12px; font-size: 11px; font-weight: 700; color: #5A6A7B; text-transform: uppercase;">
                    Trocar Aluno / Perfil
                  </div>
                  <button 
                    v-for="prof in availableProfiles" 
                    :key="prof.id"
                    class="dropdown-option-btn"
                    :class="{ active: prof.id === activeProfile.id }"
                    @click="selectStudentProfile(prof)"
                    style="font-size: 12px;"
                  >
                    <span>{{ prof.avatar }}</span> {{ prof.name }}
                  </button>
                </div>

                <div class="dropdown-divider"></div>
                <button class="dropdown-option-btn text-purple" @click="showAdminPanel = true; showProfileMenu = false">
                  <i class="ph ph-gear"></i> Painel Admin (Cursos & Aulas)
                </button>
                <button class="dropdown-option-btn text-primary" @click="emit('goHome')">
                  <i class="ph ph-house"></i> Voltar ao Viva Mais Club
                </button>
                <button class="dropdown-option-btn text-danger" @click="emit('logout')">
                  <i class="ph ph-sign-out"></i> Sair da Conta
                </button>
              </div>
            </div>

            <!-- Botão Menu Hamburguer Mobile -->
            <button class="btn-mobile-hamburger" @click="showMobileDrawer = true" aria-label="Abrir Menu">
              <i class="ph ph-list"></i>
            </button>
          </div>

        </div>
      </header>

      <!-- MENU GAVETA LATERAL MOBILE (DRAWER) -->
      <div v-if="showMobileDrawer" class="mobile-drawer-overlay" @click.self="showMobileDrawer = false">
        <div class="mobile-drawer-card animated-slide-left">
          <div class="drawer-header">
            <div class="teen-logo-area" @click="currentTeenTab = 'home'; showMobileDrawer = false">
              <img src="/logo.png" alt="Viva Mais Club" class="teen-brand-logo" />
              <span class="badge-teen-tag">TEEN</span>
            </div>
            <button class="btn-close-drawer" @click="showMobileDrawer = false" aria-label="Fechar Menu">
              <i class="ph ph-x"></i>
            </button>
          </div>

          <div class="drawer-profile-box">
            <span class="avatar-emoji-large">{{ activeProfile.avatar }}</span>
            <div>
              <strong>{{ activeProfile.name }}</strong>
              <small>{{ activeProfile.level }}</small>
            </div>
          </div>

          <!-- Switcher de perfil no Drawer Mobile -->
          <div v-if="availableProfiles.length > 1" style="margin-bottom: 16px;">
            <div style="font-size: 11px; font-weight: 700; color: #5A6A7B; text-transform: uppercase; margin-bottom: 6px;">
              Trocar Perfil / Dependente
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <button 
                v-for="prof in availableProfiles" 
                :key="prof.id"
                class="dropdown-option-btn"
                :class="{ active: prof.id === activeProfile.id }"
                @click="selectStudentProfile(prof)"
                style="font-size: 12px; padding: 6px 10px; background: #F7FAFC; border-radius: 6px;"
              >
                <span>{{ prof.avatar }}</span> {{ prof.name }}
              </button>
            </div>
            <div class="drawer-divider"></div>
          </div>

          <nav class="drawer-nav-list">
            <button 
              class="drawer-nav-btn" 
              :class="{ active: currentTeenTab === 'home' }"
              @click="currentTeenTab = 'home'; showMobileDrawer = false"
            >
              <i class="ph ph-house"></i> Início
            </button>

            <button 
              class="drawer-nav-btn" 
              :class="{ active: currentTeenTab === 'courses' || currentTeenTab === 'watch' }"
              @click="currentTeenTab = 'courses'; showMobileDrawer = false"
            >
              <i class="ph ph-books"></i> Cursos de Idiomas
            </button>

            <button 
              class="drawer-nav-btn" 
              :class="{ active: currentTeenTab === 'materials' }"
              @click="currentTeenTab = 'materials'; showMobileDrawer = false"
            >
              <i class="ph ph-file-pdf"></i> Materiais de Apoio
            </button>

            <div class="drawer-divider"></div>

            <button 
              class="drawer-nav-btn text-purple" 
              @click="showAdminPanel = true; showMobileDrawer = false"
            >
              <i class="ph ph-gear"></i> Painel Admin (Cursos & Aulas)
            </button>

            <button 
              class="drawer-nav-btn text-primary" 
              @click="emit('goHome'); showMobileDrawer = false"
            >
              <i class="ph ph-arrow-left"></i> Voltar ao Viva Mais Club
            </button>

            <button 
              class="drawer-nav-btn text-danger" 
              @click="emit('logout'); showMobileDrawer = false"
            >
              <i class="ph ph-sign-out"></i> Sair da Conta
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
              <strong>Gestão de Cursos de Idiomas, Módulos & Aulas</strong>
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
      <!-- 1. PÁGINA INICIAL (HOME COM ATALHOS PARA OS CURSOS) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'home'" class="teen-content-container animated-fade">
        
        <!-- Banner de Boas-Vindas Clean & Moderno -->
        <section class="teen-welcome-banner">
          <div class="welcome-left-col">
            <div class="welcome-tag">
              <i class="ph ph-globe"></i> VIVA MAIS TEEN • IDIOMAS
            </div>
            <h1>Cursos de Idiomas: Estudantil, Viagens & Empresarial 🌍</h1>
            <p>Aprenda <strong>Inglês, Espanhol, Francês, Alemão, Italiano, Mandarim e Japonês</strong> com aulas em vídeo práticas focadas em intercâmbio, viagens internacionais e carreira global.</p>
            
            <div class="welcome-buttons-row">
              <button 
                v-if="courses.length > 0" 
                class="btn btn-primary btn-cta-main" 
                @click="watchCourse(courses[0])"
              >
                <i class="ph ph-play-fill"></i> Assistir: {{ courses[0].title }}
              </button>

              <button class="btn btn-secondary-clean" @click="currentTeenTab = 'courses'">
                <i class="ph ph-books"></i> Ver Todos os Cursos ({{ courses.length }})
              </button>
            </div>
          </div>

          <div class="welcome-right-col">
            <div class="info-pill-box">
              <div class="info-pill-item">
                <i class="ph ph-briefcase icon-blue"></i>
                <div>
                  <strong>Empresarial & Carreira</strong>
                  <small>Reuniões, e-mails e negociações</small>
                </div>
              </div>
              <div class="info-pill-item">
                <i class="ph ph-airplane-tilt icon-green"></i>
                <div>
                  <strong>Viagens & Turismo</strong>
                  <small>Aeroporto, alfândega e hotéis</small>
                </div>
              </div>
              <div class="info-pill-item">
                <i class="ph ph-graduation-cap icon-orange"></i>
                <div>
                  <strong>Estudantil & Acadêmico</strong>
                  <small>Intercâmbio e universidades</small>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Atalhos Rápidos dos Cursos -->
        <section class="home-courses-showcase">
          <div class="section-heading-row">
            <div>
              <h2>Cursos em Destaque 🌟</h2>
              <p>Escolha um curso abaixo e clique em <strong>Assistir Curso</strong> para acessar as aulas e módulos.</p>
            </div>
            <button class="btn-link-clean" @click="currentTeenTab = 'courses'">
              Ver catálogo completo <i class="ph ph-arrow-right"></i>
            </button>
          </div>

          <div class="courses-white-grid">
            <div 
              v-for="course in courses.slice(0, 4)" 
              :key="course.id" 
              class="course-white-card"
            >
              <div class="card-cover-image" :style="{ backgroundImage: `url(${course.banner})` }">
                <span class="cover-flag-pill">{{ course.flag }} {{ course.language }}</span>
                <span class="cover-tag-pill">{{ course.tag }}</span>
              </div>

              <div class="card-main-body">
                <div class="card-meta-row">
                  <span class="meta-badge"><i class="ph ph-chart-line"></i> {{ course.levelBadge }}</span>
                  <span class="meta-badge"><i class="ph ph-clock"></i> {{ course.totalHours }}</span>
                  <span class="meta-badge star-badge"><i class="ph ph-star-fill"></i> {{ course.rating }}</span>
                </div>

                <h3 class="course-card-title">{{ course.title }}</h3>
                <p class="course-card-desc">{{ course.description }}</p>

                <div class="course-stats-bar">
                  <span><i class="ph ph-folder"></i> {{ course.modules?.length || 0 }} Módulos</span>
                  <span>
                    <i class="ph ph-video"></i> 
                    {{ (course.modules || []).reduce((acc, m) => acc + (m.lessons?.length || 0), 0) }} Aulas
                  </span>
                  <span><i class="ph ph-file-pdf"></i> {{ course.materials?.length || 0 }} PDFs</span>
                </div>

                <div class="card-footer-box">
                  <div class="instructor-mini-profile">
                    <img :src="course.instructor?.avatar" :alt="course.instructor?.name" />
                    <div>
                      <strong>{{ course.instructor?.name }}</strong>
                      <small>{{ course.instructor?.role }}</small>
                    </div>
                  </div>

                  <button class="btn btn-primary btn-block-watch" @click="watchCourse(course)">
                    <i class="ph ph-play-circle-fill"></i> Assistir Curso
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>

      <!-- =============================================================== -->
      <!-- 2. CATÁLOGO COMPLETO DE CURSOS DE IDIOMAS -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'courses'" class="teen-content-container animated-fade">
        
        <div class="section-heading-row" style="margin-bottom: 20px;">
          <div>
            <h2>Catálogo de Cursos de Idiomas 🌍</h2>
            <p>Filtre por objetivo (Empresarial, Viagens, Estudantil) ou idioma.</p>
          </div>
        </div>

        <!-- Barra de Filtros por Categoria & Idioma -->
        <div class="filters-white-bar">
          <div class="filters-top-row">
            <div class="categories-pills-row">
              <button 
                class="btn-filter-pill" 
                :class="{ active: selectedCategory === 'todos' }"
                @click="selectedCategory = 'todos'"
              >
                Todos os Objetivos ({{ courses.length }})
              </button>
              <button 
                class="btn-filter-pill" 
                :class="{ active: selectedCategory === 'Empresarial' }"
                @click="selectedCategory = 'Empresarial'"
              >
                💼 Empresarial & Carreira
              </button>
              <button 
                class="btn-filter-pill" 
                :class="{ active: selectedCategory === 'Viagens' }"
                @click="selectedCategory = 'Viagens'"
              >
                ✈️ Viagens & Turismo
              </button>
              <button 
                class="btn-filter-pill" 
                :class="{ active: selectedCategory === 'Estudantil' }"
                @click="selectedCategory = 'Estudantil'"
              >
                🎓 Estudantil & Acadêmico
              </button>
            </div>

            <div class="search-input-box">
              <i class="ph ph-magnifying-glass"></i>
              <input v-model="searchKeyword" type="text" placeholder="Buscar por tema ou curso..." />
            </div>
          </div>

          <div class="lang-pills-row">
            <button 
              class="btn-filter-pill" 
              :class="{ active: selectedLanguage === 'todos' }"
              @click="selectedLanguage = 'todos'"
            >
              Todos os Idiomas ({{ courses.length }})
            </button>
            <button 
              v-for="lang in Array.from(new Set(courses.map(c => c.language)))"
              :key="lang"
              class="btn-filter-pill" 
              :class="{ active: selectedLanguage === lang }" 
              @click="selectedLanguage = lang"
            >
              {{ courses.find(c => c.language === lang)?.flag || '🌐' }} {{ lang }}
            </button>
          </div>
        </div>

        <!-- Grid de Cursos -->
        <div class="courses-white-grid">
          <div 
            v-for="course in filteredCourses" 
            :key="course.id" 
            class="course-white-card"
          >
            <div class="card-cover-image" :style="{ backgroundImage: `url(${course.banner})` }">
              <span class="cover-flag-pill">{{ course.flag }} {{ course.language }}</span>
              <span class="cover-tag-pill">{{ course.tag }}</span>
            </div>

            <div class="card-main-body">
              <div class="card-meta-row">
                <span class="meta-badge"><i class="ph ph-chart-line"></i> {{ course.levelBadge }}</span>
                <span class="meta-badge"><i class="ph ph-clock"></i> {{ course.totalHours }}</span>
                <span class="meta-badge star-badge"><i class="ph ph-star-fill"></i> {{ course.rating }}</span>
              </div>

              <h3 class="course-card-title">{{ course.title }}</h3>
              <p class="course-card-desc">{{ course.description }}</p>

              <div class="course-stats-bar">
                <span><i class="ph ph-folder"></i> {{ course.modules?.length || 0 }} Módulos</span>
                <span>
                  <i class="ph ph-video"></i> 
                  {{ (course.modules || []).reduce((acc, m) => acc + (m.lessons?.length || 0), 0) }} Aulas
                </span>
                <span><i class="ph ph-file-pdf"></i> {{ course.materials?.length || 0 }} PDFs</span>
              </div>

                <div class="card-footer-box">
                  <div class="instructor-mini-profile">
                    <img :src="course.instructor?.avatar" :alt="course.instructor?.name" />
                    <div>
                      <strong>{{ course.instructor?.name }}</strong>
                      <small>{{ course.instructor?.role }}</small>
                    </div>
                  </div>

                  <button class="btn btn-primary btn-block-watch" @click="watchCourse(course)">
                    <i class="ph ph-play-circle-fill"></i> Assistir Curso
                  </button>
                </div>
            </div>
          </div>
        </div>

      </main>

      <!-- =============================================================== -->
      <!-- 3. TELA DE ASSISTIR CURSO (VÍDEO + MÓDULOS & AULAS EM DROPDOWN) -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'watch' && activeCourse" class="teen-content-container animated-fade">
        
        <!-- Header da Tela de Aulas -->
        <div class="watch-top-bar">
          <button class="btn btn-outline btn-sm-back" @click="currentTeenTab = 'courses'">
            <i class="ph ph-arrow-left"></i> Voltar aos Cursos
          </button>

          <div class="watch-course-heading">
            <span class="badge-lang-clean">{{ activeCourse.flag }} {{ activeCourse.language }}</span>
            <h2>{{ activeCourse.title }}</h2>
          </div>
        </div>

        <!-- Grid: Player de Vídeo à Esquerda + Módulos & Aulas à Direita -->
        <div class="watch-layout-grid">
          
          <!-- LADO ESQUERDO: PLAYER DE VÍDEO + ABAS DA AULA -->
          <div class="watch-player-section">
            
            <!-- Video Player Box -->
            <div class="video-display-card">
              <iframe 
                v-if="activeLesson && activeLesson.videoUrl"
                :src="activeLesson.videoUrl" 
                title="Aula de Idioma" 
                frameborder="0" 
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowfullscreen
                class="video-iframe-embed"
              ></iframe>
              <div v-else class="video-empty-notice">
                <i class="ph ph-video-camera"></i>
                <p>Selecione uma aula na lista ao lado para assistir.</p>
              </div>
            </div>

            <!-- Título e Ações da Aula -->
            <div v-if="activeLesson" class="lesson-info-bar card">
              <div class="lesson-title-box">
                <span class="module-indicator">{{ activeModule?.title }}</span>
                <h3>{{ activeLesson.title }}</h3>
                <div class="lesson-meta-badges-line">
                  <small><i class="ph ph-clock"></i> Duração: {{ activeLesson.duration }}</small>
                  <span v-if="isCurrentLessonCompleted" class="badge-completed-pill">
                    <i class="ph ph-check-circle-fill"></i> Concluída
                  </span>
                </div>
              </div>

              <div class="lesson-actions-group">
                <button 
                  class="btn btn-complete-toggle" 
                  :class="{ is_completed: isCurrentLessonCompleted }"
                  @click="toggleCompleteLesson"
                >
                  <i v-if="isCurrentLessonCompleted" class="ph ph-check-circle-fill"></i>
                  <i v-else class="ph ph-circle"></i>
                  <span>{{ isCurrentLessonCompleted ? 'Aula Concluída' : 'Marcar como Concluída' }}</span>
                </button>

                <div class="nav-arrows-box">
                  <button class="btn-arrow" @click="navigatePrevLesson" title="Aula Anterior">
                    <i class="ph ph-caret-left"></i>
                  </button>
                  <button class="btn-arrow" @click="navigateNextLesson" title="Próxima Aula">
                    <i class="ph ph-caret-right"></i>
                  </button>
                </div>
              </div>
            </div>

            <!-- Abas da Aula: Vocabulário, Materiais, Quiz, Anotações -->
            <div v-if="activeLesson" class="lesson-tabs-card card">
              <div class="tabs-header-bar">
                <button 
                  class="tab-nav-btn" 
                  :class="{ active: lessonActiveTab === 'vocabulary' }"
                  @click="lessonActiveTab = 'vocabulary'"
                >
                  <i class="ph ph-translate"></i> Vocabulário & Pronúncia
                </button>

                <button 
                  class="tab-nav-btn" 
                  :class="{ active: lessonActiveTab === 'materials' }"
                  @click="lessonActiveTab = 'materials'"
                >
                  <i class="ph ph-file-pdf"></i> Materiais do Curso ({{ activeCourse.materials?.length || 0 }})
                </button>

                <button 
                  class="tab-nav-btn" 
                  :class="{ active: lessonActiveTab === 'quiz' }"
                  @click="lessonActiveTab = 'quiz'"
                >
                  <i class="ph ph-brain"></i> Quiz Rápido
                </button>

                <button 
                  class="tab-nav-btn" 
                  :class="{ active: lessonActiveTab === 'notes' }"
                  @click="lessonActiveTab = 'notes'"
                >
                  <i class="ph ph-notebook"></i> Anotações
                </button>
              </div>

              <!-- ABA VOCABULÁRIO COM SÍNTESE DE VOZ -->
              <div v-if="lessonActiveTab === 'vocabulary'" class="tab-body-wrapper">
                <h4>Vocabulário e Termos em Destaque</h4>
                <div v-if="activeLesson.vocabulary && activeLesson.vocabulary.length > 0" class="vocab-clean-grid">
                  <div v-for="(v, i) in activeLesson.vocabulary" :key="i" class="vocab-item-card">
                    <div class="vocab-item-header">
                      <strong>{{ v.term }}</strong>
                      <button class="btn-audio-speak-clean" @click="speakPronunciation(v.term)" title="Ouvir Pronúncia">
                        <i class="ph ph-speaker-high"></i> Ouvir Pronúncia
                      </button>
                    </div>
                    <p class="vocab-definition">{{ v.meaning }}</p>
                    <small v-if="v.example" class="vocab-example-quote">"{{ v.example }}"</small>
                  </div>
                </div>
                <p v-else class="text-gray-clean">Acompanhe as explicações no vídeo da aula.</p>
              </div>

              <!-- ABA MATERIAIS DE APOIO DO CURSO -->
              <div v-if="lessonActiveTab === 'materials'" class="tab-body-wrapper">
                <h4>Materiais de Apoio e Apostilas em PDF</h4>
                <div v-if="activeCourse.materials && activeCourse.materials.length > 0" class="materials-list-clean">
                  <div v-for="mat in activeCourse.materials" :key="mat.id" class="material-row-card">
                    <div class="mat-left-info">
                      <div class="mat-icon-square">
                        <i class="ph ph-file-pdf"></i>
                      </div>
                      <div>
                        <strong>{{ mat.title }}</strong>
                        <small>{{ mat.size }} • {{ mat.description }}</small>
                      </div>
                    </div>
                    <a :href="mat.downloadUrl" class="btn btn-secondary btn-sm" download>
                      <i class="ph ph-download-simple"></i> Baixar PDF
                    </a>
                  </div>
                </div>
                <p v-else class="text-gray-clean">Nenhum material extra anexado a este curso.</p>
              </div>

              <!-- ABA QUIZ -->
              <div v-if="lessonActiveTab === 'quiz'" class="tab-body-wrapper">
                <div v-if="activeLesson.quiz" class="quiz-clean-box">
                  <h4>{{ activeLesson.quiz.question }}</h4>
                  <div class="quiz-options-grid">
                    <button 
                      v-for="(opt, idx) in activeLesson.quiz.options" 
                      :key="idx"
                      class="quiz-option-pill"
                      :class="{ 
                        selected: quizSelectedOption === idx,
                        correct: quizAnswered && idx === activeLesson.quiz.correctIndex,
                        wrong: quizAnswered && quizSelectedOption === idx && idx !== activeLesson.quiz.correctIndex
                      }"
                      :disabled="quizAnswered"
                      @click="quizSelectedOption = idx"
                    >
                      <span class="letter-badge">{{ ['A', 'B', 'C', 'D'][idx] }}</span>
                      <span>{{ opt }}</span>
                    </button>
                  </div>

                  <button 
                    v-if="!quizAnswered" 
                    class="btn btn-primary" 
                    :disabled="quizSelectedOption === null"
                    @click="submitQuizAnswer"
                  >
                    Confirmar Resposta ⚡
                  </button>

                  <div v-else class="quiz-feedback-banner" :class="{ is_correct: quizIsCorrect }">
                    <strong>{{ quizIsCorrect ? '🎉 Resposta Correta!' : '❌ Resposta Incorreta' }}</strong>
                    <p>{{ activeLesson.quiz.explanation }}</p>
                  </div>
                </div>
                <p v-else class="text-gray-clean">Esta aula não possui quiz obrigatório.</p>
              </div>

              <!-- ABA ANOTAÇÕES -->
              <div v-if="lessonActiveTab === 'notes'" class="tab-body-wrapper">
                <h4>Minhas Anotações desta Aula</h4>
                <textarea 
                  v-model="currentNoteText" 
                  @input="handleSaveNote"
                  rows="5" 
                  class="form-control" 
                  placeholder="Escreva aqui suas dúvidas e anotações (salvo automaticamente)..."
                ></textarea>
              </div>

            </div>

          </div>

          <!-- LADO DIREITO: MÓDULOS E AULAS DO CURSO (DROPDOWN / ACCORDION) -->
          <div class="watch-sidebar-section">
            <div class="course-modules-panel card">
              <div class="modules-panel-header">
                <div>
                  <h4><i class="ph ph-folders"></i> Módulos do Curso</h4>
                  <small>{{ activeCourse.modules?.length || 0 }} Módulos • Clique para abrir/fechar</small>
                </div>
              </div>

              <div class="modules-list-scroll">
                <div 
                  v-for="mod in activeCourse.modules" 
                  :key="mod.id" 
                  class="module-accordion-group"
                >
                  <!-- CABEÇALHO DO MÓDULO (CLICÁVEL PARA ABRIR / FECHAR DROPDOWN) -->
                  <div class="module-group-heading" @click="toggleModule(mod.id)">
                    <div class="heading-left">
                      <span class="mod-number-tag">Módulo {{ mod.order }}</span>
                      <strong class="mod-title-text">{{ mod.title }}</strong>
                      <span v-if="isModuleCompleted(mod)" class="mod-completed-badge">
                        <i class="ph ph-check-circle-fill"></i> Concluído
                      </span>
                    </div>

                    <i :class="isModuleOpen(mod.id) ? 'ph ph-caret-up' : 'ph ph-caret-down'" class="caret-toggle-icon"></i>
                  </div>

                  <!-- AULAS DO MÓDULO (ABERTAS OU FECHADAS VIA DROPDOWN) -->
                  <div v-show="isModuleOpen(mod.id)" class="module-lessons-group">
                    <div 
                      v-for="les in mod.lessons" 
                      :key="les.id" 
                      class="lesson-click-item"
                      :class="{ 
                        active: activeLesson && activeLesson.id === les.id,
                        completed: (studentProgress.completedLessons || []).includes(les.id)
                      }"
                      @click="selectLesson(mod, les)"
                    >
                      <div class="lesson-state-icon">
                        <i v-if="(studentProgress.completedLessons || []).includes(les.id)" class="ph ph-check-circle-fill icon-green"></i>
                        <i v-else-if="activeLesson && activeLesson.id === les.id" class="ph ph-play-circle-fill icon-blue"></i>
                        <i v-else class="ph ph-play-circle"></i>
                      </div>

                      <div class="lesson-text-content">
                        <strong>{{ les.title }}</strong>
                        <div class="lesson-bottom-meta">
                          <small><i class="ph ph-clock"></i> {{ les.duration }}</small>
                          <span v-if="(studentProgress.completedLessons || []).includes(les.id)" class="lesson-done-tag">
                            Concluída
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </main>

      <!-- =============================================================== -->
      <!-- 4. CENTRAL DE MATERIAIS DE APOIO -->
      <!-- =============================================================== -->
      <main v-if="currentTeenTab === 'materials'" class="teen-content-container animated-fade">
        <div class="section-heading-row" style="margin-bottom: 24px;">
          <div>
            <h2>Central de Materiais de Apoio & Apostilas 📚</h2>
            <p>Baixe materiais em PDF, áudios e guias de todos os cursos de idiomas.</p>
          </div>
        </div>

        <div class="materials-white-grid">
          <div v-for="mat in allMaterialsList" :key="mat.id" class="material-white-card card">
            <div class="mat-card-header-tag">
              <span>{{ mat.courseFlag }} {{ mat.courseLanguage }}</span>
            </div>
            <div class="mat-square-icon" :class="mat.type">
              <i v-if="mat.type === 'pdf'" class="ph ph-file-pdf"></i>
              <i v-else-if="mat.type === 'audio'" class="ph ph-speaker-high"></i>
              <i v-else class="ph ph-file-zip"></i>
            </div>
            <div class="mat-card-body-text">
              <span class="size-pill">{{ mat.size }}</span>
              <h3>{{ mat.title }}</h3>
              <p>{{ mat.description }}</p>
              <small class="course-ref">Curso: {{ mat.courseTitle }}</small>
            </div>
            <a :href="mat.downloadUrl" class="btn btn-secondary btn-sm btn-block-mat" download>
              <i class="ph ph-download-simple"></i> Baixar Arquivo
            </a>
          </div>
        </div>
      </main>

      <!-- BARRA FIXA INFERIOR NO MOBILE -->
      <nav class="teen-bottom-mobile-nav">
        <button 
          class="bottom-nav-btn" 
          :class="{ active: currentTeenTab === 'home' }"
          @click="currentTeenTab = 'home'"
        >
          <i class="ph ph-house"></i>
          <span>Início</span>
        </button>

        <button 
          class="bottom-nav-btn" 
          :class="{ active: currentTeenTab === 'courses' || currentTeenTab === 'watch' }"
          @click="currentTeenTab = 'courses'"
        >
          <i class="ph ph-books"></i>
          <span>Cursos</span>
        </button>

        <button 
          class="bottom-nav-btn" 
          :class="{ active: currentTeenTab === 'materials' }"
          @click="currentTeenTab = 'materials'"
        >
          <i class="ph ph-file-pdf"></i>
          <span>Materiais</span>
        </button>

        <button 
          class="bottom-nav-btn" 
          @click="showMobileDrawer = true"
        >
          <i class="ph ph-list"></i>
          <span>Menu</span>
        </button>
      </nav>

    </div>

    <!-- MODAL DE CONFIRMAÇÃO DE AULA CONCLUÍDA -->
    <div v-if="showCelebrationModal" class="celebration-overlay">
      <div class="celebration-white-card animated-bounce">
        <div class="celebration-emoji-icon">🎉</div>
        <h2>Aula Concluída com Sucesso!</h2>
        <p>Seu progresso foi salvo nesta etapa do curso.</p>
        <div class="badge-done-celebration">
          <i class="ph ph-check-circle-fill"></i> Progresso Salvo
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* RESET & ESTRUTURA GERAL BRANCA */
.teen-app-wrapper {
  min-height: 100vh;
  background-color: var(--bg-gray, #F7FAFC);
  color: var(--text-gray, #5A6A7B);
  font-family: var(--font-main, 'Poppins', sans-serif);
}

/* AUTH SCREEN */
.teen-auth-screen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--bg-gray, #F7FAFC);
}

.teen-auth-card {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  padding: 36px 32px;
  border-radius: 20px;
  width: 100%;
  max-width: 440px;
  text-align: center;
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.05));
}

.auth-logo-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}

.auth-logo-img {
  max-height: 38px;
}

.badge-teen-tag {
  background: #215cff;
  color: white;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.05em;
}

.teen-auth-card h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--primary, #0B3C82);
  margin-bottom: 8px;
}

.teen-auth-card p {
  font-size: 13px;
  color: var(--text-gray, #5A6A7B);
  margin-bottom: 24px;
}

.teen-auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.teen-auth-form label {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary, #0B3C82);
  margin-bottom: 4px;
  display: block;
}

.input-icon-box {
  position: relative;
}

.input-icon-box i {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.input-icon-box input {
  width: 100%;
  padding: 12px 14px 12px 40px;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}

.btn-full-teen {
  width: 100%;
  padding: 12px;
  font-weight: 700;
  border-radius: 10px;
}

.auth-guest-row {
  margin-top: 14px;
}

.btn-back-club-link {
  background: transparent;
  border: none;
  color: var(--text-gray, #5A6A7B);
  font-size: 12px;
  margin-top: 18px;
  cursor: pointer;
}

/* NAVBAR LIMPA: APENAS LOGO, NAV E PERFIL */
.teen-topbar {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: white;
  border-bottom: 1px solid var(--border-color, #DCE7F0);
  padding: 0 32px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.03);
}

.teen-topbar-container {
  max-width: 1560px;
  margin: 0 auto;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.teen-logo-area {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.teen-brand-logo {
  max-height: 36px;
}

.teen-nav-menu {
  display: flex;
  gap: 12px;
  align-items: center;
  height: 100%;
}

.nav-tab-link {
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-gray, #5A6A7B);
  font-size: 14px;
  font-weight: 600;
  padding: 0 18px;
  height: 100%;
  border-radius: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.nav-tab-link:hover {
  background: transparent;
  color: var(--primary, #0B3C82);
}

.nav-tab-link.active {
  background: transparent;
  color: var(--primary, #0B3C82);
  font-weight: 700;
  border-bottom: 3px solid var(--primary, #0B3C82);
}

.teen-profile-dropdown-wrapper {
  position: relative;
}

.teen-user-avatar-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  padding: 6px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-dark, #0B3C82);
  font-weight: 600;
}

.teen-dropdown-card {
  position: absolute;
  right: 0;
  top: 48px;
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 12px;
  width: 230px;
  padding: 8px;
  box-shadow: var(--shadow-md);
  z-index: 9999;
}

.dropdown-head { padding: 8px 12px; }
.dropdown-head strong { display: block; font-size: 13px; color: var(--text-dark, #0B3C82); }
.dropdown-head small { font-size: 11px; color: var(--text-gray, #5A6A7B); }
.dropdown-divider { height: 1px; background: var(--border-color, #DCE7F0); margin: 6px 0; }

.dropdown-option-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.dropdown-option-btn:hover { background: var(--bg-gray, #F7FAFC); }
.dropdown-option-btn.text-purple { color: #7e22ce; font-weight: 600; }
.dropdown-option-btn.text-primary { color: var(--primary, #0B3C82); font-weight: 600; }
.dropdown-option-btn.text-danger { color: #dc2626; }

/* CONTAINER PRINCIPAL AMPLO */
.teen-content-container {
  max-width: 1560px;
  margin: 0 auto;
  padding: 32px 32px 64px;
}

/* BANNER DE BOAS-VINDAS CLEAN */
.teen-welcome-banner {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 20px;
  padding: 44px 52px;
  display: flex;
  gap: 40px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 36px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05));
}

.welcome-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--primary-light, #E8F0FA);
  color: var(--primary, #0B3C82);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 12px;
}

.welcome-left-col h1 {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-dark, #0B3C82);
  margin-bottom: 8px;
}

.welcome-left-col p {
  font-size: 14px;
  color: var(--text-gray, #5A6A7B);
  max-width: 580px;
  margin-bottom: 20px;
}

.welcome-buttons-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.btn-cta-main {
  font-weight: 700;
  padding: 12px 22px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.btn-secondary-clean {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  color: var(--primary, #0B3C82);
  padding: 12px 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-secondary-clean:hover { background: var(--bg-gray, #F7FAFC); }

.info-pill-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.info-pill-item {
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  padding: 12px 18px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 240px;
}

.info-pill-item i { font-size: 22px; }
.info-pill-item i.icon-blue { color: #215cff; }
.info-pill-item i.icon-green { color: #16a34a; }
.info-pill-item i.icon-orange { color: #d97706; }

.info-pill-item strong { font-size: 13px; color: var(--text-dark, #0B3C82); display: block; }
.info-pill-item small { font-size: 11px; color: var(--text-gray, #5A6A7B); }

/* SEÇÕES DE CURSOS */
.section-heading-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 20px;
}

.section-heading-row h2 {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
}

.section-heading-row p {
  font-size: 13px;
  color: var(--text-gray, #5A6A7B);
}

.btn-link-clean {
  background: transparent;
  border: none;
  color: var(--primary, #0B3C82);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.courses-white-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 24px;
}

.course-white-card {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05));
  transition: var(--transition, all 0.2s);
}

.course-white-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md, 0 4px 6px -1px rgba(0,0,0,0.05));
  border-color: #cbd5e1;
}

.card-cover-image {
  height: 160px;
  background-size: cover;
  background-position: center;
  position: relative;
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.card-cover-image::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(11, 60, 130, 0.6) 100%);
}

.cover-flag-pill, .cover-tag-pill {
  position: relative;
  z-index: 2;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
}

.cover-flag-pill {
  background: rgba(11, 60, 130, 0.85);
  color: white;
}

.cover-tag-pill {
  background: #f59e0b;
  color: #78350f;
}

.card-main-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.card-meta-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.meta-badge {
  font-size: 11px;
  font-weight: 600;
  background: var(--bg-gray, #F7FAFC);
  color: var(--text-gray, #5A6A7B);
  padding: 3px 8px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.meta-badge.star-badge {
  background: #fefce8;
  color: #854d0e;
}

.course-card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
  margin-bottom: 6px;
}

.course-card-desc {
  font-size: 12px;
  color: var(--text-gray, #5A6A7B);
  margin-bottom: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.course-stats-bar {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--primary, #0B3C82);
  font-weight: 600;
  background: var(--primary-light, #E8F0FA);
  padding: 8px 12px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.card-footer-box {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--border-color, #DCE7F0);
}

.instructor-mini-profile {
  display: flex;
  align-items: center;
  gap: 10px;
}

.instructor-mini-profile img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--border-color, #DCE7F0);
}

.instructor-mini-profile strong {
  font-size: 13px;
  color: var(--text-dark, #0B3C82);
  display: block;
}

.instructor-mini-profile small {
  font-size: 11px;
  color: var(--text-gray, #5A6A7B);
  display: block;
}

.btn-block-watch {
  width: 100%;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 16px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 2px 4px rgba(11, 60, 130, 0.1);
  transition: all 0.2s ease;
}

.btn-block-watch:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(11, 60, 130, 0.15);
}

/* FILTROS */
.filters-white-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.filters-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  width: 100%;
  flex-wrap: wrap;
}

.categories-pills-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.lang-pills-row {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.btn-filter-pill {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  color: var(--text-gray, #5A6A7B);
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-filter-pill.active {
  background: var(--primary, #0B3C82);
  color: white;
  border-color: var(--primary, #0B3C82);
}

.search-input-box {
  position: relative;
  min-width: 240px;
}

.search-input-box i {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
}

.search-input-box input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 10px;
  font-size: 13px;
  outline: none;
}

/* ================================================================= */
/* TELA DE ASSISTIR O CURSO (VÍDEO + MÓDULOS & AULAS EM DROPDOWN) */
/* ================================================================= */
.watch-top-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 16px;
}

.btn-sm-back {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.watch-course-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge-lang-clean {
  background: var(--primary, #0B3C82);
  color: white;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.watch-course-heading h2 {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
}

.watch-layout-grid {
  display: grid;
  grid-template-columns: 1fr 440px;
  gap: 32px;
}

/* Player Frame */
.video-display-card {
  position: relative;
  padding-bottom: 56.25%;
  height: 0;
  background: black;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  margin-bottom: 16px;
}

.video-iframe-embed {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.video-empty-notice {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #94a3b8;
  font-size: 14px;
}

.lesson-info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  padding: 16px 20px;
  border-radius: 14px;
  border: 1px solid var(--border-color, #DCE7F0);
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
}

.module-indicator {
  font-size: 11px;
  font-weight: 700;
  color: #215cff;
  display: block;
}

.lesson-title-box h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
  margin: 2px 0;
}

.lesson-meta-badges-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lesson-meta-badges-line small {
  font-size: 11px;
  color: var(--text-gray, #5A6A7B);
}

.badge-completed-pill {
  font-size: 11px;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
  padding: 2px 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.lesson-actions-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-complete-toggle {
  background: var(--primary, #0B3C82);
  color: white;
  border: none;
  font-weight: 600;
  font-size: 12px;
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-complete-toggle.is_completed {
  background: #16a34a;
}

.nav-arrows-box { display: flex; gap: 4px; }
.btn-arrow {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  color: var(--primary, #0B3C82);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Abas da Aula */
.lesson-tabs-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-color, #DCE7F0);
  overflow: hidden;
}

.tabs-header-bar {
  display: flex;
  gap: 4px;
  padding: 8px 12px;
  background: var(--bg-gray, #F7FAFC);
  border-bottom: 1px solid var(--border-color, #DCE7F0);
  overflow-x: auto;
}

.tab-nav-btn {
  padding: 8px 14px;
  border: none;
  background: transparent;
  color: var(--text-gray, #5A6A7B);
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.tab-nav-btn.active {
  background: white;
  color: var(--primary, #0B3C82);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.tab-body-wrapper {
  padding: 20px;
}

.tab-body-wrapper h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
  margin-bottom: 14px;
}

/* Vocabulário */
.vocab-clean-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.vocab-item-card {
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 10px;
  padding: 12px;
}

.vocab-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.vocab-item-header strong { font-size: 14px; color: var(--primary, #0B3C82); }

.btn-audio-speak-clean {
  background: var(--primary-light, #E8F0FA);
  border: 1px solid #bfdbfe;
  color: var(--primary, #0B3C82);
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
}

.vocab-definition { font-size: 12px; color: var(--text-gray, #5A6A7B); margin-bottom: 4px; }
.vocab-example-quote { font-size: 11px; color: #94a3b8; font-style: italic; display: block; }

/* Materiais da Aula */
.materials-list-clean {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.material-row-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-gray, #F7FAFC);
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid var(--border-color, #DCE7F0);
}

.mat-left-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mat-icon-square {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #fee2e2;
  color: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.mat-left-info strong { display: block; font-size: 13px; color: var(--text-dark, #0B3C82); }
.mat-left-info small { font-size: 11px; color: var(--text-gray, #5A6A7B); }

/* Quiz */
.quiz-clean-box {
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 12px;
  padding: 16px;
}

.quiz-options-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 14px 0;
}

.quiz-option-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 8px;
  color: var(--text-dark, #0B3C82);
  cursor: pointer;
  text-align: left;
  font-size: 13px;
}

.quiz-option-pill.selected { border-color: var(--primary, #0B3C82); background: var(--primary-light, #E8F0FA); }
.quiz-option-pill.correct { border-color: #16a34a; background: #dcfce7; }
.quiz-option-pill.wrong { border-color: #dc2626; background: #fee2e2; }

.letter-badge {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-gray, #F7FAFC);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.quiz-feedback-banner {
  margin-top: 12px;
  padding: 10px;
  border-radius: 6px;
  background: #fee2e2;
  color: #991b1b;
  font-size: 12px;
}

.quiz-feedback-banner.is_correct {
  background: #dcfce7;
  color: #166534;
}

.text-gray-clean { font-size: 13px; color: var(--text-gray, #5A6A7B); }

/* SIDEBAR DE MÓDULOS E AULAS COM DROPDOWN INTERATIVO */
.course-modules-panel {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 16px;
  overflow: hidden;
  position: sticky;
  top: 80px;
  box-shadow: var(--shadow-sm);
}

.modules-panel-header {
  padding: 14px 18px;
  background: var(--bg-gray, #F7FAFC);
  border-bottom: 1px solid var(--border-color, #DCE7F0);
}

.modules-panel-header h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-dark, #0B3C82);
}

.modules-panel-header small { font-size: 11px; color: var(--text-gray, #5A6A7B); }

.modules-list-scroll {
  max-height: 580px;
  overflow-y: auto;
}

.module-accordion-group {
  border-bottom: 1px solid var(--border-color, #DCE7F0);
}

.module-accordion-group:last-child { border-bottom: none; }

/* CABEÇALHO DO MÓDULO (CLIQUE ABRE/FECHA) */
.module-group-heading {
  padding: 12px 16px;
  background: var(--bg-gray, #F7FAFC);
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: var(--transition, all 0.2s);
  user-select: none;
}

.module-group-heading:hover {
  background: #eef4fb;
}

.heading-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.mod-number-tag {
  font-size: 9px;
  font-weight: 700;
  color: var(--primary, #0B3C82);
  background: var(--primary-light, #E8F0FA);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  align-self: flex-start;
}

.mod-title-text {
  font-size: 13px;
  color: var(--text-dark, #0B3C82);
}

.mod-completed-badge {
  font-size: 10px;
  font-weight: 700;
  color: #16a34a;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.caret-toggle-icon {
  font-size: 16px;
  color: var(--text-gray, #5A6A7B);
  margin-left: 8px;
}

/* LISTA DE AULAS DO MÓDULO */
.module-lessons-group {
  display: flex;
  flex-direction: column;
  background: white;
  border-top: 1px solid var(--border-color, #DCE7F0);
}

.lesson-click-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid #f1f5f9;
  cursor: pointer;
  transition: var(--transition);
}

.lesson-click-item:last-child {
  border-bottom: none;
}

.lesson-click-item:hover { background: var(--bg-gray, #F7FAFC); }

.lesson-click-item.active {
  background: var(--primary-light, #E8F0FA);
  border-left: 3px solid var(--primary, #0B3C82);
}

.lesson-state-icon {
  font-size: 16px;
  color: #94a3b8;
  flex-shrink: 0;
}

.lesson-text-content {
  flex: 1;
}

.lesson-text-content strong {
  display: block;
  font-size: 12px;
  color: var(--text-dark, #0B3C82);
}

.lesson-bottom-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.lesson-bottom-meta small {
  font-size: 10px;
  color: var(--text-gray, #5A6A7B);
}

.lesson-done-tag {
  font-size: 9px;
  font-weight: 700;
  background: #dcfce7;
  color: #166534;
  padding: 1px 6px;
  border-radius: 4px;
}

.icon-green { color: #16a34a; }
.icon-blue { color: #215cff; }

/* CENTRAL DE MATERIAIS */
.materials-white-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.material-white-card {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  position: relative;
  box-shadow: var(--shadow-sm);
}

.mat-card-header-tag {
  position: absolute;
  top: 14px;
  right: 14px;
  background: var(--primary-light, #E8F0FA);
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  color: var(--primary, #0B3C82);
}

.mat-square-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  margin-bottom: 12px;
}

.mat-square-icon.pdf { background: #fee2e2; color: #dc2626; }
.mat-square-icon.audio { background: #f3e8ff; color: #7e22ce; }
.mat-square-icon.zip { background: #fef3c7; color: #d97706; }

.mat-card-body-text h3 { font-size: 15px; font-weight: 700; color: var(--text-dark, #0B3C82); margin-bottom: 4px; }
.mat-card-body-text p { font-size: 12px; color: var(--text-gray, #5A6A7B); margin-bottom: 8px; }
.size-pill { font-size: 10px; font-weight: 700; color: #16a34a; margin-bottom: 6px; display: block; }
.course-ref { font-size: 11px; color: #94a3b8; margin-bottom: 14px; display: block; }

.btn-block-mat {
  margin-top: auto;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

/* MODAL ADMIN */
.teen-admin-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 60, 130, 0.4);
  backdrop-filter: blur(4px);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.teen-admin-modal-card {
  background: white;
  width: 100%;
  max-width: 1100px;
  height: 88vh;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-admin-top {
  background: var(--bg-gray, #F7FAFC);
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color, #DCE7F0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.admin-modal-title { display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--text-dark, #0B3C82); }

.btn-close-modal-admin {
  background: white;
  border: 1px solid var(--border-color, #DCE7F0);
  color: var(--text-dark, #0B3C82);
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.admin-modal-body { flex: 1; overflow-y: auto; padding: 20px; }

/* CELEBRAÇÃO XP BRANCA */
.celebration-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 60, 130, 0.5);
  backdrop-filter: blur(4px);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
}

.celebration-white-card {
  background: white;
  border: 2px solid var(--primary, #0B3C82);
  padding: 36px 40px;
  border-radius: 20px;
  text-align: center;
  box-shadow: 0 20px 30px rgba(0, 0, 0, 0.2);
}

.celebration-emoji-icon { font-size: 44px; margin-bottom: 10px; }
.celebration-white-card h2 { font-size: 22px; font-weight: 800; color: var(--text-dark, #0B3C82); margin-bottom: 6px; }
.celebration-white-card p { font-size: 13px; color: var(--text-gray, #5A6A7B); margin-bottom: 18px; }

.badge-done-celebration {
  background: #dcfce7;
  color: #166534;
  font-size: 14px;
  font-weight: 700;
  padding: 8px 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* TOPBAR ACTIONS */
.teen-topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-mobile-hamburger {
  display: none;
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  width: 38px;
  height: 38px;
  border-radius: 10px;
  color: var(--text-dark, #0B3C82);
  font-size: 22px;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.btn-mobile-hamburger:hover {
  background: var(--primary-light, #E8F0FA);
  color: var(--primary, #0B3C82);
}

/* MENU GAVETA LATERAL MOBILE (DRAWER) */
.mobile-drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 60, 130, 0.45);
  backdrop-filter: blur(4px);
  z-index: 99999;
  display: flex;
  justify-content: flex-start;
}

.mobile-drawer-card {
  background: white;
  width: 84%;
  max-width: 320px;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 4px 0 25px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
  padding: 20px 16px;
  box-sizing: border-box;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color, #DCE7F0);
  margin-bottom: 16px;
}

.btn-close-drawer {
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--text-dark, #0B3C82);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-profile-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-gray, #F7FAFC);
  border: 1px solid var(--border-color, #DCE7F0);
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 20px;
}

.avatar-emoji-large {
  font-size: 26px;
}

.drawer-profile-box strong {
  display: block;
  font-size: 13px;
  color: var(--text-dark, #0B3C82);
}

.drawer-profile-box small {
  font-size: 11px;
  color: var(--text-gray, #5A6A7B);
}

.drawer-nav-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drawer-nav-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: var(--text-dark, #0B3C82);
  font-size: 14px;
  font-weight: 600;
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.drawer-nav-btn i {
  font-size: 20px;
  color: var(--primary, #0B3C82);
}

.drawer-nav-btn:hover {
  background: var(--bg-gray, #F7FAFC);
}

.drawer-nav-btn.active {
  background: var(--primary-light, #E8F0FA);
  color: var(--primary, #0B3C82);
  font-weight: 700;
}

.drawer-divider {
  height: 1px;
  background: var(--border-color, #DCE7F0);
  margin: 12px 0;
}

.drawer-nav-btn.text-purple { color: #7e22ce; }
.drawer-nav-btn.text-purple i { color: #7e22ce; }
.drawer-nav-btn.text-primary { color: var(--primary, #0B3C82); }
.drawer-nav-btn.text-danger { color: #dc2626; }
.drawer-nav-btn.text-danger i { color: #dc2626; }

/* BARRA FIXA INFERIOR NO MOBILE */
.teen-bottom-mobile-nav {
  display: none;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: white;
  border-top: 1px solid var(--border-color, #DCE7F0);
  z-index: 1000;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.05);
  justify-content: space-around;
  align-items: center;
  padding: 0 8px;
}

.bottom-nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-gray, #5A6A7B);
  font-size: 10px;
  font-weight: 600;
  gap: 3px;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  flex: 1;
}

.bottom-nav-btn i {
  font-size: 20px;
}

.bottom-nav-btn.active {
  color: var(--primary, #0B3C82);
  font-weight: 700;
}

/* RESPONSIVO COMPLETO (MOBILE FIRST SOBERANO) */
@media (max-width: 900px) {
  .desktop-only-nav {
    display: none !important;
  }

  .btn-mobile-hamburger {
    display: flex !important;
  }

  .teen-topbar {
    padding: 0 16px !important;
    height: 58px !important;
  }

  .teen-topbar-container {
    height: 58px !important;
  }

  .teen-brand-logo {
    max-height: 30px !important;
  }

  .teen-user-avatar-btn .user-first-name {
    display: none !important;
  }

  .teen-bottom-mobile-nav {
    display: flex !important;
  }

  .teen-content-container {
    padding: 16px 14px 85px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    overflow-x: hidden !important;
  }

  .teen-welcome-banner {
    padding: 24px 18px !important;
    gap: 20px !important;
    flex-direction: column !important;
    width: 100% !important;
    box-sizing: border-box !important;
    margin-bottom: 24px !important;
  }

  .welcome-left-col h1 {
    font-size: 20px !important;
    line-height: 1.3 !important;
  }

  .welcome-buttons-row {
    flex-direction: column !important;
    width: 100% !important;
    gap: 8px !important;
  }

  .welcome-buttons-row button {
    width: 100% !important;
    justify-content: center !important;
  }

  .info-pill-box {
    width: 100% !important;
  }

  .info-pill-item {
    min-width: unset !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .section-heading-row {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 8px !important;
  }

  .filters-white-bar {
    width: 100% !important;
    box-sizing: border-box !important;
    gap: 10px !important;
  }

  .filters-top-row {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 10px !important;
  }

  .categories-pills-row, .lang-pills-row {
    width: 100% !important;
    overflow-x: auto !important;
    flex-wrap: nowrap !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    padding-bottom: 4px !important;
  }

  .categories-pills-row::-webkit-scrollbar, .lang-pills-row::-webkit-scrollbar {
    display: none;
  }

  .search-input-box {
    width: 100% !important;
    min-width: unset !important;
  }

  .courses-white-grid {
    grid-template-columns: 1fr !important;
    gap: 18px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .materials-white-grid {
    grid-template-columns: 1fr !important;
    gap: 14px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  /* TELA DE ASSISTIR NO MOBILE */
  .watch-layout-grid {
    grid-template-columns: 1fr !important;
    gap: 20px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }

  .watch-top-bar {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 10px !important;
  }

  .lesson-info-bar {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 14px !important;
    padding: 14px 16px !important;
  }

  .lesson-actions-group {
    width: 100% !important;
    justify-content: space-between !important;
  }

  .tabs-header-bar {
    overflow-x: auto !important;
    flex-wrap: nowrap !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    padding: 6px 8px !important;
  }

  .vocab-clean-grid {
    grid-template-columns: 1fr !important;
    width: 100% !important;
  }

  .course-modules-panel {
    position: static !important;
  }

  .teen-admin-modal-card {
    width: 100vw !important;
    height: 100vh !important;
    max-width: 100vw !important;
    border-radius: 0 !important;
  }
}
</style>
