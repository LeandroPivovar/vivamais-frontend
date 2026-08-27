<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import LoginView from './components/LoginView.vue'
import DashboardView from './components/DashboardView.vue'
import AdminView from './components/AdminView.vue'
import DependentesView from './components/DependentesView.vue'
import HerdeiroView from './components/HerdeiroView.vue'
import SuporteView from './components/SuporteView.vue'
import ChatAoVivoView from './components/ChatAoVivoView.vue'
import CheckoutView from './components/CheckoutView.vue'
import KidsView from './components/kids/KidsView.vue'
import TeenView from './components/teen/TeenView.vue'
import { api, getToken, clearToken } from './services/api'
import { getSocket, disconnectSocket } from './services/socket'

// Abas bloqueadas para dependentes (sem parte financeira nem gestão de dependentes).
const DEPENDENT_BLOCKED_TABS = ['financeiro', 'indicacoes', 'dependentes', 'herdeiro']

const isLoggedIn = ref(false)
const currentUser = ref(null)
const restoringSession = ref(true)

// Checkout público: visitante que chega por link de indicação (?ref=... ou /plano-*).
const showPublicCheckout = ref(false)

// Abas de navegação: 'home', 'perfil', 'financeiro'
const currentTab = ref('home')
const tabsWithBottomNavigation = ['perfil', 'indicacoes']
const shouldLiftFloatingChat = computed(() => tabsWithBottomNavigation.includes(currentTab.value))

// Modo de layout de visualização: 'desktop' ou 'pwa' (inicializado dinamicamente pelo tamanho da tela)
const layoutMode = ref(window.innerWidth < 768 ? 'pwa' : 'desktop')

// Dropdown de perfil no Desktop
const showDropdown = ref(false)

// Dropdown de Indicações no Mobile
const activeRefTab = ref('visaoGeral')
const showRefMenuDropdown = ref(false)
const isMobileMenuClosing = ref(false)
const profileMenuRef = ref(null)
const mobileMenuRef = ref(null)
const chatPanelRef = ref(null)
const chatButtonRef = ref(null)

// Modal Global de Desenvolvimento
const showDevModal = ref(false)
const devModalData = ref({ title: '', message: '' })

const handleResize = () => {
  layoutMode.value = window.innerWidth < 768 ? 'pwa' : 'desktop'
}

const shouldRedirectToPayment = (user) => user?.role !== 'admin' && !user?.isDependent && user?.active === false
const KIDS_TEEN_SESSION_KEY = 'viva_kidsteen_session'
const kidsTeenSessionModule = () => {
  try {
    const session = JSON.parse(localStorage.getItem(KIDS_TEEN_SESSION_KEY) || 'null')
    return session?.module === 'kids' || session?.module === 'teen' ? session.module : null
  } catch {
    return null
  }
}
const isKidsPath = (path, hash = '') => path.startsWith('/kids') || hash.startsWith('#/kids')
const isTeenPath = (path, hash = '') => path.startsWith('/teen') || path.startsWith('/teens') || hash.startsWith('#/teen') || hash.startsWith('#/teens')

// Controla scroll do body quando modal está aberto
watch(showDevModal, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})

const handleLogin = (userData) => {
  currentUser.value = userData
  isLoggedIn.value = true

  const path = window.location.pathname
  const hash = window.location.hash

  if (currentTab.value === 'teen-auth' || currentTab.value === 'teen' || isTeenPath(path, hash)) {
    currentTab.value = 'teen-auth'
    window.history.pushState({ tab: 'teen-auth' }, '', '/teen/auth')
  } else if (currentTab.value === 'kids-auth' || currentTab.value === 'kids' || isKidsPath(path, hash)) {
    currentTab.value = 'kids-auth'
    window.history.pushState({ tab: 'kids-auth' }, '', '/kids/auth')
  } else {
    const tab = shouldRedirectToPayment(userData) ? 'financeiro' : 'home'
    currentTab.value = tab
    window.history.pushState({ tab }, '', tab === 'financeiro' ? '/financeiro' : '/')
  }

  initFloatingChat()
}

let loggingOut = false

const logoutRedirects = {
  'kids-auth': '/kids/auth',
  'teen-auth': '/teen/auth',
}

