<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import LoginView from './components/LoginView.vue'
import DashboardView from './components/DashboardView.vue'
import AdminView from './components/AdminView.vue'
import DependentesView from './components/DependentesView.vue'
import SuporteView from './components/SuporteView.vue'
import ChatAoVivoView from './components/ChatAoVivoView.vue'
import CheckoutView from './components/CheckoutView.vue'
import KidsView from './components/kids/KidsView.vue'
import TeenView from './components/teen/TeenView.vue'
import { api, getToken, clearToken } from './services/api'
import { getSocket, disconnectSocket } from './services/socket'

// Abas bloqueadas para dependentes (sem parte financeira nem gestão de dependentes).
const DEPENDENT_BLOCKED_TABS = ['financeiro', 'indicacoes', 'dependentes']

const isLoggedIn = ref(false)
const currentUser = ref(null)
const restoringSession = ref(true)

// Checkout público: visitante que chega por link de indicação (?ref=... ou /plano-*).
const showPublicCheckout = ref(false)

// Abas de navegação: 'home', 'perfil', 'financeiro'
const currentTab = ref('home')

// Modo de layout de visualização: 'desktop' ou 'pwa' (inicializado dinamicamente pelo tamanho da tela)
const layoutMode = ref(window.innerWidth < 768 ? 'pwa' : 'desktop')

// Dropdown de perfil no Desktop
const showDropdown = ref(false)

// Dropdown de Indicações no Mobile
const activeRefTab = ref('visaoGeral')
const showRefMenuDropdown = ref(false)
const profileMenuRef = ref(null)
const mobileMenuRef = ref(null)
const chatPanelRef = ref(null)
const chatButtonRef = ref(null)

// Modal Global de Desenvolvimento
const showDevModal = ref(false)
const devModalData = ref({ title: '', message: '' })

const PWA_INSTALL_STORAGE_KEY = 'vivamais-pwa-installed'
const deferredInstallPrompt = ref(null)
const showInstallPrompt = ref(false)
const showInstallHelp = ref(false)

const isInstalledPwa = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

const hasInstalledPwa = () => localStorage.getItem(PWA_INSTALL_STORAGE_KEY) === 'true'

const isMobileViewport = () => window.matchMedia('(max-width: 767px)').matches

const syncInstallPrompt = () => {
  showInstallPrompt.value = isMobileViewport() && !hasInstalledPwa() && !isInstalledPwa()
}

const handleResize = () => {
  layoutMode.value = window.innerWidth < 768 ? 'pwa' : 'desktop'
  syncInstallPrompt()
}

const handleBeforeInstallPrompt = (event) => {
  event.preventDefault()
  deferredInstallPrompt.value = event
  showInstallHelp.value = false
  syncInstallPrompt()
}

const handleAppInstalled = () => {
  localStorage.setItem(PWA_INSTALL_STORAGE_KEY, 'true')
  deferredInstallPrompt.value = null
  showInstallPrompt.value = false
}

const installPwa = async () => {
  if (!deferredInstallPrompt.value) {
    showInstallHelp.value = true
    return
  }
  deferredInstallPrompt.value.prompt()
  const { outcome } = await deferredInstallPrompt.value.userChoice
  if (outcome === 'accepted') handleAppInstalled()
  else showInstallPrompt.value = false
  deferredInstallPrompt.value = null
}

// Fecha somente nesta visita. Sem instalação, o aviso volta na próxima entrada.
const dismissInstallPrompt = () => {
  showInstallPrompt.value = false
  showInstallHelp.value = false
}

// Controla scroll do body quando modal está aberto
watch(showDevModal, (val) => {
  document.body.style.overflow = val ? 'hidden' : ''
})

const handleLogin = (userData) => {
  currentUser.value = userData
  isLoggedIn.value = true

  const path = window.location.pathname
  const hash = window.location.hash

  if (currentTab.value === 'teen-auth' || currentTab.value === 'teen' || path.startsWith('/teen') || hash.startsWith('#/teen')) {
    currentTab.value = 'teen-dashboard'
    window.history.pushState({ tab: 'teen-dashboard' }, '', '/teen/dashboard')
  } else if (currentTab.value === 'kids-auth' || currentTab.value === 'kids' || path.startsWith('/kids') || hash.startsWith('#/kids')) {
    currentTab.value = 'kids-dashboard'
    window.history.pushState({ tab: 'kids-dashboard' }, '', '/kids/dashboard')
  } else {
    currentTab.value = 'home'
    window.history.pushState({ tab: 'home' }, '', '/')
  }

  initFloatingChat()
}

