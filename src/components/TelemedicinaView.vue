<script setup>
import { ref } from 'vue'
import { api } from '../services/api'

const showSSODemo = ref(false)

const handleSSO = async () => {
  showSSODemo.value = true
  try {
    await api.post('/sso/telehealth') // registra o acesso no feed de atividades
  } catch {
    // acesso ao benefício segue mesmo se o registro de auditoria falhar
  }
  try {
    // SSO real da Vencca: pega uuid do beneficiário e abre o portal em nova aba
    const { redirectUrl } = await api.get('/telemedicina/sso')
    showSSODemo.value = false
    window.open(redirectUrl, '_blank', 'noopener')
    return
  } catch (err) {
    // integração Vencca ainda não ativa (ou cadastro em processamento) — mantém a simulação
    setTimeout(() => {
      showSSODemo.value = false
      const msg = err?.status === 503
        ? 'Seu acesso à Telemedicina ainda está sendo processado. Tente novamente em alguns minutos.'
        : 'Simulação de Single Sign-On (SSO). A integração com o parceiro de Telemedicina será ativada em breve.'
      alert(msg)
    }, 2000)
  }
}
</script>

<template>
  <div class="benefit-page">
    <div class="benefit-hero">
      <div class="hero-text">
        <span class="badge badge-warning">Saúde 24 Horas</span>
        <h1>Telemedicina Viva Mais</h1>
        <p>Consultas médicas com clínicos gerais e especialistas de forma 100% digital, rápida e sem complicação.</p>
      </div>
      <div class="hero-icon-container">
        <i class="ph ph-first-aid-kit"></i>
      </div>
    </div>

    <div class="benefit-content">
      <div class="main-info">
        <h2>Como Funciona a Telemedicina?</h2>
        <p>Você tem acesso ilimitado a consultas com clínico geral e pediatria 24 horas por dia, 7 dias por semana. Além disso, pode agendar especialidades médicas diretamente pela plataforma parceira.</p>
        
        <div class="features-list">
          <div class="feature-item">
            <i class="ph ph-clock"></i>
            <div>
              <h3>Atendimento Imediato</h3>
              <p>Clínico geral e pediatra de plantão sem necessidade de agendamento prévio.</p>
            </div>
          </div>
          <div class="feature-item">
            <i class="ph ph-prescription"></i>
            <div>
              <h3>Receitas e Atestados Digitais</h3>
              <p>Envio de receitas de medicamentos, atestados e pedidos de exames direto no seu celular por SMS ou WhatsApp.</p>
            </div>
          </div>
          <div class="feature-item">
            <i class="ph ph-users-three"></i>
            <div>
              <h3>Mais de 20 Especialidades</h3>
              <p>Agende consultas com cardiologistas, dermatologistas, ginecologistas, psicólogos e mais.</p>
            </div>
          </div>
        </div>
      </div>

      <div class="sidebar-info">
        <div class="info-card">
          <h3>Informações de Atendimento</h3>
          <ul>
            <li><strong>Disponibilidade:</strong> 24h por dia, todos os dias</li>
            <li><strong>Formato:</strong> Chamada de vídeo ou áudio</li>
            <li><strong>Custo por consulta:</strong> Gratuito (incluso na assinatura)</li>
          </ul>
          <button @click="handleSSO" class="btn btn-secondary btn-full">
            <i class="ph ph-arrow-square-out"></i>
            Acessar Telemedicina
          </button>
        </div>
      </div>
    </div>

    <!-- SSO Demo Overlay -->
    <div v-if="showSSODemo" class="sso-overlay">
      <div class="sso-modal">
        <div class="spinner"></div>
        <h3>Autenticando na Telemedicina...</h3>
        <p>Realizando login seguro (SSO) com suas credenciais Viva Mais.</p>
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
  background: linear-gradient(135deg, var(--secondary) 0%, #0d3444 100%);
  color: white;
  border-radius: var(--radius-lg);
  padding: 40px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
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
  margin-right: 20px;
}

@media (max-width: 768px) {
  .benefit-hero {
    flex-direction: column;
    text-align: center;
  }
  .hero-icon-container {
    display: none;
  }
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
  font-size: 22px;
  margin-bottom: 16px;
  color: var(--secondary);
}

.main-info p {
  font-size: 15px;
  line-height: 1.6;
  margin-bottom: 24px;
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-item {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.feature-item i {
  font-size: 24px;
  color: var(--primary-hover);
  background: var(--primary-light);
  padding: 10px;
  border-radius: var(--radius-sm);
}

.feature-item h3 {
  font-size: 16px;
  margin-bottom: 4px;
  color: var(--text-dark);
}

.feature-item p {
  font-size: 14px;
  color: var(--text-gray);
  margin-bottom: 0;
}

.sidebar-info .info-card {
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 32px;
  position: sticky;
  top: 100px;
}

.sidebar-info h3 {
  font-size: 18px;
  margin-bottom: 20px;
  color: var(--secondary);
}

.sidebar-info ul {
  list-style: none;
  padding: 0;
  margin-bottom: 24px;
}

.sidebar-info li {
  font-size: 14px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-info li:last-child {
  border-bottom: none;
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