const handleLogout = async (redirectTab = 'home') => {
  if (loggingOut) return
  loggingOut = true
  try {
    const targetTab = Object.prototype.hasOwnProperty.call(logoutRedirects, redirectTab) ? redirectTab : 'home'
    if (getToken()) {
      try {
        await api.post('/auth/logout')
      } catch {
        // token já pode estar expirado/inválido — segue com o logout local de qualquer forma
      }
    }
    clearToken()
    disconnectSocket()
    chatSock = null
    showChatPanel.value = false
    chatHasUnread.value = false
    currentUser.value = null
    isLoggedIn.value = false
    currentTab.value = targetTab
    showDropdown.value = false
    window.history.pushState({ tab: targetTab }, '', logoutRedirects[targetTab] || '/')
  } finally {
    loggingOut = false
  }
}

const handleUpdateUser = (updatedData) => {
  currentUser.value = updatedData
}

let mobileMenuCloseTimer = null

const openMainMobileMenu = () => {
  if (mobileMenuCloseTimer) clearTimeout(mobileMenuCloseTimer)
  isMobileMenuClosing.value = false
  showRefMenuDropdown.value = true
}

const closeMainMobileMenu = (afterClose) => {
  if (!showRefMenuDropdown.value && !isMobileMenuClosing.value) {
    if (afterClose) afterClose()
    return
  }
  isMobileMenuClosing.value = true
  mobileMenuCloseTimer = setTimeout(() => {
    showRefMenuDropdown.value = false
    isMobileMenuClosing.value = false
    if (afterClose) afterClose()
  }, 240)
}

const toggleMainMobileMenu = () => {
  if (showRefMenuDropdown.value) closeMainMobileMenu()
  else openMainMobileMenu()
}

const mobileNavigateTo = (tab) => {
  closeMainMobileMenu(() => navigateTo(tab))
}

const mobileLogout = () => {
  closeMainMobileMenu(() => handleLogout())
}

const navigateTo = (tab) => {
  if (tab === 'admin' && currentUser.value?.role !== 'admin') return
  // Dependente não acessa financeiro/indicações/dependentes.
  if (currentUser.value?.isDependent && DEPENDENT_BLOCKED_TABS.includes(tab)) return
  
  if (tab === 'kids' || tab === 'kids-dashboard') {
    currentTab.value = kidsTeenSessionModule() === 'kids' ? 'kids-dashboard' : 'kids-auth'
    showDropdown.value = false
    window.history.pushState({ tab: currentTab.value }, '', currentTab.value === 'kids-dashboard' ? '/kids/dashboard' : '/kids/auth')
    return
  }
  if (tab === 'kids-auth') {
    currentTab.value = 'kids-auth'
    showDropdown.value = false
    window.history.pushState({ tab: 'kids-auth' }, '', '/kids/auth')
    return
  }
  if (tab === 'teen' || tab === 'teen-dashboard') {
    currentTab.value = kidsTeenSessionModule() === 'teen' ? 'teen-dashboard' : 'teen-auth'
    showDropdown.value = false
    window.history.pushState({ tab: currentTab.value }, '', currentTab.value === 'teen-dashboard' ? '/teen/dashboard' : '/teen/auth')
    return
  }
  if (tab === 'teen-auth') {
    currentTab.value = 'teen-auth'
    showDropdown.value = false
    window.history.pushState({ tab: 'teen-auth' }, '', '/teen/auth')
    return
  }
  currentTab.value = tab
  showDropdown.value = false

  // Atualiza a URL sem recarregar a página
  let path = '/'
  if (tab === 'indicacoes') path = '/indicacoes'
  else if (tab === 'perfil') path = '/meu-perfil'
  else if (tab === 'financeiro') path = '/financeiro'
  else if (tab === 'dependentes') path = '/dependentes'
  else if (tab === 'herdeiro') path = '/herdeiro'
  else if (tab === 'suporte') path = '/suporte'
  else if (tab === 'chat') path = '/chat'
  else if (tab === 'admin' && currentUser.value?.role === 'admin') path = '/admin'

  window.history.pushState({ tab }, '', path)
}

const openDevModal = (data) => {
  devModalData.value = data
  showDevModal.value = true
}

// --- Botão flutuante de chat ao vivo (todas as páginas, exceto admin) ---
const showChatPanel = ref(false)
const chatHasUnread = ref(false)
let chatSock = null

const onFloatingChatMsg = (payload) => {
  if (payload?.message?.senderRole === 'admin' && !showChatPanel.value) chatHasUnread.value = true
}

