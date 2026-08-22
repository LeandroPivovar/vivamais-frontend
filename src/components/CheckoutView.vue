<script setup>
import { ref, onMounted, computed } from 'vue'
import QRCode from 'qrcode'
import { api, lookupCep, tokenizeCard } from '../services/api'

// Cartão (Pagar.me)
const cardEnabled = ref(false)
const cardPublicKey = ref('')
const paymentMethod = ref('pix')
const card = ref({ number: '', name: '', expiry: '', cvv: '' })
function parseExpiry(raw) {
  const d = (raw || '').replace(/\D/g, '')
  const year = d.slice(2).length === 2 ? `20${d.slice(2)}` : d.slice(2, 6)
  return { exp_month: Number(d.slice(0, 2)), exp_year: Number(year) }
}

// Gera um QR Code (dataURL) a partir do código PIX copia-e-cola.
async function genQr(code) {
  if (!code) return ''
  try {
    return await QRCode.toDataURL(code, { margin: 1, width: 220 })
  } catch {
    return ''
  }
}

// Preenche endereço a partir do CEP (ViaCEP via backend).
const onCep = async () => {
  const r = await lookupCep(form.value.zipCode)
  if (!r) return
  if (r.street) form.value.address = r.street
  if (r.neighborhood) form.value.neighborhood = r.neighborhood
  if (r.city) form.value.city = r.city
  if (r.state) form.value.state = r.state
}

const emit = defineEmits(['goLogin'])

const PLAN_BY_SLUG = {
  bronze: 'Bronze',
  individual: 'Individual',
  familia: 'Família',
  'viva-mais-premium': 'Viva Mais Premium',
}
const BRAZIL_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

const refCode = ref('')
const trialToken = ref('')
const trialEndsAt = ref('')
const planType = ref('Individual')
const prices = ref({})
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const done = ref(false)
const pixCode = ref('')
const pixImage = ref('')
const status = ref('')

const isTrialSignup = computed(() => !!trialToken.value)

const form = ref({
  name: '', email: '', cpf: '', phone: '', birthDate: '', gender: '',
  zipCode: '', address: '', neighborhood: '', complement: '', city: '', state: '',
})

const planPrice = computed(() => prices.value[planType.value] ?? '')

const toBrDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

onMounted(async () => {
  const params = new URLSearchParams(window.location.search)
  refCode.value = params.get('ref') || ''
  // /plano-{slug}
  const m = window.location.pathname.match(/\/plano-([a-z0-9-]+)/i)
  if (m && PLAN_BY_SLUG[m[1].toLowerCase()]) planType.value = PLAN_BY_SLUG[m[1].toLowerCase()]
  const trialMatch = window.location.pathname.match(/\/cadastro-30-dias\/([a-z0-9]+)/i)
  if (trialMatch) {
    trialToken.value = trialMatch[1]
    try {
      const info = await api.get(`/billing/trial-link/${trialToken.value}`)
      planType.value = info?.plan || 'Individual'
    } catch (err) {
      error.value = err?.message || 'Este link de cadastro não está disponível.'
    }
  }
  // Registra o clique no link de indicação (best-effort, não bloqueia a tela).
  if (!isTrialSignup.value && refCode.value) {
    api.post('/billing/referral-click', { ref: refCode.value, planType: planType.value }).catch(() => {})
  }
  try {
    prices.value = await api.get('/content/pricing')
  } catch {
    // segue sem preço — o total aparece após confirmar
  } finally {
    loading.value = false
  }
  try {
    const c = await api.get('/billing/card-config')
    cardEnabled.value = !!c?.enabled
    cardPublicKey.value = c?.publicKey || ''
  } catch { cardEnabled.value = false }
})

