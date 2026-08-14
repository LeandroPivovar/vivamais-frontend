<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../services/api'

const showSSODemo = ref(false)

// Pet não tem API/SSO — login é feito direto no portal do parceiro.
const PET_PORTAL_URL = 'https://pet.consultastelemedicina.com.br/login_n'

const handleSSO = () => {
  window.open(PET_PORTAL_URL, '_blank', 'noopener')
}

const faqs = ref([])

onMounted(async () => {
  const data = await api.get('/content/faqs-veterinario')
  faqs.value = data.map((faq) => ({ ...faq, open: false }))
})

const toggleFaq = (index) => {
  faqs.value[index].open = !faqs.value[index].open
}
</script>

<template>
  <div class="benefit-page">
    <div class="benefit-hero">
      <div class="hero-text">
        <span class="badge badge-warning">Cuidado Pet</span>
        <h1>Veterinário 24 Horas</h1>
        <p>A saúde e o bem-estar do seu animal de estimação em boas mãos a qualquer hora do dia ou da noite.</p>
      </div>
      <div class="hero-icon-container">
        <i class="ph ph-paw-print"></i>
      </div>
    </div>

    <div class="benefit-content">
      <div class="main-info">
        <h2>Como Utilizar o Benefício Pet?</h2>
        <p>O atendimento funciona tanto de forma remota para orientações rápidas quanto de forma presencial em clínicas credenciadas caso haja necessidade de atendimento emergencial.</p>
        
        <div class="steps-list">
          <div class="step-item">
            <span class="step-number">1</span>
            <div>
              <h3>Faça o Login Seguro</h3>
              <p>Clique no botão "Acessar Veterinário 24 Horas" nesta página para ser redirecionado de forma automática.</p>
            </div>
          </div>
          <div class="step-item">
            <span class="step-number">2</span>
            <div>
              <h3>Selecione o Canal de Atendimento</h3>
              <p>Escolha falar com um plantonista online para triagem ou busque a clínica presencial mais próxima.</p>
            </div>
          </div>
          <div class="step-item">
            <span class="step-number">3</span>
            <div>
              <h3>Apresente sua Carteirinha Digital</h3>
              <p>A carteirinha é gerada no próprio aplicativo do parceiro após a autenticação automática.</p>
            </div>
          </div>
        </div>

        <div class="faq-section">
          <h2>Perguntas Frequentes</h2>
          <div class="faq-list">
            <div 
              v-for="(faq, index) in faqs" 
              :key="index"
              class="faq-item"
              :class="{ active: faq.open }"
              @click="toggleFaq(index)"
            >
              <div class="faq-header">
                <h3>{{ faq.question }}</h3>
                <i class="ph" :class="faq.open ? 'ph-caret-up' : 'ph-caret-down'"></i>
              </div>
              <p v-show="faq.open" class="faq-answer">{{ faq.answer }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="sidebar-info">
        <div class="info-card">
          <h3>Central de Orientação</h3>
          <p class="support-subtitle">Fale com um veterinário por telefone:</p>
          <div class="phone-box">
            <i class="ph ph-phone"></i>
            <span class="phone-number">0800 777 9988</span>
          </div>
          <button @click="handleSSO" class="btn btn-secondary btn-full margin-top">
            <i class="ph ph-dog"></i>
            Acessar Veterinário 24h
          </button>
        </div>
      </div>
    </div>

    <!-- SSO Demo Overlay -->
    <div v-if="showSSODemo" class="sso-overlay">
      <div class="sso-modal">
        <div class="spinner"></div>
        <h3>Autenticando no Portal Pet...</h3>
        <p>Integrando credenciais de afiliação e conectando à central veterinária.</p>
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
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.main-info h2 {
  font-size: 22px;
  color: var(--secondary);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.step-item {
  display: flex;
  gap: 20px;
}

.step-number {
  width: 32px;
  height: 32px;
  background: var(--primary-light);
  color: var(--primary-hover);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex-shrink: 0;
}

.step-item h3 {
  font-size: 16px;
  margin-bottom: 4px;
  color: var(--text-dark);
}

.step-item p {
  font-size: 14px;
  color: var(--text-gray);
  margin-bottom: 0;
}

/* FAQ */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.faq-item {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 16px;
  cursor: pointer;
  transition: var(--transition);
}

.faq-item:hover {
  border-color: var(--primary);
}

.faq-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.faq-header h3 {
  font-size: 15px;
  color: var(--text-dark);
}

.faq-answer {
  font-size: 14px;
  color: var(--text-gray);
  margin-top: 12px;
  line-height: 1.5;
}

.sidebar-info .info-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 32px;
}

.support-subtitle {
  font-size: 13px;
  color: var(--text-gray);
  margin-bottom: 16px;
}

.phone-box {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-gray);
  padding: 14px;
  border-radius: var(--radius-sm);
  margin-bottom: 12px;
  color: var(--secondary);
  font-weight: 600;
}

.phone-box i {
  font-size: 20px;
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