const initFloatingChat = async () => {
  if (!isLoggedIn.value || currentUser.value?.role === 'admin') return
  try {
    const data = await api.get('/chat')
    if (data?.conversation?.unreadForUser > 0) chatHasUnread.value = true
  } catch { /* silencioso */ }
  chatSock = getSocket()
  chatSock.on('chat:message', onFloatingChatMsg)
}

const toggleChatPanel = () => {
  showChatPanel.value = !showChatPanel.value
  if (showChatPanel.value) chatHasUnread.value = false
}

const closeFloatingPanels = (event) => {
  if (profileMenuRef.value && !profileMenuRef.value.contains(event.target)) {
    showDropdown.value = false
  }
  if (mobileMenuRef.value && !mobileMenuRef.value.contains(event.target)) {
    closeMainMobileMenu()
  }
  const clickedChat = chatPanelRef.value?.contains(event.target) || chatButtonRef.value?.contains(event.target)
  if (!clickedChat) showChatPanel.value = false
}

const handleRouting = () => {
  const path = window.location.pathname
  const hash = window.location.hash

  if (path === '/admin' || hash === '#/admin') {
    currentTab.value = 'admin'
  } else if (path === '/kids/auth' || hash === '#/kids/auth') {
    currentTab.value = 'kids-auth'
  } else if (isKidsPath(path, hash)) {
    if (kidsTeenSessionModule() === 'kids') {
      currentTab.value = 'kids-dashboard'
    } else {
      currentTab.value = 'kids-auth'
      window.history.replaceState({ tab: 'kids-auth' }, '', '/kids/auth')
    }
  } else if (path === '/teen/auth' || path === '/teens/auth' || hash === '#/teen/auth' || hash === '#/teens/auth') {
    currentTab.value = 'teen-auth'
    if (path.startsWith('/teens')) window.history.replaceState({ tab: 'teen-auth' }, '', '/teen/auth')
  } else if (isTeenPath(path, hash)) {
    if (kidsTeenSessionModule() === 'teen') {
      currentTab.value = 'teen-dashboard'
      if (path.startsWith('/teens')) window.history.replaceState({ tab: 'teen-dashboard' }, '', '/teen/dashboard')
    } else {
      currentTab.value = 'teen-auth'
      window.history.replaceState({ tab: 'teen-auth' }, '', '/teen/auth')
    }
  } else if (path === '/indicacoes' || hash === '#/indicacoes') {
    currentTab.value = 'indicacoes'
  } else if (path === '/meu-perfil' || hash === '#/meu-perfil') {
    currentTab.value = 'perfil'
  } else if (path === '/financeiro' || hash === '#/financeiro') {
    currentTab.value = 'financeiro'
  } else if (path === '/dependentes' || hash === '#/dependentes') {
    currentTab.value = 'dependentes'
  } else if (path === '/herdeiro' || hash === '#/herdeiro') {
    currentTab.value = 'herdeiro'
  } else if (path === '/suporte' || hash === '#/suporte') {
    currentTab.value = 'suporte'
  } else if (path === '/chat' || hash === '#/chat') {
    currentTab.value = 'chat'
  } else {
    currentTab.value = 'home'
  }

  // Painel admin exige role real — sem sessão de admin válida, cai pra Home.
  if (currentTab.value === 'admin' && currentUser.value?.role !== 'admin') {
    currentTab.value = 'home'
    window.history.replaceState({}, '', '/')
  }
  // Dependente não acessa abas financeiras nem gestão de dependentes.
  if (currentUser.value?.isDependent && DEPENDENT_BLOCKED_TABS.includes(currentTab.value)) {
    currentTab.value = 'home'
    window.history.replaceState({}, '', '/')
  }
  if (shouldRedirectToPayment(currentUser.value) && currentTab.value !== 'financeiro') {
    currentTab.value = 'financeiro'
    window.history.replaceState({ tab: 'financeiro' }, '', '/financeiro')
  }
}

const onUnauthorized = () => {
  handleLogout()
}