const handleLogout = async () => {
  try {
    await api.post('/auth/logout')
  } catch {
    // token já pode estar expirado — segue com o logout local de qualquer forma
  }
  clearToken()
  disconnectSocket()
  chatSock = null
  showChatPanel.value = false
  chatHasUnread.value = false
  currentUser.value = null
  isLoggedIn.value = false
  currentTab.value = 'home'
  showDropdown.value = false
  window.history.pushState({}, '', '/')
}

const handleUpdateUser = (updatedData) => {
  currentUser.value = updatedData
}

// Acesso restrito a Kids e Teen (disponível apenas em ambiente de desenvolvimento ou para administradores)
const isDevAccessAllowed = () => {
  const isDevHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const isAdmin = currentUser.value?.role === 'admin'
  const isDevStorage = localStorage.getItem('viva_dev_mode') === 'true'
  return isDevHost || isAdmin || isDevStorage
}

const navigateTo = (tab) => {
  if (tab === 'admin' && currentUser.value?.role !== 'admin') return
  // Dependente não acessa financeiro/indicações/dependentes.
  if (currentUser.value?.isDependent && DEPENDENT_BLOCKED_TABS.includes(tab)) return
  
  // Kids e Teen disponíveis somente em desenvolvimento / admin
  if (tab.startsWith('kids') || tab.startsWith('teen')) {
    if (!isDevAccessAllowed()) return
  }

  if (tab === 'kids' || tab === 'kids-dashboard') {
    if (!isLoggedIn.value) {
      currentTab.value = 'kids-auth'
      showDropdown.value = false
      window.history.pushState({ tab: 'kids-auth' }, '', '/kids/auth')
      return
    }
    currentTab.value = 'kids-dashboard'
    showDropdown.value = false
    window.history.pushState({ tab: 'kids-dashboard' }, '', '/kids/dashboard')
    return
  }
  if (tab === 'kids-auth') {
    currentTab.value = 'kids-auth'
    showDropdown.value = false
    window.history.pushState({ tab: 'kids-auth' }, '', '/kids/auth')
    return
  }
  if (tab === 'teen' || tab === 'teen-dashboard') {
    if (!isLoggedIn.value) {
      currentTab.value = 'teen-auth'
      showDropdown.value = false
      window.history.pushState({ tab: 'teen-auth' }, '', '/teen/auth')
      return
    }
    currentTab.value = 'teen-dashboard'
    showDropdown.value = false
    window.history.pushState({ tab: 'teen-dashboard' }, '', '/teen/dashboard')
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
    showRefMenuDropdown.value = false
  }
  const clickedChat = chatPanelRef.value?.contains(event.target) || chatButtonRef.value?.contains(event.target)
  if (!clickedChat) showChatPanel.value = false
}

