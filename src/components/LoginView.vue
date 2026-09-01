<script setup>
import { ref } from 'vue'
import { api, setToken } from '../services/api'

const emit = defineEmits(['login'])

const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const showPassword = ref(false)
const error = ref('')
const loading = ref(false)

// Fluxo de recuperação de senha: 'login' | 'forgot' (pede e-mail) | 'reset' (código + nova senha)
// O botão "Redefinir senha" do e-mail aponta para ?redefinir=1 e cai direto no passo
// do código — o fluxo vive só em estado interno, sem rota, então sem isso o usuário
// voltava ao login e precisava pedir um código novo, invalidando o que ele recebeu.
const wantsReset =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('redefinir')
const mode = ref(wantsReset ? 'reset' : 'login')
const resetEmail = ref('')
const resetCode = ref('')
const newPassword = ref('')
const info = ref('')

const handleLogin = async () => {
  error.value = ''
  loading.value = true
  try {
    const { token, user } = await api.post('/auth/login', {
      username: username.value.trim(),
      password: password.value.trim(),
      rememberMe: rememberMe.value,
    })
    setToken(token)
    emit('login', user)
  } catch (err) {
    error.value = err.status === 401 ? 'CPF/e-mail ou senha incorretos.' : (err?.message || 'Não foi possível entrar. Tente novamente.')
  } finally {
    loading.value = false
  }
}

const goToForgot = () => {
  error.value = ''
  info.value = ''
  resetEmail.value = ''
  mode.value = 'forgot'
}

/** Vai direto ao passo do código, sem pedir um novo (que invalidaria o atual). */
const goToReset = () => {
  error.value = ''
  info.value = ''
  mode.value = 'reset'
}

const backToLogin = () => {
  error.value = ''
  info.value = ''
  resetCode.value = ''
  newPassword.value = ''
  mode.value = 'login'
}

const requestResetCode = async () => {
  error.value = ''
  info.value = ''
  loading.value = true
  try {
    await api.post('/auth/forgot-password', { email: resetEmail.value })
    info.value = 'Se o e-mail estiver cadastrado, enviamos um código. Verifique sua caixa de entrada.'
    mode.value = 'reset'
  } catch (err) {
    error.value = 'Não foi possível enviar o código. Tente novamente.'
  } finally {
    loading.value = false
  }
}

