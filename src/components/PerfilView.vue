<script setup>
import { ref } from 'vue'

const props = defineProps({
  user: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['logout', 'updateUser'])

const name = ref(props.user?.name || '')
const email = ref(props.user?.email || '')
const phone = ref(props.user?.phone || '')
const cpf = ref(props.user?.cpf || '')

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')

const handleSaveProfile = () => {
  emit('updateUser', { ...props.user, name: name.value })
  alert('Dados do perfil salvos com sucesso!')
}

const handleChangePassword = () => {
  if (newPassword.value !== confirmPassword.value) {
    alert('A nova senha e a confirmação não conferem!')
    return
  }
  alert('Senha alterada com sucesso!')
  currentPassword.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}
</script>

<template>
  <div class="profile-page">
    <div class="page-title">
      <h1>Minha Conta</h1>
      <p>Gerencie seus dados pessoais, informações de contato e segurança da conta.</p>
    </div>

    <div class="profile-content">
      <!-- Formulário de dados principais -->
      <div class="card profile-form-card">
        <h2>Dados Pessoais & Contato</h2>
        <form @submit.prevent="handleSaveProfile" class="profile-form">
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="profile-name">Nome Completo</label>
              <input v-model="name" type="text" id="profile-name" class="form-control" required />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="profile-cpf">CPF (Inalterável)</label>
              <input :value="cpf" type="text" id="profile-cpf" class="form-control disabled-input" disabled />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="profile-email">E-mail</label>
              <input v-model="email" type="email" id="profile-email" class="form-control" required />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="profile-phone">Celular</label>
              <input v-model="phone" type="text" id="profile-phone" class="form-control" required />
            </div>
          </div>

          <button type="submit" class="btn btn-secondary">
            <i class="ph ph-floppy-disk"></i> Salvar Alterações
          </button>
        </form>
      </div>

      <!-- Formulário de segurança/senha -->
      <div class="card security-card">
        <h2>Segurança & Senha</h2>
        <form @submit.prevent="handleChangePassword" class="profile-form">
          <div class="form-group">
            <label class="form-label" for="current-pwd">Senha Atual</label>
            <input v-model="currentPassword" type="password" id="current-pwd" class="form-control" required />
          </div>
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="new-pwd">Nova Senha</label>
              <input v-model="newPassword" type="password" id="new-pwd" class="form-control" required />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="confirm-pwd">Confirmar Nova Senha</label>
              <input v-model="confirmPassword" type="password" id="confirm-pwd" class="form-control" required />
            </div>
          </div>

          <button type="submit" class="btn btn-outline">
            <i class="ph ph-key"></i> Alterar Senha
          </button>
        </form>
      </div>

      <!-- Card do Plano -->
      <div class="card signature-info-card">
        <h2>Sua Assinatura</h2>
        <div class="sig-details">
          <div class="sig-row">
            <span class="label">Plano Atual:</span>
            <span class="value">{{ user.plan }}</span>
          </div>
          <div class="sig-row">
            <span class="label">Método de Cobrança:</span>
            <span class="value">PIX</span>
          </div>
          <div class="sig-row">
            <span class="label">Status:</span>
            <span class="badge badge-success">Ativo</span>
          </div>
        </div>
        <button @click="emit('logout')" class="btn btn-outline btn-full logout-btn">
          <i class="ph ph-sign-out"></i> Sair da Conta
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.page-title h1 {
  font-size: 28px;
  color: var(--secondary);
  margin-bottom: 4px;
}

.page-title p {
  color: var(--text-gray);
  font-size: 15px;
}

.profile-content {
  display: grid;
  grid-template-columns: 1.8fr 1.2fr;
  gap: 32px;
}

@media (max-width: 992px) {
  .profile-content {
    grid-template-columns: 1fr;
  }
}

.profile-form-card, .security-card, .signature-info-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-form-card h2, .security-card h2, .signature-info-card h2 {
  font-size: 18px;
  color: var(--secondary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 12px;
}

.form-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.flex-1 {
  flex: 1;
  min-width: 200px;
}

.disabled-input {
  background: var(--bg-gray);
  cursor: not-allowed;
  color: var(--text-light-gray);
}

.sig-details {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sig-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}

.sig-row .label {
  color: var(--text-gray);
}

.sig-row .value {
  font-weight: 600;
  color: var(--text-dark);
}

.logout-btn {
  margin-top: 12px;
  color: #dc2626;
  border-color: #fca5a5;
}

.logout-btn:hover {
  background: #fef2f2;
  border-color: #dc2626;
  color: #dc2626;
}
</style>
