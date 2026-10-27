<script setup>
import { ref, onMounted, computed } from 'vue'
import QRCode from 'qrcode'
import { initTikTok, trackTikTokCart } from '../services/tiktok'
import { loadCampaignPixels, trackCampaignCheckout, trackCampaignPurchase } from '../services/campaignPixels'
import { api, lookupCep, tokenizeCard, formatCpf } from '../services/api'

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
const offerType = ref('') // '' | 'promocional'
const prices = ref({})
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const done = ref(false)
const pixCode = ref('')
const pixImage = ref('')
const status = ref('')

const isTrialSignup = computed(() => !!trialToken.value)
const isPromoOffer = computed(() => offerType.value === 'promocional')

// Oferta de 1º mês: link do admin (/oferta/<slug>) ou a oferta fixa antiga (/plano-familia).
// firstMonthPrice é cobrado agora; regularPrice nas mensalidades seguintes.
const promoSlug = ref('')
const promo = ref(null) // { firstMonthPrice: number, regularPrice: number|null }
const promoUnavailable = ref('')
const brl = (n) => (n == null ? '' : `R$ ${Number(n).toFixed(2).replace('.', ',')}`)
const promoFirst = computed(() => brl(promo.value?.firstMonthPrice))
const promoRegular = computed(() => {
  if (promo.value?.regularPrice != null) return brl(promo.value.regularPrice)
  return prices.value[planType.value] ?? ''
})

const showPassword = ref(false)
const form = ref({
  name: '', email: '', cpf: '', password: '', phone: '', birthDate: '', gender: '',
  zipCode: '', address: '', neighborhood: '', complement: '', city: '', state: '',
})

const planPrice = computed(() => {
  if (isPromoOffer.value) return promoFirst.value
  return prices.value[planType.value] ?? ''
})

/**
 * Purchase no TikTok Pixel. O eventID é o mesmo que a Events API usa no
 * backend — sem ele o TikTok contaria a mesma venda duas vezes.
 */
const planPriceNumber = () => Number(String(planPrice.value).replace(/[^\d,]/g, '').replace(',', '.')) || 0
const trackPurchase = (transactionId) => {
  trackCampaignPurchase(planType.value, planPriceNumber(), transactionId)
  if (typeof window === 'undefined' || typeof window.ttq?.track !== 'function') return
  const value = planPriceNumber()
  try {
    window.ttq.track(
      'Purchase',
      { value, currency: 'BRL', content_name: `Plano ${planType.value}`, content_type: 'product' },
      { event_id: `vm-purchase-${transactionId}` },
    )
  } catch {
    // pixel nunca pode derrubar a tela de sucesso da compra
  }
}

const toBrDate = (iso) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

