<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '../services/api'

const emit = defineEmits(['triggerDevModal'])
defineProps({ plan: { type: String, default: '' } })

const loading = ref(true)
const info = ref({ limit: 0, used: 0, canAdd: false, dependents: [] })
const submitting = ref(false)
const removingId = ref(null)

const form = ref({ name: '', email: '', cpf: '', phone: '', birthDate: '' })

const remaining = computed(() => Math.max(0, info.value.limit - info.value.used))

const load = async () => {
  loading.value = true
  try {
    info.value = await api.get('/dependents')
  } catch {
    emit('triggerDevModal', { title: 'Erro', message: 'Não foi possível carregar seus dependentes agora.' })
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.value = { name: '', email: '', cpf: '', phone: '', birthDate: '' }
}

const addDependent = async () => {
  if (submitting.value) return
  const f = form.value
  if (!f.name || !f.email || !f.cpf || !f.phone || !f.birthDate) {
    emit('triggerDevModal', { title: 'Campos obrigatórios', message: 'Preencha nome, e-mail, CPF, telefone e data de nascimento.' })
    return
  }
  submitting.value = true
  try {
    await api.post('/dependents', { ...f })
    resetForm()
    await load()
    emit('triggerDevModal', {
      title: 'Dependente cadastrado!',
      message: 'Enviamos um e-mail com o link de acesso e uma senha provisória para o dependente.',
    })
  } catch (err) {
    emit('triggerDevModal', { title: 'Não foi possível cadastrar', message: err?.message ?? 'Tente novamente.' })
  } finally {
    submitting.value = false
  }
}

const removeDependent = async (dep) => {
  if (removingId.value) return
  removingId.value = dep.id
  try {
    await api.delete(`/dependents/${dep.id}`)
    await load()
  } catch (err) {
    emit('triggerDevModal', { title: 'Erro ao remover', message: err?.message ?? 'Tente novamente.' })
  } finally {
    removingId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="dependents-page">
    <div class="dep-hero">
      <div>
        <span class="badge badge-info">Dependentes</span>
        <h1>Meus Dependentes</h1>
        <p>Cadastre pessoas da sua família para acessarem o portal. Cada dependente recebe o acesso por e-mail.</p>
      </div>
      <div class="dep-counter">
        <strong>{{ info.used }}</strong>
        <span>de {{ info.limit }} usados</span>
      </div>
    </div>

    <div v-if="loading" class="dep-empty">Carregando…</div>

    <template v-else>
      <!-- Formulário de cadastro -->
      <div class="dep-card">
        <h3>Adicionar dependente</h3>
        <p v-if="info.limit === 0" class="dep-note warn">
          Seu plano <strong>{{ plan }}</strong> não inclui dependentes.
        </p>
        <p v-else-if="!info.canAdd" class="dep-note warn">
          Você atingiu o limite de {{ info.limit }} dependente(s) do seu plano.
        </p>
        <p v-else class="dep-note">Você ainda pode adicionar <strong>{{ remaining }}</strong> dependente(s).</p>

        <div class="dep-form" :class="{ disabled: !info.canAdd }">
          <div class="form-group">
            <label>Nome completo</label>
            <input v-model="form.name" type="text" class="form-control" :disabled="!info.canAdd" />
          </div>
          <div class="form-group">
            <label>E-mail</label>
            <input v-model="form.email" type="email" class="form-control" :disabled="!info.canAdd" />
          </div>
          <div class="form-group">
            <label>CPF</label>
            <input v-model="form.cpf" type="text" class="form-control" placeholder="Somente números" :disabled="!info.canAdd" />
          </div>
          <div class="form-group">
            <label>Telefone</label>
            <input v-model="form.phone" type="text" class="form-control" placeholder="DDD + número" :disabled="!info.canAdd" />
          </div>
          <div class="form-group">
            <label>Data de nascimento</label>
            <input v-model="form.birthDate" type="text" class="form-control" placeholder="DD/MM/AAAA" :disabled="!info.canAdd" />
          </div>
        </div>
        <button class="btn btn-secondary" :disabled="!info.canAdd || submitting" @click="addDependent">
          <i class="ph ph-user-plus"></i> {{ submitting ? 'Cadastrando…' : 'Cadastrar dependente' }}
        </button>
      </div>

      <!-- Listagem -->
      <div class="dep-card">
        <h3>Dependentes cadastrados</h3>
        <div v-if="info.dependents.length === 0" class="dep-empty">Nenhum dependente cadastrado ainda.</div>
        <ul v-else class="dep-list">
          <li v-for="dep in info.dependents" :key="dep.id" class="dep-item">
            <div class="dep-avatar"><i class="ph ph-user"></i></div>
            <div class="dep-meta">
              <strong>{{ dep.name }}</strong>
              <span>{{ dep.email }}</span>
            </div>
            <button class="btn-remove" :disabled="removingId === dep.id" @click="removeDependent(dep)">
              <i class="ph ph-trash"></i> {{ removingId === dep.id ? 'Removendo…' : 'Remover' }}
            </button>
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dependents-page { display: flex; flex-direction: column; gap: 24px; }

.dep-hero {
  background: var(--primary);
  color: white; border-radius: var(--radius-lg); padding: 32px;
  display: flex; justify-content: space-between; align-items: center; gap: 24px;
}
.dep-hero h1 { color: white; font-size: 26px; margin: 10px 0 6px; }
.dep-hero p { opacity: 0.9; font-size: 14px; max-width: 460px; }
.dep-counter { text-align: center; background: rgba(255,255,255,0.12); padding: 16px 24px; border-radius: var(--radius-md); }
.dep-counter strong { display: block; font-size: 32px; line-height: 1; }
.dep-counter span { font-size: 12px; opacity: 0.85; }

.dep-card {
  background: white; border: 1px solid var(--border-color);
  border-radius: var(--radius-md); padding: 24px;
}
.dep-card h3 { font-size: 18px; color: var(--secondary); margin-bottom: 12px; }

.dep-note { font-size: 14px; color: var(--text-gray); margin-bottom: 16px; }
.dep-note.warn { color: #b45309; }

.dep-form { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.dep-form.disabled { opacity: 0.55; }
@media (max-width: 640px) { .dep-form { grid-template-columns: 1fr; } .dep-hero { flex-direction: column; align-items: flex-start; } }

.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 13px; color: var(--text-dark); font-weight: 500; }

.dep-list { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.dep-item { display: flex; align-items: center; gap: 14px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); }
.dep-avatar { font-size: 22px; color: var(--primary-hover); background: var(--primary-light); width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; }
.dep-meta { display: flex; flex-direction: column; flex: 1; }
.dep-meta strong { font-size: 15px; color: var(--text-dark); }
.dep-meta span { font-size: 13px; color: var(--text-gray); }

.btn-remove {
  background: transparent; border: 1px solid #ef4444; color: #ef4444;
  padding: 6px 14px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px;
  display: flex; align-items: center; gap: 6px;
}
.btn-remove:disabled { opacity: 0.5; cursor: default; }

.dep-empty { color: var(--text-gray); font-size: 14px; padding: 12px 0; }
</style>
