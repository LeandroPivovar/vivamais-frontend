<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../services/api'

const showSSODemo = ref(false)

const handleSSO = async () => {
  showSSODemo.value = true
  // registra o acesso (auditoria) sem bloquear o redirect
  api.post('/sso/clube-descontos').catch(() => {})
  try {
    const r = await api.get('/clube/access-url')
    showSSODemo.value = false
    if (r?.url) {
      window.open(r.url, '_blank', 'noopener')
      return
    }
    alert('Clube de Descontos indisponível no momento. Verifique se seu cadastro está ativo.')
  } catch {
    showSSODemo.value = false
    alert('Não foi possível abrir o Clube de Descontos agora. Tente novamente.')
  }
}

const categories = ref([])
const highlights = ref([])
const clubeEnabled = ref(false)
const searchTerm = ref('')
const searching = ref(false)

// A API do Clube Certo não tem shape 100% documentado aqui — mapeamos defensivamente
// tentando os nomes de campo mais comuns, e caímos em fallback quando ausente.
const asArray = (d) => (Array.isArray(d) ? d : (d?.data ?? d?.items ?? d?.results ?? []))

const mapCategories = (raw) => asArray(raw).map((c) => ({
  name: c.name ?? c.title ?? c.description ?? c.category ?? 'Categoria',
  icon: c.icon ?? 'ph-tag',
  count: c.count ?? c.total ?? c.establishmentsCount ?? '',
}))

const mapEstablishments = (raw) => asArray(raw).map((e) => ({
  brand: e.name ?? e.fantasyName ?? e.tradeName ?? e.title ?? 'Estabelecimento',
  discount: e.benefit ?? e.discount ?? e.description ?? (Array.isArray(e.benefits) && e.benefits[0]?.description) ?? 'Desconto exclusivo',
  logoBg: '#eef7eb',
  color: '#16a34a',
}))

const loadStatic = async () => {
  const data = await api.get('/content/discounts')
  categories.value = data.categories
  highlights.value = data.highlights
}

const loadReal = async () => {
  const [cats, ests] = await Promise.all([
    api.get('/clube/categories').catch(() => []),
    api.get('/clube/establishments').catch(() => []),
  ])
  categories.value = mapCategories(cats)
  const mapped = mapEstablishments(ests)
  // Se a integração está ligada mas não retornou nada (ex.: CPF não é associado),
  // mantém o conteúdo padrão pra tela não ficar vazia.
  if (mapped.length) highlights.value = mapped
  else await loadStatic()
}

const doSearch = async () => {
  if (!clubeEnabled.value) return
  searching.value = true
  try {
    const ests = await api.get(`/clube/establishments?search=${encodeURIComponent(searchTerm.value)}`).catch(() => [])
    const mapped = mapEstablishments(ests)
    highlights.value = mapped.length ? mapped : highlights.value
  } finally {
    searching.value = false
  }
}

onMounted(async () => {
  try {
    const status = await api.get('/clube/enabled')
    clubeEnabled.value = !!status?.enabled
  } catch {
    clubeEnabled.value = false
  }
  if (clubeEnabled.value) await loadReal()
  else await loadStatic()
})
</script>