onMounted(async () => {
  initTikTok()
  const params = new URLSearchParams(window.location.search)
  refCode.value = params.get('ref') || ''

  const curPath = window.location.pathname.toLowerCase()
  if (curPath.includes('familia-promocional') || curPath.includes('plano-familia') || curPath.includes('checkout-familia')) {
    planType.value = 'Família'
    offerType.value = 'promocional'
    promo.value = { firstMonthPrice: 19.9, regularPrice: null }
  }

  // /oferta/{slug} — link de oferta criado no admin
  const promoMatch = window.location.pathname.match(/\/oferta\/([a-z0-9-]+)/i)
  if (promoMatch) {
    promoSlug.value = promoMatch[1].toLowerCase()
    try {
      const info = await api.get(`/billing/promo/${promoSlug.value}`)
      planType.value = info.plan
      offerType.value = 'promocional'
      promo.value = { firstMonthPrice: info.firstMonthPrice, regularPrice: info.regularPrice }
      if (!info.available) promoUnavailable.value = info.reason || 'Esta oferta não está mais disponível.'
      loadCampaignPixels(info)
    } catch (err) {
      promoUnavailable.value = err?.message || 'Oferta não encontrada.'
    }
  }

  // /plano-{slug}
  const m = window.location.pathname.match(/\/plano-([a-z0-9-]+)/i)
  if (m && PLAN_BY_SLUG[m[1].toLowerCase()] && !offerType.value) {
    planType.value = PLAN_BY_SLUG[m[1].toLowerCase()]
  }
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

let tikTokCartTracked = false
const submit = async () => {
  if (submitting.value) return
  error.value = ''
  if (promoUnavailable.value) { error.value = promoUnavailable.value; return }
  const f = form.value
  for (const [k, label] of [['name','Nome'],['email','E-mail'],['cpf','CPF'],['phone','Telefone'],['birthDate','Nascimento'],['gender','Gênero'],['zipCode','CEP'],['address','Endereço'],['neighborhood','Bairro'],['city','Cidade'],['state','Estado']]) {
    if (!f[k]) { error.value = `Preencha: ${label}.`; return }
  }
  if (!f.password || f.password.trim().length < 6) {
    error.value = 'Crie uma senha com pelo menos 6 caracteres.';
    return;
  }
  if (!isTrialSignup.value && !tikTokCartTracked) {
    trackTikTokCart(planType.value, planPrice.value)
    trackCampaignCheckout(planType.value, planPriceNumber())
    tikTokCartTracked = true
  }
  submitting.value = true
  try {
    let cardToken
    if (isTrialSignup.value) {
      const res = await api.post('/billing/trial-signup', {
        token: trialToken.value,
        password: f.password || undefined,
        name: f.name, email: f.email, cpf: f.cpf, phone: f.phone,
        birthDate: toBrDate(f.birthDate), gender: f.gender,
        address: f.address, neighborhood: f.neighborhood,
        complement: f.complement || undefined,
        city: f.city, state: f.state, zipCode: f.zipCode,
      })
      status.value = res?.status || 'trial_pending_pix'
      trialEndsAt.value = res?.trialEndsAt || ''
      pixCode.value = res?.pixCode || ''
      pixImage.value = pixCode.value ? await genQr(pixCode.value) : ''
      done.value = true
      if (status.value === 'trial_pending_pix' && res?.transactionId) {
        startTrialPoll(res.transactionId)
      }
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
      // Link de oferta: o backend usa o slug (valores e limites ficam no servidor).
      offer: promoSlug.value ? undefined : (offerType.value || undefined),
      promoSlug: promoSlug.value || undefined,
      password: f.password || undefined,
      name: f.name, email: f.email, cpf: f.cpf, phone: f.phone,
      birthDate: toBrDate(f.birthDate), gender: f.gender,
      address: f.address, neighborhood: f.neighborhood,
      complement: f.complement || undefined,
      city: f.city, state: f.state, zipCode: f.zipCode,
      paymentMethod: paymentMethod.value,
      cardToken,
    })
    status.value = res?.status || 'pending'
    // Purchase no pixel só quando o pagamento realmente fechou. PIX sai daqui como
    // 'pending' e só confirma no webhook — nesse caso quem reporta é a Conversions
    // API no backend, que usa o mesmo eventID e o TikTok deduplica.
    if (res?.status === 'paid' && res?.transactionId) {
      trackPurchase(res.transactionId)
    }
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

let trialPollTimer = null
const startTrialPoll = (txId) => {
  if (trialPollTimer) clearInterval(trialPollTimer)
  trialPollTimer = setInterval(async () => {
    try {
      const r = await api.get(`/billing/transactions/${txId}/status`)
      if (r?.status === 'paid') {
        clearInterval(trialPollTimer)
        trialPollTimer = null
        status.value = 'trial_active'
      } else if (r?.status === 'cancelled') {
        clearInterval(trialPollTimer)
        trialPollTimer = null
      }
    } catch { /* ignora falha momentânea */ }
  }, 4000)
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
        <h2>{{ status === 'trial_pending_pix' ? 'Autorize o Pix Automático (D+30)' : 'Cadastro recebido!' }}</h2>
        <!-- Pago (cartão aprovado na hora, ou PIX já confirmado) -->
        <template v-if="status === 'paid'">
          <p>Seu plano <strong>{{ planType }}</strong> foi ativado. Enviamos a confirmação de acesso no seu e-mail.</p>
        </template>

        <!-- Cadastro 30 dias já autorizado -->
        <template v-else-if="status === 'trial_active'">
          <p>Seu plano <strong>{{ planType }}</strong> foi liberado por 30 dias grátis! Você já pode acessar a plataforma com seu CPF/e-mail e a senha escolhida.</p>
          <p v-if="trialEndsAt" class="cp-note">A primeira cobrança automática ocorrerá somente em <strong>{{ trialEndsAt }}</strong> (D+30).</p>
        </template>

        <!-- Cadastro 30 dias aguardando autorização do Pix Automático D+30 -->
        <template v-else-if="status === 'trial_pending_pix'">
          <p>
            Para liberar seus <strong>30 dias grátis</strong> no plano <strong>{{ planType }}</strong>, escaneie o QR Code abaixo (ou use o Copia e Cola) no app do seu banco e <strong>autorize a recorrência do Pix Automático</strong>.
          </p>
          <div v-if="pixCode" class="cp-pix">
            <img v-if="pixImage" :src="pixImage" alt="QR Code Pix Automático D+30" class="cp-qr" />
            <label>Pix Automático (D+30) — Copia e Cola</label>
            <textarea readonly rows="3" class="form-control" :value="pixCode"></textarea>
            <button class="btn btn-secondary btn-full" @click="copyPix"><i class="ph ph-copy"></i> Copiar código</button>
          </div>
          <p class="cp-note">
            <strong>Nenhum valor será cobrado hoje (R$ 0,00).</strong> A primeira mensalidade<span v-if="planPrice"> de <strong>{{ planPrice }}</strong></span> só será debitada automaticamente em <strong>{{ trialEndsAt }}</strong> (após os 30 dias grátis). Assim que você autorizar no banco, seus 30 dias grátis são liberados na hora!
          </p>
        </template>

        <!-- Cartão em processamento -->
        <template v-else-if="paymentMethod === 'card'">
          <p>Recebemos seu pagamento no <strong>cartão</strong>. A confirmação chega em instantes e o plano <strong>{{ planType }}</strong> é ativado automaticamente. Enviamos o acesso no seu e-mail.</p>
        </template>

        <!-- PIX Automático: precisa autorizar no banco -->
        <template v-else>
          <p v-if="isPromoOffer">
            Escaneie o QR Code abaixo no app do seu banco ou use o Copia e Cola para pagar <strong>{{ planPrice }}</strong> e ativar imediatamente seu <strong>Plano {{ planType }}</strong>.
          </p>
          <p v-else>Falta só <strong>autorizar o débito automático</strong> no app do seu banco. Escaneie o QR abaixo (ou use o Copia e Cola) e confirme a recorrência para ativar o plano <strong>{{ planType }}</strong>.</p>
          <div v-if="pixCode" class="cp-pix">
            <img v-if="pixImage" :src="pixImage" alt="QR Code Pix" class="cp-qr" />
            <label>{{ isPromoOffer ? 'Pix Copia e Cola' : 'Pix Automático — Copia e Cola' }}</label>
            <textarea readonly rows="3" class="form-control" :value="pixCode"></textarea>
            <button class="btn btn-secondary btn-full" @click="copyPix"><i class="ph ph-copy"></i> Copiar código</button>
          </div>
          <p class="cp-note" v-if="isPromoOffer">A primeira mensalidade é de <strong>{{ promoFirst }}</strong>. A partir do 2º mês, o plano renova no valor regular de <strong>{{ promoRegular }}/mês</strong> — no banco, autorize um limite de pelo menos esse valor. Cancele quando quiser sem multas.</p>
          <p class="cp-note" v-else>Você autoriza <strong>uma única vez</strong> no app do banco; a mensalidade passa a ser debitada automaticamente todo mês. Assim que a autorização for confirmada, seu plano é ativado — acesse com seu CPF/e-mail e a senha escolhida.</p>
        </template>

        <button class="btn btn-outline btn-full" @click="emit('goLogin')">Ir para o login</button>
      </div>

      <!-- Formulário -->
      <div v-else class="cp-grid">
        <div class="cp-card">
          <!-- Oferta de 1º mês (link do admin ou /plano-familia) -->
          <template v-if="isPromoOffer">
            <div class="cp-promo-badge">
              <i class="ph ph-sparkle"></i> CONDIÇÃO EXCLUSIVA • 1º MÊS
            </div>
            <h1 class="cp-title-promo">Plano {{ planType }} por {{ promoFirst }}</h1>
            <p class="cp-sub">
              <template v-if="planType === 'Família'">Proteja toda a sua família por <strong>{{ promoFirst }}</strong> no primeiro mês. Acesso imediato para você + até 4 dependentes.</template>
              <template v-else>Sua proteção completa por <strong>{{ promoFirst }}</strong> no primeiro mês, com acesso imediato.</template>
            </p>
          </template>

          <!-- Padrão / Trial -->
          <template v-else>
            <h1>{{ isTrialSignup ? 'Finalize seu cadastro' : 'Finalize sua assinatura' }}</h1>
            <p class="cp-sub">
              Plano <strong>{{ planType }}</strong><span v-if="planPrice && !isTrialSignup"> — {{ planPrice }}</span>
              <span v-if="isTrialSignup"> — 30 dias iniciais sem pagamento</span>
            </p>
          </template>

          <!-- Link de oferta expirado/esgotado/encerrado/inexistente: explica e bloqueia a compra -->
          <p v-if="promoUnavailable" class="cp-error" style="margin-top: 0;">{{ promoUnavailable }}</p>

          <div v-if="loading" class="cp-note">Carregando…</div>

          <form v-else @submit.prevent="submit" class="cp-form">
            <!-- Card de destaque da oferta de 1º mês -->
            <div v-if="isPromoOffer" class="cp-offer-card">
              <div class="cp-offer-header">
                <div>
                  <span class="cp-offer-name">Plano {{ planType }} Completo</span>
                  <span class="cp-offer-dep">{{ planType === 'Família' ? 'Titular + até 4 dependentes' : 'Titular' }}</span>
                </div>
                <div class="cp-offer-price">
                  <span class="cp-strikethrough">De {{ promoRegular }}</span>
                  <strong>{{ promoFirst }} <small>/ 1º mês</small></strong>
                </div>
              </div>
              <div class="cp-offer-perks">
                <span><i class="ph ph-first-aid"></i> Telemedicina Médica 24h</span>
                <span><i class="ph ph-tag"></i> Clube Certo (Até 50% desc.)</span>
                <span><i class="ph ph-dog"></i> Orientação Veterinária 24h</span>
                <span v-if="planType === 'Família'"><i class="ph ph-users-three"></i> 4 Dependentes Inclusos</span>
              </div>
              <p class="cp-offer-terms">
                * Apenas {{ promoFirst }} no 1º mês. A partir do 2º mês, renovação no valor padrão de {{ promoRegular }}/mês. Cancele quando quiser.
              </p>
            </div>

            <!-- Seletor normal caso não seja oferta especial -->
            <div v-else-if="!isTrialSignup" class="cp-plan-selector-container">
              <span class="cp-plan-label">Escolha seu plano</span>
              <div class="cp-plan-buttons">
                <button type="button" :class="['cp-plan-pill', { active: planType === 'Individual' }]" @click="planType = 'Individual'">
                  <span class="cp-pill-title">Plano Individual</span>
                  <span class="cp-pill-sub">Titular</span>
                  <strong v-if="prices['Individual']">{{ prices['Individual'] }}/mês</strong>
                </button>
                <button type="button" :class="['cp-plan-pill', { active: planType === 'Família' }]" @click="planType = 'Família'">
                  <span class="cp-pill-title">Plano Família</span>
                  <span class="cp-pill-sub">Titular + até 4 dependentes</span>
                  <strong v-if="prices['Família']">{{ prices['Família'] }}/mês</strong>
                </button>
              </div>
            </div>
            <div class="cp-section">Seus dados</div>
            <div class="form-group"><label>Nome completo</label><input v-model="form.name" type="text" class="form-control" /></div>
            <div class="cp-row">
              <div class="form-group"><label>E-mail</label><input v-model="form.email" type="email" class="form-control" /></div>
              <div class="form-group"><label>Telefone</label><input v-model="form.phone" type="text" class="form-control" placeholder="DDD + número" /></div>
            </div>
            <div class="cp-row">
              <div class="form-group"><label>CPF</label><input :value="form.cpf" @input="form.cpf = formatCpf($event.target.value)" type="text" inputmode="numeric" maxlength="14" class="form-control" placeholder="000.000.000-00" /></div>
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
            <div class="form-group">
              <label>Crie sua senha de acesso</label>
              <div style="position: relative; display: flex; align-items: center;">
                <input
                  v-model="form.password"
                  :type="showPassword ? 'text' : 'password'"
                  minlength="6"
                  class="form-control"
                  placeholder="Mínimo de 6 caracteres"
                  style="padding-right: 40px; width: 100%;"
                />
                <button
                  type="button"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                  style="position: absolute; right: 10px; background: none; border: none; cursor: pointer; color: #64748b; font-size: 18px; display: flex; align-items: center;"
                >
                  <i :class="showPassword ? 'ph ph-eye-slash' : 'ph ph-eye'"></i>
                </button>
              </div>
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
              <i class="ph ph-qr-code"></i>
              <div>
                <strong>30 dias grátis + Pix Automático (D+30)</strong>
                <span>Nenhum valor é cobrado hoje (R$ 0,00). Após confirmar, geraremos o QR Code para você autorizar a recorrência no banco, com 1ª cobrança agendada somente para daqui a 30 dias.</span>
              </div>
            </div>

            <p v-if="error" class="cp-error">{{ error }}</p>
            <button type="submit" class="btn btn-secondary btn-full cp-submit" :disabled="submitting || !!promoUnavailable">
              {{ submitting ? 'Processando…' : (isTrialSignup ? 'Gerar QR Code de 30 dias grátis (D+30)' : (isPromoOffer ? (paymentMethod === 'card' ? `Assinar por ${promoFirst} no cartão` : `Confirmar e pagar ${promoFirst} via Pix`) : (paymentMethod === 'card' ? 'Assinar com cartão' : 'Confirmar e gerar Pix Automático'))) }}
            </button>
            <button type="button" class="cp-login-link" @click="emit('goLogin')">Já tem conta? Entrar</button>
          </form>
        </div>

        <aside class="cp-card cp-summary">
          <h4>Resumo do Pedido</h4>
          <div class="cp-sum-row">
            <span>Plano</span>
            <strong>{{ isPromoOffer ? `${planType} (1º mês promocional)` : planType }}</strong>
          </div>
          <div class="cp-sum-row">
            <span>Periodicidade</span>
            <strong>{{ isPromoOffer ? `Mensal (1º mês ${promoFirst})` : 'Mensal' }}</strong>
          </div>
          <div class="cp-sum-row">
            <span>Dependentes</span>
            <strong>{{ planType === 'Família' ? 'Titular + até 4 dependentes' : 'Somente titular' }}</strong>
          </div>
          <div class="cp-sum-row">
            <span>Pagamento</span>
            <strong>{{ isTrialSignup ? 'Após 30 dias' : (paymentMethod === 'card' ? 'Cartão de Crédito' : 'Pix Automático') }}</strong>
          </div>
          <div v-if="isPromoOffer" class="cp-sum-row" style="color: var(--text-gray); font-size: 13px;">
            <span>A partir do 2º mês</span>
            <span>{{ promoRegular }}/mês</span>
          </div>
          <div class="cp-sum-row total">
            <span>{{ isTrialSignup ? 'Hoje' : 'Total Hoje' }}</span>
            <strong style="color: #0b3c82; font-size: 20px;">{{ isTrialSignup ? 'R$ 0,00' : (planPrice || '—') }}</strong>
          </div>
          <p class="cp-note">
            {{ isPromoOffer ? `A primeira mensalidade sai por apenas ${promoFirst}. A partir do segundo mês, o plano renova no valor regular de ${promoRegular}/mês. Cancele quando quiser.` : (isTrialSignup ? 'O primeiro pagamento será solicitado depois do período inicial. O link é único e só pode ser usado uma vez.' : 'Débito automático mensal via Pix. Você autoriza uma vez no banco. Cancele quando quiser.') }}
          </p>
          <div class="cp-guarantee">
            <i class="ph ph-shield-check"></i>
            <span>Pagamento 100% seguro com criptografia de ponta a ponta</span>
          </div>
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

.cp-plan-selector-container { margin: 16px 0 20px; }
.cp-plan-label { font-size: 13px; font-weight: 600; color: var(--secondary); margin-bottom: 8px; display: block; }
.cp-plan-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cp-plan-pill {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border: 2px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: #fff;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;
}
.cp-plan-pill.active {
  border-color: var(--secondary, #215cff);
  background: #f0f4ff;
  box-shadow: 0 0 0 1px var(--secondary, #215cff);
}
.cp-pill-title { font-size: 14px; font-weight: 700; color: #1e293b; }
.cp-pill-sub { font-size: 11px; color: var(--text-gray); }
.cp-plan-pill strong { font-size: 14px; color: var(--secondary, #215cff); margin-top: 4px; }

/* Destaques para Ofertas Especiais de Família */
.cp-promo-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 4px 10px;
  border-radius: var(--radius-full, 9999px);
  margin-bottom: 10px;
  border: 1px solid #bfdbfe;
}
.cp-title-promo {
  font-size: 24px;
  font-weight: 700;
  color: var(--secondary, #0b3c82);
  margin-bottom: 6px;
}
.cp-offer-card {
  background: #f8fafc;
  border: 2px solid #bfdbfe;
  border-radius: var(--radius-md, 8px);
  padding: 18px;
  margin: 16px 0 20px;
}
.cp-offer-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 14px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding-bottom: 12px;
}
.cp-offer-name {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.cp-offer-dep {
  display: block;
  font-size: 12px;
  color: var(--text-gray, #64748b);
  margin-top: 2px;
}
.cp-offer-price {
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.cp-strikethrough {
  font-size: 12px;
  color: #94a3b8;
  text-decoration: line-through;
}
.cp-offer-price strong {
  font-size: 22px;
  font-weight: 800;
  color: #0b3c82;
  font-variant-numeric: tabular-nums;
}
.cp-offer-price small {
  font-size: 12px;
  font-weight: 500;
  color: #64748b;
}
.cp-offer-perks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 10px;
}
@media (max-width: 520px) {
  .cp-offer-perks { grid-template-columns: 1fr; }
}
.cp-offer-perks span {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  color: #334155;
}
.cp-offer-perks span i {
  color: #16a34a;
  font-size: 15px;
  flex-shrink: 0;
}
.cp-offer-terms {
  font-size: 11px;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}
.cp-guarantee {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: #64748b;
}
.cp-guarantee i {
  font-size: 18px;
  color: #16a34a;
  flex-shrink: 0;
}
</style>