const submit = async () => {
  if (submitting.value) return
  error.value = ''
  const f = form.value
  for (const [k, label] of [['name','Nome'],['email','E-mail'],['cpf','CPF'],['phone','Telefone'],['birthDate','Nascimento'],['gender','Gênero'],['zipCode','CEP'],['address','Endereço'],['neighborhood','Bairro'],['city','Cidade'],['state','Estado']]) {
    if (!f[k]) { error.value = `Preencha: ${label}.`; return }
  }
  submitting.value = true
  try {
    let cardToken
    if (isTrialSignup.value) {
      const res = await api.post('/billing/trial-signup', {
        token: trialToken.value,
        name: f.name, email: f.email, cpf: f.cpf, phone: f.phone,
        birthDate: toBrDate(f.birthDate), gender: f.gender,
        address: f.address, neighborhood: f.neighborhood,
        complement: f.complement || undefined,
        city: f.city, state: f.state, zipCode: f.zipCode,
      })
      status.value = res?.status || 'trial_active'
      trialEndsAt.value = res?.trialEndsAt || ''
      done.value = true
      return
    }
    if (paymentMethod.value === 'card') {
      if (!cardPublicKey.value) throw new Error('Pagamento com cartão indisponível no momento.')
      const { exp_month, exp_year } = parseExpiry(card.value.expiry)
      cardToken = await tokenizeCard(cardPublicKey.value, {
        number: card.value.number.replace(/\D/g, ''),
        holder_name: card.value.name,
        exp_month, exp_year,
        cvv: card.value.cvv.replace(/\D/g, ''),
      }, {
        line_1: `${f.address}, ${f.neighborhood}`.trim().replace(/^,|,$/g, ''),
        zip_code: (f.zipCode || '').replace(/\D/g, ''),
        city: f.city,
        state: f.state,
        country: 'BR',
      })
    }
    const res = await api.post('/billing/checkout', {
      refCode: refCode.value,
      planType: planType.value,
      name: f.name, email: f.email, cpf: f.cpf, phone: f.phone,
      birthDate: toBrDate(f.birthDate), gender: f.gender,
      address: f.address, neighborhood: f.neighborhood,
      complement: f.complement || undefined,
      city: f.city, state: f.state, zipCode: f.zipCode,
      paymentMethod: paymentMethod.value,
      cardToken,
    })
    status.value = res?.status || 'pending'
    pixCode.value = res?.pixCode || ''
    // QR sempre gerado do código (não depende da imagem da Veenca).
    pixImage.value = pixCode.value ? await genQr(pixCode.value) : (res?.pixImage || '')
    done.value = true
  } catch (err) {
    error.value = err?.message ?? 'Não foi possível concluir o cadastro. Tente novamente.'
  } finally {
    submitting.value = false
  }
}

const copyPix = async () => {
  try { await navigator.clipboard.writeText(pixCode.value) } catch { /* ignora */ }
}
</script>