const handleRouting = () => {
  const path = window.location.pathname
  const hash = window.location.hash

  // Bloqueio de acesso para Kids e Teen caso não seja ambiente de desenvolvimento / admin
  if ((path.startsWith('/kids') || hash.startsWith('#/kids') || path.startsWith('/teen') || hash.startsWith('#/teen')) && !isDevAccessAllowed()) {
    currentTab.value = 'home'
    window.history.replaceState({}, '', '/')
    return
  }

  if (path === '/admin' || hash === '#/admin') {
    currentTab.value = 'admin'
  } else if (path === '/kids/auth' || hash === '#/kids/auth') {
    currentTab.value = 'kids-auth'
  } else if (path === '/kids/dashboard' || hash === '#/kids/dashboard') {
    if (!isLoggedIn.value) {
      currentTab.value = 'kids-auth'
      window.history.replaceState({}, '', '/kids/auth')
    } else {
      currentTab.value = 'kids-dashboard'
    }
  } else if (path.startsWith('/kids') || hash.startsWith('#/kids')) {
    if (!isLoggedIn.value) {
      currentTab.value = 'kids-auth'
      window.history.replaceState({}, '', '/kids/auth')
    } else {
      currentTab.value = 'kids-dashboard'
    }
  } else if (path === '/teen/auth' || hash === '#/teen/auth') {
    currentTab.value = 'teen-auth'
  } else if (path === '/teen/dashboard' || hash === '#/teen/dashboard') {
    if (!isLoggedIn.value) {
      currentTab.value = 'teen-auth'
      window.history.replaceState({}, '', '/teen/auth')
    } else {
      currentTab.value = 'teen-dashboard'
    }
  } else if (path.startsWith('/teen') || hash.startsWith('#/teen')) {
    if (!isLoggedIn.value) {
      currentTab.value = 'teen-auth'
      window.history.replaceState({}, '', '/teen/auth')
    } else {
      currentTab.value = 'teen-dashboard'
    }
  } else if (path === '/indicacoes' || hash === '#/indicacoes') {
    currentTab.value = 'indicacoes'
  } else if (path === '/meu-perfil' || hash === '#/meu-perfil') {
    currentTab.value = 'perfil'
  } else if (path === '/financeiro' || hash === '#/financeiro') {
    currentTab.value = 'financeiro'
  } else if (path === '/dependentes' || hash === '#/dependentes') {
    currentTab.value = 'dependentes'
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
}

const onUnauthorized = () => {
  handleLogout()
}

onMounted(async () => {
  document.addEventListener('click', closeFloatingPanels)
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', handleAppInstalled)
  window.addEventListener('auth:unauthorized', onUnauthorized)
  syncInstallPrompt()

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

  // Link de indicação (?ref= ou /plano-*) e sem sessão → abre o checkout público.
  const hasRef = new URLSearchParams(window.location.search).has('ref')
  const isPlanPath = /\/plano-[a-z0-9-]+/i.test(window.location.pathname)
  if (!isLoggedIn.value && (hasRef || isPlanPath)) {
    showPublicCheckout.value = true
  } else {
    handleRouting()
  }
  window.addEventListener('popstate', handleRouting)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeFloatingPanels)
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', handleAppInstalled)
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
    :subRoute="(!isLoggedIn || currentTab === 'kids-auth') ? 'auth' : 'dashboard'"
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
    :subRoute="(!isLoggedIn || currentTab === 'teen-auth') ? 'auth' : 'dashboard'"
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
    </div>

    <!-- VERSÃO PWA MOBILE (SIMULADOR) -->
    <div v-else class="pwa-layout">
      <div class="pwa-simulator">
        <!-- Status Bar Fake -->
        <div class="pwa-status-bar">
          <span class="fake-time">14:04</span>
          <div class="fake-icons">
            <i class="ph ph-wifi-high"></i>
            <i class="ph ph-battery-full"></i>
          </div>
        </div>

        <!-- Cabeçalho PWA -->
        <header class="pwa-header" style="position: sticky; top: 0; z-index: 1000; display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 16px 24px; background: white; border-bottom: 1px solid var(--border-color);">
          <div @click="navigateTo('home')" style="cursor: pointer; display: flex; align-items: center;">
            <img src="/logo.png" alt="Viva Mais" class="pwa-logo" style="max-height: 32px;" />
          </div>
          
          <!-- Menu com 3 riscos (no text) se estiver na aba Indicações -->
          <div v-if="currentTab === 'indicacoes'" ref="mobileMenuRef" style="position: relative; display: flex; align-items: center;">
            <button @click.stop="showRefMenuDropdown = !showRefMenuDropdown" style="background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center;">
              <i class="ph ph-list" style="font-size: 26px; color: var(--secondary);"></i>
            </button>
            
            <div v-if="showRefMenuDropdown" class="dropdown-menu show" style="position: absolute; right: 0; top: 110%; z-index: 99999; width: 180px; box-shadow: var(--shadow-md); border: 1px solid var(--border-color); border-radius: var(--radius-md); background: white; padding: 6px; display: flex; flex-direction: column;">
              <button class="dropdown-item" :class="{ active: activeRefTab === 'visaoGeral' }" @click="activeRefTab = 'visaoGeral'; showRefMenuDropdown = false" style="width: 100%; border: none; background: transparent; padding: 8px 12px; text-align: left; font-size: 13px; cursor: pointer;">
                Visão Geral
              </button>
              <button class="dropdown-item" :class="{ active: activeRefTab === 'indicados' }" @click="activeRefTab = 'indicados'; showRefMenuDropdown = false" style="width: 100%; border: none; background: transparent; padding: 8px 12px; text-align: left; font-size: 13px; cursor: pointer;">
                Meus Indicados
              </button>
              <button class="dropdown-item" :class="{ active: activeRefTab === 'financeiroRef' }" @click="activeRefTab = 'financeiroRef'; showRefMenuDropdown = false" style="width: 100%; border: none; background: transparent; padding: 8px 12px; text-align: left; font-size: 13px; cursor: pointer;">
                Financeiro
              </button>
              <button class="dropdown-item" :class="{ active: activeRefTab === 'links' }" @click="activeRefTab = 'links'; showRefMenuDropdown = false" style="width: 100%; border: none; background: transparent; padding: 8px 12px; text-align: left; font-size: 13px; cursor: pointer;">
                Meus Links
              </button>
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

        <!-- Menu de Navegação Inferior PWA (sem o botão início) -->
        <nav class="pwa-bottom-nav">
          <button 
            :class="['pwa-nav-item', { active: currentTab === 'indicacoes' }]"
            @click="navigateTo('indicacoes')"
          >
            <i class="ph ph-users-three"></i>
            <span>Indicações</span>
          </button>
          <button
            :class="['pwa-nav-item', { active: currentTab === 'perfil' }]"
            @click="navigateTo('perfil')"
          >
            <i class="ph ph-user"></i>
            <span>Minha Conta</span>
          </button>
          <button
            :class="['pwa-nav-item', { active: currentTab === 'financeiro' }]"
            @click="navigateTo('financeiro')"
          >
            <i class="ph ph-credit-card"></i>
            <span>Finanças</span>
          </button>
        </nav>
      </div>
    </div>

    <!-- Botão flutuante de chat ao vivo (todas as páginas, exceto admin) -->
    <template v-if="currentUser?.role !== 'admin'">
      <div v-if="showChatPanel" ref="chatPanelRef" class="chat-fab-panel">
        <ChatAoVivoView />
      </div>
      <button ref="chatButtonRef" class="chat-fab" @click="toggleChatPanel" :aria-label="showChatPanel ? 'Fechar chat' : 'Abrir chat'">
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

  <div v-if="showInstallPrompt" class="install-prompt" role="dialog" aria-modal="true" aria-labelledby="install-title">
    <div class="install-prompt-card">
      <img src="/favicon.png" alt="Ícone Viva Mais Club" class="install-prompt-icon" />
      <div class="install-prompt-content">
        <h2 id="install-title">Instale o Viva Mais Club</h2>
        <p v-if="showInstallHelp" class="install-prompt-help">Para instalar, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela de início”.</p>
        <p v-if="!deferredInstallPrompt" class="install-prompt-instructions">No menu do navegador, escolha “Instalar aplicativo” ou “Adicionar à tela de início”.</p>
        <p>Tenha acesso rápido aos seus benefícios direto pela tela inicial do celular ou computador.</p>
      </div>
      <div class="install-prompt-actions">
        <button type="button" class="install-later" @click="dismissInstallPrompt">Agora não</button>
        <button type="button" class="install-confirm" @click="installPwa">Instalar app</button>
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

.fake-icons {
  display: flex;
  gap: 6px;
  align-items: center;
}

.pwa-header {
  background: var(--bg-white);
  padding: 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-bottom: 1px solid var(--border-color);
}

.pwa-logo {
  max-height: 36px;
  /* Removido o filtro invertido para manter as cores originais no fundo branco */
}

.install-prompt {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.38);
}

.install-prompt-card {
  width: min(520px, 100%);
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items: center;
  padding: 20px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.25);
}

