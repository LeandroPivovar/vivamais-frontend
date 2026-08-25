<script setup>
import { ref } from 'vue'
import { api, setToken } from '../services/api'

const emit = defineEmits(['login'])

const username = ref('')
const password = ref('')
const rememberMe = ref(false)
const error = ref('')
const loading = ref(false)

// Fluxo de recuperação de senha: 'login' | 'forgot' (pede e-mail) | 'reset' (código + nova senha)
const mode = ref('login')
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
  <div class="login-wrapper">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-container">
          <img src="/logo.png" alt="Viva Mais" class="login-logo" />
        </div>
        <p>Acesse seus benefícios e acompanhe sua assinatura</p>
      </div>

      <!-- LOGIN -->
      <form v-if="mode === 'login'" @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label class="form-label" for="username">CPF ou E-mail</label>
          <div class="input-icon-wrapper">
            <i class="ph ph-user"></i>
            <input
              v-model="username"
              type="text"
              id="username"
              placeholder="Digite seu CPF ou e-mail"
              class="form-control with-icon"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Senha</label>
          <div class="input-icon-wrapper">
            <i class="ph ph-lock"></i>
            <input
              v-model="password"
              type="password"
              id="password"
              placeholder="Digite sua senha"
              class="form-control with-icon"
              required
            />
          </div>
        </div>

        <div class="login-options">
          <label class="checkbox-label">
            <input v-model="rememberMe" type="checkbox" />
            Lembrar-me
          </label>
          <a href="#" class="forgot-link" @click.prevent="goToForgot">Esqueci a senha</a>
        </div>

        <p v-if="info" class="login-info">{{ info }}</p>
        <p v-if="error" class="login-error">{{ error }}</p>

        <button type="submit" class="btn btn-primary btn-full" :disabled="loading">
          <span>{{ loading ? 'Entrando...' : 'Entrar' }}</span>
          <i class="ph ph-sign-in"></i>
        </button>
      </form>

      <!-- ESQUECI A SENHA: pedir código -->
      <form v-else-if="mode === 'forgot'" @submit.prevent="requestResetCode" class="login-form">
        <p class="reset-intro">Informe seu e-mail cadastrado. Enviaremos um código de 6 dígitos para redefinir sua senha.</p>
        <div class="form-group">
          <label class="form-label" for="resetEmail">E-mail</label>
          <div class="input-icon-wrapper">
            <i class="ph ph-envelope"></i>
            <input
              v-model="resetEmail"
              type="email"
              id="resetEmail"
              placeholder="Digite seu e-mail"
              class="form-control with-icon"
              required
            />
          </div>
        </div>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button type="submit" class="btn btn-primary btn-full" :disabled="loading">
          <span>{{ loading ? 'Enviando...' : 'Enviar código' }}</span>
          <i class="ph ph-paper-plane-tilt"></i>
        </button>
        <a href="#" class="back-link" @click.prevent="backToLogin">Voltar ao login</a>
      </form>

      <!-- ESQUECI A SENHA: código + nova senha -->
      <form v-else @submit.prevent="confirmReset" class="login-form">
        <p v-if="info" class="login-info">{{ info }}</p>
        <div class="form-group">
          <label class="form-label" for="resetCode">Código recebido</label>
          <div class="input-icon-wrapper">
            <i class="ph ph-key"></i>
            <input
              v-model="resetCode"
              type="text"
              id="resetCode"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
              class="form-control with-icon"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="newPassword">Nova senha</label>
          <div class="input-icon-wrapper">
            <i class="ph ph-lock"></i>
            <input
              v-model="newPassword"
              type="password"
              id="newPassword"
              placeholder="Mínimo 6 caracteres"
              class="form-control with-icon"
              minlength="6"
              required
            />
          </div>
        </div>

        <p v-if="error" class="login-error">{{ error }}</p>

        <button type="submit" class="btn btn-primary btn-full" :disabled="loading">
          <span>{{ loading ? 'Redefinindo...' : 'Redefinir senha' }}</span>
          <i class="ph ph-check"></i>
        </button>
        <a href="#" class="back-link" @click.prevent="backToLogin">Voltar ao login</a>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrapper {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 7% 42%, rgba(0, 185, 181, 0.10) 0 13%, transparent 27%),
    radial-gradient(circle at 84% 48%, rgba(7, 89, 133, 0.07) 0 18%, transparent 34%),
    linear-gradient(135deg, #f8fbff 0%, #eef6ff 48%, #ffffff 100%);
  padding: 16px;
  width: 100%;
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.login-wrapper::before,
.login-wrapper::after {
  content: '';
  position: absolute;
  pointer-events: none;
  z-index: -1;
}

.login-wrapper::before {
  width: min(520px, 52vw);
  aspect-ratio: 1;
  left: -180px;
  bottom: -210px;
  border-radius: 50%;
  border: 1px solid rgba(0, 185, 181, 0.35);
  box-shadow:
    180px -44px 0 56px rgba(0, 88, 166, 0.05),
    360px 92px 0 88px rgba(7, 89, 133, 0.04);
}

.login-wrapper::after {
  inset: 0;
  background:
    radial-gradient(circle, rgba(0, 185, 181, 0.55) 1.5px, transparent 2px) 18% 25% / 18px 18px no-repeat,
    radial-gradient(circle, rgba(1, 117, 194, 0.36) 1.5px, transparent 2px) 82% 63% / 18px 18px no-repeat,
    repeating-radial-gradient(circle at 100% 0, transparent 0 30px, rgba(0, 185, 181, 0.16) 31px 32px);
  opacity: 0.72;
}

.login-card {
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 440px;
  width: 100%;
  border: 1px solid var(--border-color);
  overflow: hidden;
  position: relative;
  z-index: 1;
}

.login-header {
  text-align: center;
  padding: 32px 32px 16px;
}

.logo-container {
  background: var(--bg-sidebar); /* Fundo verde escuro para dar contraste com a logo branca */
  padding: 16px;
  border-radius: var(--radius-md);
  margin-bottom: 24px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  width: 100%;
}

.login-logo {
  max-height: 48px;
  display: block;
}

.login-header p {
  font-size: 14px;
  color: var(--text-gray);
}

.login-form {
  padding: 0 32px 32px;
}

.input-icon-wrapper {
  position: relative;
}

.input-icon-wrapper i {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-light-gray);
  font-size: 18px;
}