<template>
  <div class="benefit-page">
    <div class="benefit-hero">
      <div class="hero-text">
        <span class="badge badge-warning">Descontos Reais</span>
        <h1>Clube de Descontos</h1>
        <p>Economize no dia a dia com vantagens exclusivas nas maiores redes de varejo, saúde e lazer do país.</p>
      </div>
      <div class="hero-icon-container">
        <i class="ph ph-gift"></i>
      </div>
    </div>

    <!-- Busca (apenas com integração Clube Certo ativa) -->
    <section v-if="clubeEnabled" class="search-section">
      <div class="search-bar">
        <i class="ph ph-magnifying-glass"></i>
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Buscar estabelecimento, marca ou serviço..."
          @keyup.enter="doSearch"
        />
        <button class="btn btn-primary" @click="doSearch" :disabled="searching">
          {{ searching ? 'Buscando...' : 'Buscar' }}
        </button>
      </div>
    </section>

    <!-- Categorias -->
    <section class="categories-section">
      <h2 class="sub-title">Categorias Populares</h2>
      <div class="categories-grid">
        <div v-for="cat in categories" :key="cat.name" class="category-card">
          <i class="ph" :class="cat.icon"></i>
          <h3>{{ cat.name }}</h3>
          <span>{{ cat.count }}</span>
        </div>
      </div>
    </section>

    <div class="benefit-content">
      <div class="main-info">
        <h2>Destaques da Semana</h2>
        <div class="highlights-list">
          <div v-for="hl in highlights" :key="hl.brand" class="highlight-item">
            <div class="brand-logo" :style="{ backgroundColor: hl.logoBg, color: hl.color }">
              <i class="ph ph-storefront"></i>
            </div>
            <div class="highlight-details">
              <h3>{{ hl.brand }}</h3>
              <p>{{ hl.discount }}</p>
            </div>
            <button @click="handleSSO" class="btn btn-outline">Resgatar Cupom</button>
          </div>
        </div>
      </div>

      <div class="sidebar-info">
        <div class="info-card">
          <h3>Como Economizar?</h3>
          <p class="sidebar-text">O Clube de Descontos é um benefício incluso no seu plano Viva Mais. Basta clicar no botão abaixo para gerar cupons ou visualizar o mapa de lojas credenciadas parceiras da sua região.</p>
          <button @click="handleSSO" class="btn btn-secondary btn-full margin-top">
            <i class="ph ph-shopping-cart-simple"></i>
            Entrar no Clube de Descontos
          </button>
        </div>
      </div>
    </div>

    <!-- SSO Demo Overlay -->
    <div v-if="showSSODemo" class="sso-overlay">
      <div class="sso-modal">
        <div class="spinner"></div>
        <h3>Carregando Clube de Descontos...</h3>
        <p>Gerando token de autenticação integrado com a nossa rede de parceiros.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.benefit-page {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.benefit-hero {
  background: var(--primary);
  color: white;
  border-radius: var(--radius-lg);
  padding: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hero-text {
  max-width: 600px;
}

.hero-text h1 {
  color: white;
  font-size: 32px;
  margin: 12px 0;
}

.hero-text p {
  font-size: 16px;
  opacity: 0.9;
}

.hero-icon-container {
  font-size: 96px;
  opacity: 0.15;
}

.sub-title {
  font-size: 20px;
  margin-bottom: 20px;
  color: var(--secondary);
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 8px 8px 8px 16px;
}

.search-bar i {
  font-size: 20px;
  color: var(--text-gray);
}

.search-bar input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 15px;
  background: transparent;
  color: var(--text-dark);
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.category-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 24px;
  text-align: center;
  transition: var(--transition);
}

.category-card:hover {
  transform: translateY(-2px);
  border-color: var(--primary);
  box-shadow: var(--shadow-md);
}

.category-card i {
  font-size: 32px;
  color: var(--primary-hover);
  margin-bottom: 12px;
}

.category-card h3 {
  font-size: 16px;
  color: var(--text-dark);
  margin-bottom: 4px;
}

.category-card span {
  font-size: 12px;
  color: var(--text-gray);
}

.benefit-content {
  display: grid;
  grid-template-columns: 1.8fr 1.2fr;
  gap: 32px;
}

@media (max-width: 992px) {
  .benefit-content {
    grid-template-columns: 1fr;
  }
}

.main-info {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 32px;
}

.main-info h2 {
  font-size: 20px;
  margin-bottom: 24px;
  color: var(--secondary);
}

.highlights-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.highlight-item {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  flex-wrap: wrap;
}

.brand-logo {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.highlight-details {
  flex-grow: 1;
}

.highlight-details h3 {
  font-size: 15px;
  color: var(--text-dark);
  margin-bottom: 2px;
}

.highlight-details p {
  font-size: 13px;
  color: var(--text-gray);
  margin-bottom: 0;
}

.sidebar-info .info-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 32px;
}

.sidebar-info h3 {
  font-size: 18px;
  margin-bottom: 12px;
  color: var(--secondary);
}

.sidebar-text {
  font-size: 14px;
  color: var(--text-gray);
  line-height: 1.6;
}

.margin-top {
  margin-top: 20px;
}

/* SSO Demo Modal */
.sso-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.sso-modal {
  background: white;
  padding: 40px;
  border-radius: var(--radius-lg);
  text-align: center;
  max-width: 400px;
  width: 90%;
  box-shadow: var(--shadow-lg);
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid var(--border-color);
  border-top-color: var(--secondary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 24px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.sso-modal h3 {
  font-size: 18px;
  margin-bottom: 8px;
  color: var(--secondary);
}

.sso-modal p {
  font-size: 14px;
  color: var(--text-gray);
}
</style>