const confirmReset = async () => {
  error.value = ''
  info.value = ''
  loading.value = true
  try {
    await api.post('/auth/reset-password', {
      email: resetEmail.value,
      code: resetCode.value,
      newPassword: newPassword.value,
    })
    info.value = 'Senha redefinida com sucesso! Faça login com a nova senha.'
    resetCode.value = ''
    newPassword.value = ''
    mode.value = 'login'
  } catch (err) {
    error.value = err.status === 400 ? 'Código inválido ou expirado.' : 'Não foi possível redefinir a senha.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- HERO SUPERIOR APENAS NO MOBILE/TABLET (Estilo Kids com Logo Centralizada) -->
    <header class="mobile-hero-header" aria-hidden="true">
      <div class="mobile-hero-logo-box">
        <img src="/logo.png" alt="Viva Mais Club" class="mobile-hero-logo" />
      </div>
    </header>

    <div class="login-container">
      <!-- COLUNA DA ESQUERDA: BENEFÍCIOS (Visível apenas em Desktop) -->
      <section class="benefits-section" aria-label="Benefícios Viva Mais Club">
        <div class="benefits-top-row">
          <img src="/logo.png" alt="Viva Mais Club" class="benefits-brand-logo" />
        </div>

        <div class="kicker-bar"></div>

        <h1 class="benefits-headline">
          Benefícios que<br />acompanham<br />você, <span class="teal-highlight">todos os dias.</span>
        </h1>

        <p class="benefits-subheadline">
          Acesse sua conta e aproveite descontos<br />exclusivos, serviços e muito mais.
        </p>

        <div class="benefits-feature-list">
          <div class="feature-item">
            <div class="feature-icon icon-teal-soft">
              <i class="ph-fill ph-tag"></i>
            </div>
            <div class="feature-info">
              <h3>Descontos exclusivos</h3>
              <p>Economize em parceiros selecionados.</p>
            </div>
          </div>

          <div class="feature-item">
            <div class="feature-icon icon-teal-soft">
              <i class="ph ph-heartbeat"></i>
            </div>
            <div class="feature-info">
              <h3>Serviços para você</h3>
              <p>Cuide da sua saúde, bem-estar e família.</p>
            </div>
          </div>

          <div class="feature-item">
            <div class="feature-icon icon-teal-soft">
              <i class="ph ph-credit-card"></i>
            </div>
            <div class="feature-info">
              <h3>Tudo em um só lugar</h3>
              <p>Sua assinatura, benefícios e muito mais.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- COLUNA DA DIREITA: CARD DE LOGIN -->
      <div class="login-card-container">
        <div class="auth-card">
          <div class="card-header-block">
            <h2 class="card-heading">Seja bem-vindo(a)! <span class="wave-emoji">👋</span></h2>
            <p class="card-subheading">
              Faça login para acessar seus benefícios<br />e acompanhar sua assinatura.
            </p>
          </div>

          <!-- FORMULÁRIO PRINCIPAL DE LOGIN -->
          <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="auth-form">
            <div class="input-group">
              <label class="field-label" for="username">CPF ou e-mail</label>
              <div class="field-control-wrapper">
                <i class="ph ph-user field-icon-left"></i>
                <input
                  v-model="username"
                  type="text"
                  id="username"
                  placeholder="Digite seu CPF ou e-mail"
                  class="field-input with-left-icon"
                  required
                />
              </div>
            </div>

            <div class="input-group">
              <label class="field-label" for="password">Senha</label>
              <div class="field-control-wrapper">
                <i class="ph ph-lock field-icon-left"></i>
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  id="password"
                  placeholder="Digite sua senha"
                  class="field-input with-left-icon with-right-icon"
                  required
                />
                <button
                  type="button"
                  class="field-eye-btn"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                  aria-label="Alternar exibição da senha"
                >
                  <i :class="showPassword ? 'ph ph-eye-slash' : 'ph ph-eye'"></i>
                </button>
              </div>
            </div>

            <div class="form-row-options">
              <label class="checkbox-container">
                <input v-model="rememberMe" type="checkbox" />
                <span>Lembrar-me</span>
              </label>
              <a href="#" class="forgot-link-btn" @click.prevent="goToForgot">Esqueci a senha</a>
            </div>

            <p v-if="info" class="msg-status-info">{{ info }}</p>
            <p v-if="error" class="msg-status-error">{{ error }}</p>

            <button type="submit" class="submit-btn-primary" :disabled="loading">
              <span>{{ loading ? 'Entrando...' : 'Entrar' }}</span>
              <i class="ph ph-arrow-right submit-arrow-icon"></i>
            </button>
          </form>

          <!-- ESQUECI A SENHA: PEDIR CÓDIGO -->
          <form v-else-if="mode === 'forgot'" @submit.prevent="requestResetCode" class="auth-form">
            <p class="reset-instruction-text">
              Informe seu e-mail cadastrado. Enviaremos um código de 6 dígitos para redefinir sua senha.
            </p>
            <div class="input-group">
              <label class="field-label" for="resetEmail">E-mail</label>
              <div class="field-control-wrapper">
                <i class="ph ph-envelope field-icon-left"></i>
                <input
                  v-model="resetEmail"
                  type="email"
                  id="resetEmail"
                  placeholder="Digite seu e-mail"
                  class="field-input with-left-icon"
                  required
                />
              </div>
            </div>

            <p v-if="error" class="msg-status-error">{{ error }}</p>

            <button type="submit" class="submit-btn-primary" :disabled="loading">
              <span>{{ loading ? 'Enviando...' : 'Enviar código' }}</span>
              <i class="ph ph-paper-plane-tilt submit-arrow-icon"></i>
            </button>
            <a href="#" class="return-login-link" @click.prevent="goToReset">Já recebi o código</a>
            <a href="#" class="return-login-link" @click.prevent="backToLogin">Voltar ao login</a>
          </form>

          <!-- ESQUECI A SENHA: CÓDIGO + NOVA SENHA -->
          <form v-else @submit.prevent="confirmReset" class="auth-form">
            <p v-if="info" class="msg-status-info">{{ info }}</p>

            <!-- E-mail editável: quem chega pelo link do e-mail não passou pelo passo
                 anterior, então não há estado guardado para reaproveitar. -->
            <div class="input-group">
              <label class="field-label" for="resetEmailConfirm">E-mail</label>
              <div class="field-control-wrapper">
                <i class="ph ph-envelope field-icon-left"></i>
                <input
                  v-model="resetEmail"
                  type="email"
                  id="resetEmailConfirm"
                  placeholder="Digite seu e-mail"
                  class="field-input with-left-icon"
                  required
                />
              </div>
            </div>

            <div class="input-group">
              <label class="field-label" for="resetCode">Código recebido</label>
              <div class="field-control-wrapper">
                <i class="ph ph-key field-icon-left"></i>
                <input
                  v-model="resetCode"
                  type="text"
                  id="resetCode"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="000000"
                  class="field-input with-left-icon"
                  required
                />
              </div>
            </div>

            <div class="input-group">
              <label class="field-label" for="newPassword">Nova senha</label>
              <div class="field-control-wrapper">
                <i class="ph ph-lock field-icon-left"></i>
                <input
                  v-model="newPassword"
                  type="password"
                  id="newPassword"
                  placeholder="Mínimo 6 caracteres"
                  class="field-input with-left-icon"
                  minlength="6"
                  required
                />
              </div>
            </div>

            <p v-if="error" class="msg-status-error">{{ error }}</p>

            <button type="submit" class="submit-btn-primary" :disabled="loading">
              <span>{{ loading ? 'Redefinindo...' : 'Redefinir senha' }}</span>
              <i class="ph ph-check submit-arrow-icon"></i>
            </button>
            <a href="#" class="return-login-link" @click.prevent="backToLogin">Voltar ao login</a>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   ESTRUTURA GERAL & BACKGROUND
   ========================================================================== */
.login-page {
  min-height: 100vh;
  width: 100%;
  position: relative;
  background-color: #F8FAFD;
  background-image: url('/login-bg.png');
  background-repeat: no-repeat;
  background-position: center center;
  background-size: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: hidden;
  font-family: var(--font-main, 'Poppins', sans-serif);
}

/* Container de 2 Colunas */
.login-container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 40px 32px;
  display: grid;
  grid-template-columns: minmax(360px, 480px) minmax(380px, 460px);
  justify-content: center;
  align-items: center;
  gap: clamp(40px, 7vw, 120px);
}

/* ==========================================================================
   COLUNA ESQUERDA: BRANDING E BENEFÍCIOS
   ========================================================================== */
.benefits-section {
  width: 100%;
  max-width: 460px;
}

.benefits-top-row {
  margin-bottom: 40px;
}

.benefits-brand-logo {
  height: 44px;
  width: auto;
  object-fit: contain;
  display: block;
}

.kicker-bar {
  width: 36px;
  height: 3px;
  background-color: #00B5B0;
  border-radius: 99px;
  margin-bottom: 22px;
}

.benefits-headline {
  margin: 0;
  color: #06285C;
  font-size: clamp(2rem, 2.5vw, 2.55rem);
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.02em;
}

.benefits-headline .teal-highlight {
  color: #00B5B0;
}

.benefits-subheadline {
  margin: 18px 0 32px;
  color: #60728C;
  font-size: 0.94rem;
  line-height: 1.55;
}

.benefits-feature-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 16px;
  background: rgba(255, 255, 255, 0.22);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 14px;
  padding: 10px 14px 10px 10px;
}