onMounted(async () => {
  document.addEventListener('click', closeFloatingPanels)
  window.addEventListener('auth:unauthorized', onUnauthorized)

  const token = getToken()
  if (token) {
    try {
      currentUser.value = await api.get('/users/me')
      isLoggedIn.value = true
    } catch {
      clearToken()
      currentUser.value = null
      isLoggedIn.value = false
    }
  } else {
    currentUser.value = null
    isLoggedIn.value = false
  }
  restoringSession.value = false

  if (isLoggedIn.value) initFloatingChat()

  // Link de indicação (?ref= ou /plano-*) ou link 30 dias e sem sessão → abre o checkout público.
  const hasRef = new URLSearchParams(window.location.search).has('ref')
  const isPlanPath = /\/plano-[a-z0-9-]+/i.test(window.location.pathname)
  const isTrialPath = /\/cadastro-30-dias\/[a-z0-9]+/i.test(window.location.pathname)
  if (!isLoggedIn.value && (hasRef || isPlanPath || isTrialPath)) {
    showPublicCheckout.value = true
  } else {
    handleRouting()
  }
  window.addEventListener('popstate', handleRouting)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeFloatingPanels)
  window.removeEventListener('auth:unauthorized', onUnauthorized)
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('popstate', handleRouting)
})
</script>

