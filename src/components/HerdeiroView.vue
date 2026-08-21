<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '../services/api'

const emit = defineEmits(['triggerDevModal'])

const loading = ref(true)
const submitting = ref(false)
const savedHeir = ref(null)
const form = ref({ name: '', cpf: '', phone: '', email: '' })

const hasHeir = computed(() => !!savedHeir.value)

const onlyDigits = (value) => (value ?? '').replace(/\D/g, '')

const formatCpf = (value) => {
  const d = onlyDigits(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

const formatPhone = (value) => {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

const fillForm = (heir) => {
  savedHeir.value = heir || null
  form.value = heir
    ? {
        name: heir.name || '',
        cpf: formatCpf(heir.cpf || ''),
        phone: formatPhone(heir.phone || ''),
        email: heir.email || '',
      }
    : { name: '', cpf: '', phone: '', email: '' }
}

const load = async () => {
  loading.value = true
  try {
    const res = await api.get('/heirs/me')
    fillForm(res?.heir)
  } catch {
    fillForm(null)
  } finally {
    loading.value = false
  }
}

const save = async () => {
  if (submitting.value) return
  const payload = {
    name: form.value.name.trim(),
    cpf: onlyDigits(form.value.cpf),
    phone: onlyDigits(form.value.phone),
    email: form.value.email.trim(),
  }

  if (!payload.name || !payload.cpf || !payload.phone || !payload.email) {
    emit('triggerDevModal', {
      title: 'Campos obrigatórios',
      message: 'Preencha nome, CPF, telefone e e-mail do herdeiro.',
    })
    return
  }

  submitting.value = true
  try {
    const res = await api.put('/heirs/me', payload)
    fillForm(res?.heir)
    emit('triggerDevModal', {
      title: res?.emailsSent ? 'Herdeiro cadastrado!' : 'Herdeiro já estava atualizado',
      message: res?.emailsSent
        ? 'Enviamos um e-mail para o herdeiro e outro para confirmar o cadastro na sua conta.'
        : 'Os dados já estavam salvos, então nenhum e-mail duplicado foi enviado.',
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Não foi possível salvar', message: err?.message ?? 'Tente novamente.' })
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="heir-page">
    <div class="heir-hero">
      <div>
        <span class="badge badge-info">Herdeiro</span>
        <h1>Herdeiro dos recebimentos</h1>
        <p>Cadastre uma pessoa de confiança para ficar vinculada aos seus recebimentos em caso de falecimento.</p>
      </div>
      <div class="heir-status" :class="{ active: hasHeir }">
        <i :class="hasHeir ? 'ph ph-check-circle' : 'ph ph-user-plus'"></i>
        <span>{{ hasHeir ? 'Cadastrado' : 'Pendente' }}</span>
      </div>
    </div>

    <div v-if="loading" class="heir-card heir-empty">Carregando...</div>

    <template v-else>
      <div class="heir-card">
        <h3>{{ hasHeir ? 'Atualizar herdeiro' : 'Cadastrar herdeiro' }}</h3>
        <p class="heir-note">
          Ao salvar, o Viva Mais Club envia uma confirmação para você e um aviso para a pessoa escolhida.
        </p>

        <form class="heir-form" @submit.prevent="save">
          <div class="form-group wide">
            <label>Nome completo</label>
            <input v-model="form.name" type="text" class="form-control" autocomplete="name" />
          </div>
          <div class="form-group">
            <label>CPF</label>
            <input
              :value="form.cpf"
              type="text"
              class="form-control"
              inputmode="numeric"
              autocomplete="off"
              @input="form.cpf = formatCpf($event.target.value)"
            />
          </div>
          <div class="form-group">
            <label>Telefone</label>
            <input
              :value="form.phone"
              type="text"
              class="form-control"
              inputmode="tel"
              autocomplete="tel"
              @input="form.phone = formatPhone($event.target.value)"
            />
          </div>
          <div class="form-group wide">
            <label>E-mail</label>
            <input v-model="form.email" type="email" class="form-control" autocomplete="email" />
          </div>

          <button class="btn btn-secondary heir-submit" :disabled="submitting" type="submit">
            <i class="ph ph-floppy-disk"></i>
            {{ submitting ? 'Salvando...' : (hasHeir ? 'Salvar alterações' : 'Cadastrar herdeiro') }}
          </button>
        </form>
      </div>

      <div v-if="hasHeir" class="heir-card">
        <h3>Dados cadastrados</h3>
        <div class="heir-summary">
          <div><span>Nome</span><strong>{{ savedHeir.name }}</strong></div>
          <div><span>CPF</span><strong>{{ formatCpf(savedHeir.cpf) }}</strong></div>
          <div><span>Telefone</span><strong>{{ formatPhone(savedHeir.phone) }}</strong></div>
          <div><span>E-mail</span><strong>{{ savedHeir.email }}</strong></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.heir-page { display: flex; flex-direction: column; gap: 24px; }

.heir-hero {
  background: var(--primary);
  color: white;
  border-radius: var(--radius-lg);
  padding: 32px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
.heir-hero h1 { color: white; font-size: 26px; margin: 10px 0 6px; }
.heir-hero p { opacity: 0.9; font-size: 14px; max-width: 520px; }

.heir-status {
  min-width: 128px;
  text-align: center;
  background: rgba(255,255,255,0.12);
  padding: 16px 20px;
  border-radius: var(--radius-md);
  display: grid;
  gap: 6px;
  justify-items: center;
  font-weight: 700;
}
.heir-status i { font-size: 28px; }
.heir-status.active { background: rgba(0,179,169,0.22); }

.heir-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
}
.heir-card h3 { font-size: 18px; color: var(--secondary); margin-bottom: 12px; }
.heir-note { font-size: 14px; color: var(--text-gray); margin-bottom: 16px; }

.heir-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.heir-form .wide { grid-column: 1 / -1; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: var(--text-dark); font-weight: 500; }
.heir-submit { width: fit-content; }

.heir-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.heir-summary div {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px;
  min-width: 0;
}
.heir-summary span {
  display: block;
  font-size: 12px;
  color: var(--text-gray);
  margin-bottom: 4px;
}
.heir-summary strong {
  display: block;
  color: var(--text-dark);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.heir-empty { color: var(--text-gray); font-size: 14px; }

@media (max-width: 640px) {
  .heir-hero { flex-direction: column; align-items: flex-start; padding: 24px; }
  .heir-status { width: 100%; }
  .heir-form,
  .heir-summary { grid-template-columns: 1fr; }
}
</style>