.feature-icon {
  width: 44px;
  height: 44px;
  min-width: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.icon-teal-solid {
  background-color: #00B5B0;
  color: #FFFFFF;
  box-shadow: 0 4px 14px rgba(0, 181, 176, 0.28);
}

.icon-teal-soft {
  background-color: #E6F8F7;
  color: #00B5B0;
  border: 1px solid rgba(0, 181, 176, 0.16);
}

.feature-info h3 {
  margin: 0 0 2px;
  color: #06285C;
  font-size: 0.95rem;
  font-weight: 700;
}

.feature-info p {
  margin: 0;
  color: #60728C;
  font-size: 0.86rem;
  line-height: 1.4;
}

/* ==========================================================================
   COLUNA DIREITA: CARD DE LOGIN
   ========================================================================== */
.login-card-container {
  display: flex;
  justify-content: center;
  width: 100%;
}

.auth-card {
  background: #FFFFFF;
  border-radius: 20px;
  box-shadow: 0 12px 38px rgba(8, 40, 92, 0.06);
  border: 1px solid #E8EEF5;
  width: 100%;
  max-width: 440px;
  overflow: hidden;
}

.card-header-block {
  text-align: center;
  padding: 36px 32px 18px;
}

.card-heading {
  margin: 0 0 8px;
  color: #06285C;
  font-size: 1.45rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

@keyframes wave {
  0%   { transform: rotate(0deg); }
  15%  { transform: rotate(18deg); }
  30%  { transform: rotate(-10deg); }
  45%  { transform: rotate(16deg); }
  60%  { transform: rotate(-8deg); }
  75%  { transform: rotate(12deg); }
  100% { transform: rotate(0deg); }
}

.wave-emoji {
  display: inline-block;
  transform-origin: 70% 80%;
  animation: wave 1.6s ease-in-out 0.4s 3;
}

.card-subheading {
  margin: 0;
  font-size: 0.88rem;
  color: #60728C;
  line-height: 1.45;
}

.auth-form {
  padding: 0 32px 32px;
}

.input-group {
  margin-bottom: 18px;
}

.field-label {
  display: block;
  font-size: 0.86rem;
  font-weight: 600;
  color: #06285C;
  margin-bottom: 6px;
}

.field-control-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon-left {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: #9CA3AF;
  font-size: 18px;
  pointer-events: none;
}

.field-input {
  width: 100%;
  height: 46px;
  padding: 0 14px;
  border: 1px solid #DCE7F0;
  border-radius: 10px;
  font-size: 0.92rem;
  color: #06285C;
  background-color: #FFFFFF;
  outline: none;
  font-family: inherit;
  transition: all 0.2s ease;
}

.field-input:focus {
  border-color: #00B5B0;
  box-shadow: 0 0 0 3px rgba(0, 181, 176, 0.12);
}

.field-input.with-left-icon {
  padding-left: 42px;
}

.field-input.with-right-icon {
  padding-right: 42px;
}

.field-eye-btn {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: #9CA3AF;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.field-eye-btn:hover {
  color: #06285C;
}

.form-row-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 14px 0 22px;
  font-size: 0.85rem;
}

.checkbox-container {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #60728C;
  font-size: 0.85rem;
  user-select: none;
}

.checkbox-container input[type="checkbox"] {
  accent-color: #06285C;
  width: 15px;
  height: 15px;
  cursor: pointer;
}

.forgot-link-btn {
  color: #0070F3;
  text-decoration: none;
  font-weight: 500;
  font-size: 0.85rem;
}

.forgot-link-btn:hover {
  text-decoration: underline;
}

.msg-status-error {
  color: #EF4444;
  font-size: 0.85rem;
  margin: -8px 0 14px;
  text-align: center;
}

.msg-status-info {
  color: #059669;
  font-size: 0.85rem;
  margin: -8px 0 14px;
  text-align: center;
}

.submit-btn-primary {
  width: 100%;
  height: 48px;
  background-color: #052453;
  color: #FFFFFF;
  border: none;
  border-radius: 10px;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-btn-primary:hover:not(:disabled) {
  background-color: #031838;
}

.submit-btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.submit-arrow-icon {
  font-size: 16px;
  font-weight: bold;
}

.reset-instruction-text {
  font-size: 0.88rem;
  color: #60728C;
  margin-bottom: 18px;
  line-height: 1.5;
}

.return-login-link {
  display: block;
  text-align: center;
  margin-top: 16px;
  color: #60728C;
  font-size: 0.85rem;
  text-decoration: none;
}

/* ==========================================================================
   MOBILE HERO HEADER (Visível apenas em Mobile/Tablet)
   ========================================================================== */
.mobile-hero-header {
  display: none;
}

.mobile-hero-logo-box {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.mobile-hero-logo {
  height: 44px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: brightness(0) invert(1);
}

/* ==========================================================================
   RESPONSIVIDADE (Mobile & Tablets - Layout Estilo Kids Colado no Bottom)
   ========================================================================== */
@media (max-width: 860px) {
  .login-page {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: stretch;
    height: 100dvh;
    min-height: 100dvh;
    max-height: 100dvh;
    background-color: #F8FAFD;
    background-image: none;
    padding: 0;
    margin: 0;
    overflow: hidden;
    overflow-x: hidden;
    overscroll-behavior: none;
  }

  .mobile-hero-header {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    flex: 1 1 auto;
    min-height: 112px;
    padding: 22px 20px clamp(40px, 7dvh, 52px);
    background:
      radial-gradient(circle at 15% 20%, rgba(255, 255, 255, 0.15) 0 40px, transparent 41px),
      radial-gradient(circle at 85% 80%, rgba(0, 181, 176, 0.3) 0 60px, transparent 61px),
      linear-gradient(145deg, #052453 0%, #0B3C82 55%, #00B5B0 100%);
    position: relative;
    box-sizing: border-box;
  }

  .login-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    max-height: calc(100dvh - 96px);
    padding: 0;
    margin: -36px 0 0 0;
    z-index: 10;
    gap: 0;
    flex-shrink: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .login-container::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  .benefits-section {
    display: none;
  }

  .login-card-container {
    width: 100%;
    display: flex;
  }

  .auth-card {
    background: #FFFFFF;
    border-radius: 32px 32px 0 0;
    box-shadow: 0 -14px 34px rgba(15, 23, 42, 0.10);
    border: none;
    width: 100%;
    max-width: 100%;
    height: auto;
    flex: none;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: clamp(18px, 3.6dvh, 24px) 22px max(18px, env(safe-area-inset-bottom));
    box-sizing: border-box;
  }

  .card-header-block {
    padding: 0 0 12px;
    text-align: center;
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
  }

  .card-heading {
    font-size: 1.38rem;
    font-weight: 800;
    color: #06285C;
    margin-bottom: 4px;
  }

  .card-subheading {
    font-size: 0.86rem;
    color: #60728C;
    line-height: 1.4;
    margin: 0;
  }

  .auth-form {
    padding: 0;
    max-width: 420px;
    margin: 0 auto;
    width: 100%;
  }

  .field-input {
    height: clamp(44px, 7dvh, 48px);
    border-radius: 12px;
  }

  .submit-btn-primary {
    height: clamp(46px, 7dvh, 50px);
    border-radius: 12px;
    font-size: 1rem;
    margin-top: 4px;
  }
}
</style>