.install-prompt-icon {
  width: 58px;
  height: 58px;
  border-radius: 14px;
}

.install-prompt-content h2 {
  margin: 0 0 4px;
  color: #064b93;
  font-size: 17px;
}

.install-prompt-content p {
  margin: 0;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
}

.install-prompt-instructions {
  display: none;
  margin-top: 6px !important;
  color: #064b93 !important;
  font-weight: 600;
}

.install-prompt-help {
  margin: 6px 0 0 !important;
  color: #064b93 !important;
  font-weight: 600;
}

.install-prompt-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.install-prompt-actions button {
  border: 0;
  border-radius: 9px;
  padding: 10px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.install-later {
  background: #eef2f7;
  color: #475569;
}

.install-confirm {
  background: #064b93;
  color: #fff;
}

@media (min-width: 768px) {
  .install-prompt { display: none; }
}

@media (max-width: 767px) {
  .chat-fab {
    right: 16px;
    bottom: calc(78px + env(safe-area-inset-bottom));
  }

  .chat-fab-panel {
    right: 8px;
    left: 8px;
    width: auto;
    bottom: calc(146px + env(safe-area-inset-bottom));
  }

  .install-prompt {
    padding: 12px;
    background: rgba(15, 23, 42, 0.22);
  }

  .install-prompt-card {
    padding: 16px;
    border-radius: 18px;
  }

  .install-prompt-actions button {
    min-height: 42px;
  }
}
</style>