<template>


  <!-- Restaurando sessão a partir do token salvo -->
  <div v-if="restoringSession" class="session-loading">Carregando...</div>

  <!-- Rota Viva Mais Kids (/kids, /kids/auth, /kids/dashboard) -->
  <KidsView
    v-else-if="currentTab === 'kids-dashboard' || currentTab === 'kids-auth' || currentTab === 'kids'"
    :user="currentUser"
    :isLoggedIn="isLoggedIn"
    :subRoute="currentTab === 'kids-auth' ? 'auth' : 'dashboard'"
    @goHome="navigateTo('home')"
    @login="handleLogin"
    @logout="handleLogout"
    @triggerDevModal="openDevModal"
  />

  <!-- Rota Viva Mais Teen (/teen, /teen/auth, /teen/dashboard) -->
  <TeenView
    v-else-if="currentTab === 'teen-dashboard' || currentTab === 'teen-auth' || currentTab === 'teen'"
    :user="currentUser"
    :isLoggedIn="isLoggedIn"
    :subRoute="currentTab === 'teen-auth' ? 'auth' : 'dashboard'"
    @goHome="navigateTo('home')"
    @login="handleLogin"
    @logout="handleLogout"
    @triggerDevModal="openDevModal"
  />

  <!-- Visitante via link de indicação: checkout público (cadastro + pagamento) -->
  <CheckoutView v-else-if="!isLoggedIn && showPublicCheckout" @goLogin="showPublicCheckout = false" />

  <!-- Estado Deslogado: Tela de Login -->
  <LoginView v-else-if="!isLoggedIn" @login="handleLogin" />

  <!-- Estado Logado: Layouts Adaptativos -->
  <div v-else class="app-layout">
    
    <!-- VERSÃO DESKTOP -->
    <div v-if="layoutMode === 'desktop'" class="desktop-layout" :class="{ 'dashboard-showcase': currentTab === 'home' }">
      <!-- Navbar Superior Desktop (Fundo escuro sem nav central) -->
      <header class="topbar-desktop">
        <div class="topbar-container">
          <div class="logo-area" @click="navigateTo('home')" style="cursor: pointer;">
            <img src="/logo.png" alt="Viva Mais" class="brand-logo" />
          </div>

          <!-- Avatar com Dropdown de Opções (Navegação apenas pelo menu) -->
          <div ref="profileMenuRef" class="user-profile-wrapper">
            <div class="user-profile-area" @click="showDropdown = !showDropdown">
              <div class="avatar-circle">
                {{ currentUser.name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('') }}
              </div>
              <span class="profile-name">{{ currentUser.name }}</span>
              <i class="ph ph-caret-down"></i>
            </div>

            <!-- Menu Dropdown -->
            <div v-if="showDropdown" class="dropdown-menu">
              <div class="dropdown-header">
                <strong>{{ currentUser.name }}</strong>
                <span>{{ currentUser.plan }}</span>
              </div>
              <div class="dropdown-divider"></div>
              
              <button class="dropdown-item" @click="navigateTo('home')">
                <i class="ph ph-squares-four"></i> Visão Geral
              </button>
              <button class="dropdown-item" @click="navigateTo('perfil')">
                <i class="ph ph-user"></i> Minha Conta
              </button>
              <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="navigateTo('financeiro')">
                <i class="ph ph-credit-card"></i> Financeiro
              </button>
              <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="navigateTo('dependentes')">
                <i class="ph ph-users"></i> Dependentes
              </button>
              <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="navigateTo('herdeiro')">
                <i class="ph ph-identification-card"></i> Herdeiro
              </button>
              <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="navigateTo('indicacoes')">
                <i class="ph ph-users-three"></i> Indicações
              </button>
              <button class="dropdown-item" @click="navigateTo('suporte')">
                <i class="ph ph-headset"></i> Suporte
              </button>
              <button class="dropdown-item" @click="navigateTo('chat')">
                <i class="ph ph-chat-circle-dots"></i> Chat ao vivo
              </button>
              <button v-if="currentUser?.role === 'admin'" class="dropdown-item" @click="navigateTo('admin')">
                <i class="ph ph-shield-check"></i> Painel Admin
              </button>
              <div class="dropdown-divider"></div>
              <button class="dropdown-item text-red" @click="handleLogout">
                <i class="ph ph-sign-out"></i> Sair da Conta
              </button>
            </div>
          </div>
        </div>
      </header>

      <!-- Conteúdo Desktop -->
      <main class="desktop-main container">
        <AdminView
          v-if="currentTab === 'admin'"
          :layoutMode="'desktop'"
          @triggerDevModal="openDevModal"
        />
        <DependentesView
          v-else-if="currentTab === 'dependentes'"
          :plan="currentUser?.plan"
          @triggerDevModal="openDevModal"
        />
        <HerdeiroView
          v-else-if="currentTab === 'herdeiro'"
          @triggerDevModal="openDevModal"
        />
        <SuporteView v-else-if="currentTab === 'suporte'" />
        <ChatAoVivoView v-else-if="currentTab === 'chat'" />
        <DashboardView
          v-else
          :user="currentUser"
          :layoutMode="'desktop'"
          :currentTab="currentTab"
          @updateUser="handleUpdateUser"
          @logout="handleLogout"
          @triggerDevModal="openDevModal"
          @changeTab="navigateTo"
        />
      </main>

      <nav v-if="currentTab === 'indicacoes'" class="desktop-ref-bottom-nav">
        <button
          :class="['ref-bottom-tab', { active: activeRefTab === 'visaoGeral' }]"
          @click="activeRefTab = 'visaoGeral'"
        >
          <i class="ph ph-chart-pie-slice"></i>
          <span>Visão</span>
        </button>
        <button
          :class="['ref-bottom-tab', { active: activeRefTab === 'indicados' }]"
          @click="activeRefTab = 'indicados'"
        >
          <i class="ph ph-users"></i>
          <span>Indicados</span>
        </button>
        <button
          :class="['ref-bottom-tab', { active: activeRefTab === 'financeiroRef' }]"
          @click="activeRefTab = 'financeiroRef'"
        >
          <i class="ph ph-hand-coins"></i>
          <span>Financeiro</span>
        </button>
        <button
          :class="['ref-bottom-tab', { active: activeRefTab === 'links' }]"
          @click="activeRefTab = 'links'"
        >
          <i class="ph ph-link"></i>
          <span>Links</span>
        </button>
      </nav>
    </div>

    <!-- VERSÃO PWA MOBILE (SIMULADOR) -->
    <div v-else class="pwa-layout">
      <div class="pwa-simulator">
        <!-- Status Bar -->
        <div class="pwa-status-bar">
          <span class="device-time">14:04</span>
          <div class="device-icons">
            <i class="ph ph-wifi-high"></i>
            <i class="ph ph-battery-full"></i>
          </div>
        </div>

        <!-- Cabeçalho PWA -->
        <header
          class="pwa-header"
          :class="{ 'menu-open': showRefMenuDropdown }"
        >
          <div class="pwa-logo-area" @click="navigateTo('home')">
            <img src="/logo.png" alt="Viva Mais" class="pwa-logo" />
          </div>
          
          <!-- Menu mobile principal -->
          <div ref="mobileMenuRef" class="pwa-menu-wrap">
            <button class="pwa-menu-toggle" @click.stop="toggleMainMobileMenu" aria-label="Abrir menu">
              <i class="ph ph-list"></i>
            </button>
            
            <div
              v-if="showRefMenuDropdown || isMobileMenuClosing"
              :class="['mobile-main-menu-overlay', { closing: isMobileMenuClosing }]"
              @click.self="closeMainMobileMenu"
            >
              <div :class="['mobile-main-menu-drawer', { closing: isMobileMenuClosing }]">
                <div class="mobile-main-menu-head">
                  <img src="/logo.png" alt="Viva Mais" class="pwa-logo" />
                  <button class="mobile-main-menu-close" @click="closeMainMobileMenu" aria-label="Fechar menu">
                    <i class="ph ph-x"></i>
                  </button>
                </div>

                <button class="dropdown-item" @click="mobileNavigateTo('home')">
                  <i class="ph ph-squares-four"></i> Visão Geral
                </button>
                <button class="dropdown-item" @click="mobileNavigateTo('perfil')">
                  <i class="ph ph-user"></i> Minha Conta
                </button>
                <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="mobileNavigateTo('financeiro')">
                  <i class="ph ph-credit-card"></i> Financeiro
                </button>
                <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="mobileNavigateTo('dependentes')">
                  <i class="ph ph-users"></i> Dependentes
                </button>
                <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="mobileNavigateTo('herdeiro')">
                  <i class="ph ph-identification-card"></i> Herdeiro
                </button>
                <button v-if="!currentUser?.isDependent" class="dropdown-item" @click="mobileNavigateTo('indicacoes')">
                  <i class="ph ph-users-three"></i> Indicações
                </button>
                <button class="dropdown-item" @click="mobileNavigateTo('suporte')">
                  <i class="ph ph-headset"></i> Suporte
                </button>
                <button class="dropdown-item" @click="mobileNavigateTo('chat')">
                  <i class="ph ph-chat-circle-dots"></i> Chat ao vivo
                </button>
                <button v-if="currentUser?.role === 'admin'" class="dropdown-item" @click="mobileNavigateTo('admin')">
                  <i class="ph ph-shield-check"></i> Painel Admin
                </button>

                <div class="dropdown-divider"></div>
                <button class="dropdown-item text-red" @click="mobileLogout">
                  <i class="ph ph-sign-out"></i> Sair da Conta
                </button>
              </div>
            </div>
          </div>
        </header>

        <!-- Corpo do PWA -->
        <main class="main-content">
          <AdminView
            v-if="currentTab === 'admin'"
            :layoutMode="'pwa'"
            @triggerDevModal="openDevModal"
          />
          <DependentesView
            v-else-if="currentTab === 'dependentes'"
            :plan="currentUser?.plan"
            @triggerDevModal="openDevModal"
          />
          <HerdeiroView
            v-else-if="currentTab === 'herdeiro'"
            @triggerDevModal="openDevModal"
          />
          <SuporteView v-else-if="currentTab === 'suporte'" />
          <ChatAoVivoView v-else-if="currentTab === 'chat'" />
          <DashboardView
            v-else
            :user="currentUser"
            :layoutMode="'pwa'"
            :currentTab="currentTab"
            :activeRefTab="activeRefTab"
            @updateUser="handleUpdateUser"
            @logout="handleLogout"
            @triggerDevModal="openDevModal"
            @changeTab="navigateTo"
            @changeRefTab="(tab) => activeRefTab = tab"
          />
        </main>

        <!-- Menu de Navegação Inferior PWA -->
        <nav v-if="currentTab === 'indicacoes'" class="pwa-bottom-nav pwa-ref-tabs-nav">
          <button
            :class="['pwa-nav-item', { active: activeRefTab === 'visaoGeral' }]"
            @click="activeRefTab = 'visaoGeral'"
          >
            <i class="ph ph-chart-pie-slice"></i>
            <span>Visão</span>
          </button>
          <button
            :class="['pwa-nav-item', { active: activeRefTab === 'indicados' }]"
            @click="activeRefTab = 'indicados'"
          >
            <i class="ph ph-users"></i>
            <span>Indicados</span>
          </button>
          <button
            :class="['pwa-nav-item', { active: activeRefTab === 'financeiroRef' }]"
            @click="activeRefTab = 'financeiroRef'"
          >
            <i class="ph ph-hand-coins"></i>
            <span>Financeiro</span>
          </button>
          <button
            :class="['pwa-nav-item', { active: activeRefTab === 'links' }]"
            @click="activeRefTab = 'links'"
          >
            <i class="ph ph-link"></i>
            <span>Links</span>
          </button>
        </nav>

      </div>
    </div>

    <!-- Botão flutuante de chat ao vivo (todas as páginas, exceto admin) -->
    <template v-if="currentUser?.role !== 'admin'">
      <div
        v-if="showChatPanel"
        ref="chatPanelRef"
        :class="['chat-fab-panel', { 'avoid-context-nav': shouldLiftFloatingChat }]"
      >
        <ChatAoVivoView />
      </div>
      <button
        ref="chatButtonRef"
        :class="['chat-fab', { 'avoid-context-nav': shouldLiftFloatingChat }]"
        @click="toggleChatPanel"
        :aria-label="showChatPanel ? 'Fechar chat' : 'Abrir chat'"
      >
        <i :class="showChatPanel ? 'ph ph-x' : 'ph ph-chat-circle-dots'"></i>
        <span v-if="chatHasUnread && !showChatPanel" class="chat-fab-dot"></span>
      </button>
    </template>

    <!-- MODAL CUSTOMIZADO: FUNCIONALIDADE EM DESENVOLVIMENTO -->
    <div v-if="showDevModal" class="custom-modal-overlay" @click.self="showDevModal = false">
      <div class="custom-modal-card">
        <i class="ph ph-info custom-modal-icon"></i>
        <h3 class="custom-modal-title">{{ devModalData.title }}</h3>
        <p class="custom-modal-text">{{ devModalData.message }}</p>
        <button class="btn btn-secondary btn-full" @click="showDevModal = false">Entendido</button>
      </div>
    </div>

  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Botão flutuante de chat */