<template>
  <div class="checkout-public">
    <header class="cp-header">
      <img src="/logo.png" alt="Viva Mais Club" class="cp-logo" />
    </header>

    <div class="cp-body">
      <!-- Sucesso -->
      <div v-if="done" class="cp-card cp-success">
        <i class="ph ph-check-circle"></i>
        <h2>Cadastro recebido!</h2>
        <!-- Pago (cartão aprovado na hora, ou PIX já confirmado) -->
        <template v-if="status === 'paid'">
          <p>Seu plano <strong>{{ planType }}</strong> foi ativado. Enviamos o acesso (e-mail + senha provisória) no seu e-mail.</p>
        </template>

        <!-- Cadastro 30 dias -->
        <template v-else-if="status === 'trial_active'">
          <p>Seu plano <strong>{{ planType }}</strong> foi liberado por 30 dias. Enviamos o acesso (e-mail + senha provisória) no seu e-mail.</p>
          <p v-if="trialEndsAt" class="cp-note">O primeiro pagamento vence em <strong>{{ trialEndsAt }}</strong>. Antes disso enviaremos lembretes por e-mail.</p>
        </template>

        <!-- Cartão em processamento -->
        <template v-else-if="paymentMethod === 'card'">
          <p>Recebemos seu pagamento no <strong>cartão</strong>. A confirmação chega em instantes e o plano <strong>{{ planType }}</strong> é ativado automaticamente. Enviamos o acesso no seu e-mail.</p>
        </template>

        <!-- PIX Automático: precisa autorizar no banco -->
        <template v-else>
          <p>Falta só <strong>autorizar o débito automático</strong> no app do seu banco. Escaneie o QR abaixo (ou use o Copia e Cola) e confirme a recorrência para ativar o plano <strong>{{ planType }}</strong>.</p>
          <div v-if="pixCode" class="cp-pix">
            <img v-if="pixImage" :src="pixImage" alt="QR Code Pix Automático" class="cp-qr" />
            <label>Pix Automático — Copia e Cola</label>
            <textarea readonly rows="3" class="form-control" :value="pixCode"></textarea>
            <button class="btn btn-secondary btn-full" @click="copyPix"><i class="ph ph-copy"></i> Copiar código</button>
          </div>
          <p class="cp-note">Você autoriza <strong>uma única vez</strong> no app do banco; a mensalidade passa a ser debitada automaticamente todo mês. Assim que a autorização for confirmada, seu plano é ativado — acesse com o e-mail e a senha provisória enviados.</p>
        </template>

        <button class="btn btn-outline btn-full" @click="emit('goLogin')">Ir para o login</button>
      </div>

      <!-- Formulário -->
      <div v-else class="cp-grid">
        <div class="cp-card">
          <h1>{{ isTrialSignup ? 'Finalize seu cadastro' : 'Finalize sua assinatura' }}</h1>
          <p class="cp-sub">
            Plano <strong>{{ planType }}</strong><span v-if="planPrice && !isTrialSignup"> — {{ planPrice }}</span>
            <span v-if="isTrialSignup"> — 30 dias iniciais sem pagamento</span>
          </p>

          <div v-if="loading" class="cp-note">Carregando…</div>

          <form v-else @submit.prevent="submit" class="cp-form">
            <div class="cp-section">Seus dados</div>
            <div class="form-group"><label>Nome completo</label><input v-model="form.name" type="text" class="form-control" /></div>
            <div class="cp-row">
              <div class="form-group"><label>E-mail</label><input v-model="form.email" type="email" class="form-control" /></div>
              <div class="form-group"><label>Telefone</label><input v-model="form.phone" type="text" class="form-control" placeholder="DDD + número" /></div>
            </div>
            <div class="cp-row">
              <div class="form-group"><label>CPF</label><input v-model="form.cpf" type="text" class="form-control" placeholder="Somente números" /></div>
              <div class="form-group"><label>Data de nascimento</label><input v-model="form.birthDate" type="date" class="form-control" /></div>
            </div>
            <div class="form-group">
              <label>Gênero</label>
              <select v-model="form.gender" class="form-control">
                <option value="" disabled>Selecione</option>
                <option value="MASCULINO">Masculino</option>
                <option value="FEMININO">Feminino</option>
              </select>
            </div>

            <div class="cp-section">Endereço</div>
            <div class="cp-row">
              <div class="form-group"><label>CEP</label><input v-model="form.zipCode" @input="onCep" type="text" class="form-control" placeholder="Somente números" /></div>
              <div class="form-group"><label>Cidade</label><input v-model="form.city" type="text" class="form-control" /></div>
            </div>
            <div class="form-group"><label>Endereço</label><input v-model="form.address" type="text" class="form-control" placeholder="Rua e número" /></div>
            <div class="cp-row">
              <div class="form-group"><label>Bairro</label><input v-model="form.neighborhood" type="text" class="form-control" /></div>
              <div class="form-group">
                <label>Estado</label>
                <select v-model="form.state" class="form-control">
                  <option value="" disabled>UF</option>
                  <option v-for="uf in BRAZIL_STATES" :key="uf" :value="uf">{{ uf }}</option>
                </select>
              </div>
            </div>
            <div class="form-group"><label>Complemento (opcional)</label><input v-model="form.complement" type="text" class="form-control" placeholder="Apto, bloco…" /></div>

            <template v-if="!isTrialSignup">
            <div class="cp-section">Pagamento</div>
            <div v-if="cardEnabled" class="cp-pay-methods">
              <button type="button" :class="['cp-pay-opt', { active: paymentMethod === 'pix' }]" @click="paymentMethod = 'pix'">
                <i class="ph ph-qr-code"></i> Pix Automático
              </button>
              <button type="button" :class="['cp-pay-opt', { active: paymentMethod === 'card' }]" @click="paymentMethod = 'card'">
                <i class="ph ph-credit-card"></i> Cartão de Crédito
              </button>
            </div>

            <div v-if="paymentMethod === 'pix'" class="cp-pix-note">
              <i class="ph ph-qr-code"></i>
              <div>
                <strong>Pix Automático (débito automático)</strong>
                <span>Você autoriza uma vez no app do banco e a mensalidade é debitada todo mês, sozinha. O QR de autorização aparece após confirmar.</span>
              </div>
            </div>

            <div v-else class="cp-card-form">
              <div class="form-group"><label>Número do cartão</label><input v-model="card.number" type="text" inputmode="numeric" class="form-control" placeholder="0000 0000 0000 0000" /></div>
              <div class="form-group"><label>Nome impresso no cartão</label><input v-model="card.name" type="text" class="form-control" placeholder="Como está no cartão" /></div>
              <div class="cp-row">
                <div class="form-group"><label>Validade (MM/AA)</label><input v-model="card.expiry" type="text" class="form-control" placeholder="MM/AA" maxlength="5" /></div>
                <div class="form-group"><label>CVV</label><input v-model="card.cvv" type="text" inputmode="numeric" class="form-control" placeholder="123" maxlength="4" /></div>
              </div>
              <p class="cp-note" style="margin:0;">Assinatura mensal no cartão, cobrada automaticamente. Cancele quando quiser.</p>
            </div>
            </template>

            <div v-else class="cp-pix-note">
              <i class="ph ph-calendar-check"></i>
              <div>
                <strong>30 dias liberados</strong>
                <span>Você paga somente após 30 dias. Enviaremos avisos 7, 3 e 1 dia antes do vencimento.</span>
              </div>
            </div>

            <p v-if="error" class="cp-error">{{ error }}</p>
            <button type="submit" class="btn btn-secondary btn-full cp-submit" :disabled="submitting">
              {{ submitting ? 'Processando…' : (isTrialSignup ? 'Criar conta 30 dias' : (paymentMethod === 'card' ? 'Assinar com cartão' : 'Confirmar e gerar Pix Automático')) }}
            </button>
            <button type="button" class="cp-login-link" @click="emit('goLogin')">Já tem conta? Entrar</button>
          </form>
        </div>

        <aside class="cp-card cp-summary">
          <h4>Resumo</h4>
          <div class="cp-sum-row"><span>Plano</span><strong>{{ planType }}</strong></div>
          <div class="cp-sum-row"><span>Periodicidade</span><strong>Mensal</strong></div>
          <div class="cp-sum-row"><span>Pagamento</span><strong>{{ isTrialSignup ? 'Após 30 dias' : (paymentMethod === 'card' ? 'Cartão de Crédito' : 'Pix Automático') }}</strong></div>
          <div class="cp-sum-row total"><span>{{ isTrialSignup ? 'Hoje' : 'Total/mês' }}</span><strong>{{ isTrialSignup ? 'R$ 0,00' : (planPrice || '—') }}</strong></div>
          <p class="cp-note">{{ isTrialSignup ? 'O primeiro pagamento será solicitado depois do período inicial. O link é único e só pode ser usado uma vez.' : 'Débito automático mensal via Pix. Você autoriza uma vez no banco. Cancele quando quiser.' }}</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkout-public { min-height: 100vh; background: var(--bg-gray, #f4f6f8); }
.cp-header { display: flex; align-items: center; gap: 10px; padding: 16px 24px; background: white; border-bottom: 1px solid var(--border-color); }
.cp-logo { max-height: 30px; }
.cp-brand { font-weight: 700; color: var(--secondary); }
.cp-body { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.cp-grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 20px; align-items: start; }
@media (max-width: 820px) { .cp-grid { grid-template-columns: 1fr; } }

.cp-card { background: white; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 24px; }
.cp-card h1 { font-size: 22px; color: var(--secondary); margin-bottom: 4px; }
.cp-sub { color: var(--text-gray); margin-bottom: 16px; }
.cp-section { font-size: 13px; font-weight: 700; text-transform: uppercase; color: var(--secondary); margin: 18px 0 10px; letter-spacing: 0.03em; }
.cp-form .form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.cp-form label { font-size: 13px; color: var(--text-dark); font-weight: 500; }
.cp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 520px) { .cp-row { grid-template-columns: 1fr; } }

.cp-pay-methods { display: flex; gap: 10px; margin-bottom: 12px; }
.cp-pay-opt { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: #fff; cursor: pointer; font-weight: 600; color: var(--text-gray); font-size: 14px; }
.cp-pay-opt.active { border-color: var(--secondary); color: var(--secondary); box-shadow: 0 0 0 1px var(--secondary) inset; }
.cp-card-form { display: flex; flex-direction: column; gap: 12px; }
.cp-pix-note { display: flex; align-items: center; gap: 12px; background: var(--bg-gray, #f4f6f8); border: 1px dashed var(--border-color); border-radius: var(--radius-sm); padding: 14px; }
.cp-pix-note i { font-size: 32px; color: var(--secondary); }
.cp-pix-note strong { display: block; color: var(--secondary); }
.cp-pix-note span { font-size: 12px; color: var(--text-gray); }

.cp-submit { margin-top: 18px; height: 48px; font-weight: 700; }
.cp-error { color: #ef4444; font-size: 13px; margin-top: 12px; }
.cp-login-link { display: block; width: 100%; margin-top: 12px; background: none; border: none; color: var(--secondary); cursor: pointer; font-size: 14px; text-decoration: underline; }

.cp-summary h4 { font-size: 15px; color: var(--secondary); margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; }
.cp-sum-row { display: flex; justify-content: space-between; font-size: 14px; padding: 6px 0; color: var(--text-dark); }
.cp-sum-row.total { border-top: 1px solid var(--border-color); margin-top: 6px; padding-top: 12px; font-size: 16px; }
.cp-note { font-size: 12px; color: var(--text-gray); margin-top: 10px; }

.cp-success { max-width: 480px; margin: 24px auto; text-align: center; }
.cp-success i { font-size: 56px; color: #16a34a; }
.cp-success h2 { color: var(--secondary); margin: 8px 0; }
.cp-pix { margin: 20px 0; text-align: left; }
.cp-pix label { font-size: 13px; font-weight: 600; display: block; margin-bottom: 6px; }
.cp-qr { display: block; max-width: 180px; margin: 0 auto 12px; }
.btn-full { width: 100%; }
</style>