.form-control.with-icon {
  padding-left: 44px;
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  font-size: 13px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: var(--text-gray);
}

.login-error {
  color: #ef4444;
  font-size: 13px;
  margin: -8px 0 16px;
  text-align: center;
}

.login-info {
  color: #059669;
  font-size: 13px;
  margin: -8px 0 16px;
  text-align: center;
}

.forgot-link {
  color: var(--primary);
  font-size: 13px;
  text-decoration: none;
  font-weight: 500;
}

.forgot-link:hover {
  text-decoration: underline;
}

.reset-intro {
  font-size: 13px;
  color: var(--text-gray);
  margin-bottom: 20px;
  line-height: 1.5;
}

.back-link {
  display: block;
  text-align: center;
  margin-top: 16px;
  color: var(--text-gray);
  font-size: 13px;
  text-decoration: none;
}

.back-link:hover {
  color: var(--primary);
  text-decoration: underline;
}

@media (max-width: 640px) {
  .login-wrapper {
    padding: 14px;
    background:
      radial-gradient(circle at 0% 24%, rgba(0, 185, 181, 0.09) 0 18%, transparent 38%),
      linear-gradient(135deg, #f8fbff 0%, #eef6ff 52%, #ffffff 100%);
  }

  .login-wrapper::before {
    width: 360px;
    left: -180px;
    bottom: -180px;
  }

  .login-wrapper::after {
    background:
      radial-gradient(circle, rgba(0, 185, 181, 0.45) 1.5px, transparent 2px) 16% 18% / 18px 18px no-repeat,
      radial-gradient(circle, rgba(1, 117, 194, 0.28) 1.5px, transparent 2px) 86% 76% / 18px 18px no-repeat;
  }
}
</style>