.chat-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: #fff;
  font-size: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(0,0,0,0.25);
  z-index: 10000;
}
.chat-fab-dot {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #fff;
}
.chat-fab-panel {
  position: fixed;
  right: 20px;
  bottom: 88px;
  width: min(400px, 92vw);
  z-index: 10000;
  background: var(--bg-white, #fff);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.3);
  padding: 16px;
  max-height: 78vh;
  overflow: auto;
}
@media (max-width: 520px) {
  .chat-fab-panel { right: 8px; left: 8px; width: auto; bottom: 84px; }
}

.session-loading {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-gray);
  font-size: 14px;
}

/* Desktop Layout */
.desktop-layout {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.desktop-layout.dashboard-showcase {
  background: var(--bg-gray);
}

.topbar-desktop {
  background: var(--bg-white); /* Fundo branco solicitado */
  color: var(--text-dark);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: var(--shadow-sm);
}

.dashboard-showcase .topbar-desktop {
  width: 100%;
  margin: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: none;
}

.topbar-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dashboard-showcase .topbar-container {
  width: min(1240px, calc(100% - 32px));
  max-width: none;
  margin: 0 auto;
  padding: 16px 24px;
}

.brand-logo {
  max-height: 40px;
  display: block;
  /* Removido o filtro invertido para manter as cores originais no fundo branco */
}

/* Dropdown */
.user-profile-wrapper {
  position: relative;
}

.user-profile-area {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: var(--radius-full);
  transition: var(--transition);
  background: var(--bg-gray);
  border: 1px solid var(--border-color);
}

.user-profile-area:hover {
  background: var(--border-color);
}

.avatar-circle {
  width: 32px;
  height: 32px;
  background: var(--primary-light); /* Fundo verde-claro suave */
  color: var(--secondary);          /* Iniciais em teal escuro */
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
}

.profile-name {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a !important; /* Cor do texto João Silva alterada para preto */
}

.dropdown-header {
  padding: 12px 16px 6px;
  display: flex;
  flex-direction: column;
}

.dropdown-header strong {
  font-size: 14px;
  color: var(--text-dark);
}

.dropdown-header span {
  font-size: 11px;
  color: var(--text-gray);
}

.text-red {
  color: #ef4444 !important;
}

.desktop-main {
  padding: 40px 24px;
  flex-grow: 1;
}

.dashboard-showcase .desktop-main {
  width: min(1240px, calc(100% - 32px));
  max-width: none;
  margin: 0 auto;
  padding: 24px;
  background: var(--bg-gray);
  border-radius: 0;
  box-shadow: none;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}

.desktop-ref-bottom-nav {
  display: none;
}

@media (min-width: 768px) and (max-width: 1366px) {
  .desktop-layout {
    overflow-x: hidden;
  }

  .topbar-container,
  .dashboard-showcase .topbar-container {
    width: 100%;
    max-width: none;
    padding: 14px clamp(20px, 3vw, 36px);
  }

  .desktop-main,
  .dashboard-showcase .desktop-main {
    width: 100%;
    max-width: none;
    padding: clamp(20px, 3vw, 32px) clamp(20px, 3vw, 32px) 96px;
  }

  .container {
    max-width: 100%;
  }

  .user-profile-area {
    max-width: min(280px, 42vw);
  }

  .profile-name {
    max-width: 18ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .desktop-ref-bottom-nav {
    position: fixed;
    left: 50%;
    bottom: max(14px, env(safe-area-inset-bottom));
    z-index: 1200;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    width: min(640px, calc(100vw - 32px));
    transform: translateX(-50%);
    background: #ffffff;
    border: 1px solid var(--border-color);
    border-radius: 22px;
    padding: 8px;
    box-shadow: 0 18px 44px rgba(15, 58, 74, 0.18);
  }

  .ref-bottom-tab {
    min-width: 0;
    min-height: 58px;
    border: 0;
    border-radius: 16px;
    background: transparent;
    color: var(--text-gray);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
  }

  .ref-bottom-tab i {
    font-size: 1.25rem;
  }

  .ref-bottom-tab span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ref-bottom-tab.active {
    background: var(--primary-light);
    color: var(--secondary);
  }
}

/* PWA Simulator */
.pwa-layout {
  background: #0f172a;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  width: 100%;
}

.pwa-status-bar {
  background: var(--bg-sidebar);
  color: rgba(255, 255, 255, 0.8);
  padding: 8px 24px;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
}

.device-icons {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pwa-header {
  position: sticky;
  top: 0;
  z-index: 1000;
  background: var(--bg-white);
  flex: 0 0 auto;
  width: 100%;
  min-height: 65px;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
  transform: translateZ(0);
  backface-visibility: hidden;
  will-change: transform;
}

.pwa-header.menu-open {
  z-index: 100000 !important;
}

.pwa-logo-area {
  cursor: pointer;
  display: flex;
  align-items: center;
  min-width: 0;
}

.pwa-logo {
  max-height: 32px;
  width: auto;
  display: block;
  /* Removido o filtro invertido para manter as cores originais no fundo branco */
}

.pwa-menu-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 0 0 auto;
}

.pwa-menu-toggle {
  width: 34px;
  height: 34px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.pwa-menu-toggle i {
  font-size: 26px;
}

.mobile-main-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  justify-content: flex-end;
  background: rgba(15, 23, 42, 0.52);
  backdrop-filter: blur(4px);
  animation: appMenuFadeIn 0.2s ease-out;
}

.mobile-main-menu-overlay.closing {
  animation: appMenuFadeOut 0.24s ease forwards;
}

.mobile-main-menu-drawer {
  width: min(360px, 86vw);
  height: 100dvh;
  min-height: 100dvh;
  background: #ffffff;
  padding: 22px;
  box-shadow: -10px 0 32px rgba(15, 23, 42, 0.18);
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  animation: appDrawerFromRight 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-main-menu-drawer.closing {
  animation: appDrawerToRight 0.24s cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

.mobile-main-menu-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.mobile-main-menu-close {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-gray);
  color: var(--secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
}

@keyframes appDrawerFromRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

@keyframes appDrawerToRight {
  from { transform: translateX(0); }
  to { transform: translateX(100%); }
}

@keyframes appMenuFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes appMenuFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@media (max-width: 767px) {
  .mobile-main-menu-drawer {
    width: min(340px, 86vw);
  }

  .chat-fab {
    right: 16px;
    bottom: calc(18px + env(safe-area-inset-bottom));
  }

  .chat-fab.avoid-context-nav {
    bottom: calc(92px + env(safe-area-inset-bottom));
  }

  .chat-fab-panel {
    right: 8px;
    left: 8px;
    width: auto;
    bottom: calc(86px + env(safe-area-inset-bottom));
  }

  .chat-fab-panel.avoid-context-nav {
    bottom: calc(160px + env(safe-area-inset-bottom));
    max-height: calc(100dvh - 180px);
  }
}

@media (min-width: 768px) and (max-width: 1366px) {
  .chat-fab.avoid-context-nav {
    bottom: calc(108px + env(safe-area-inset-bottom));
  }

  .chat-fab-panel.avoid-context-nav {
    bottom: calc(176px + env(safe-area-inset-bottom));
    max-height: calc(100vh - 210px);
  }
}
</style>
