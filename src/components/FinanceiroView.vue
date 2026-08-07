<script setup>
import { ref } from 'vue'

const invoices = ref([
  { id: '1098', date: '01/07/2026', value: 'R$ 29,90', status: 'pago', method: 'PIX' },
  { id: '1084', date: '01/06/2026', value: 'R$ 29,90', status: 'pago', method: 'Cartão de Crédito' },
  { id: '1070', date: '01/05/2026', value: 'R$ 29,90', status: 'pago', method: 'Cartão de Crédito' }
])

const activeTab = ref('all')
</script>

<template>
  <div class="financial-page">
    <div class="page-title" style="margin-bottom: 24px;">
      <h1>Área Financeira</h1>
      <p>Gerencie sua assinatura.</p>
      <p style="margin-top: 6px; opacity: 0.85;">Consulte faturas e histórico de pagamentos.</p>
    </div>

    <!-- Cards de Resumo -->
    <div class="financial-summary">
      <div class="card summary-card">
        <span class="card-label">Plano Ativo</span>
        <h2>Viva Mais</h2>
        <span class="badge badge-success">Assinatura Ativa</span>
      </div>

      <div class="card summary-card">
        <span class="card-label">Valor Mensal</span>
        <h2>R$ 29,90</h2>
        <p class="card-subtext">Cobrado todo dia 01</p>
      </div>

      <div class="card summary-card">
        <span class="card-label">Próximo Vencimento</span>
        <h2>01/08/2026</h2>
        <p class="card-subtext">Renovação automática</p>
      </div>
    </div>

    <!-- Tabela de Histórico / Faturas -->
    <div class="card invoices-card">
      <div class="invoices-header">
        <h2>Histórico de Faturas</h2>
        <div class="filters">
          <button 
            :class="['filter-btn', { active: activeTab === 'all' }]"
            @click="activeTab = 'all'"
          >Todas</button>
          <button 
            :class="['filter-btn', { active: activeTab === 'paid' }]"
            @click="activeTab = 'paid'"
          >Pagas</button>
          <button 
            :class="['filter-btn', { active: activeTab === 'pending' }]"
            @click="activeTab = 'pending'"
          >Pendentes (0)</button>
        </div>
      </div>

      <div class="table-responsive">
        <table class="invoices-table">
          <thead>
            <tr>
              <th>ID da Fatura</th>
              <th>Data de Emissão</th>
              <th>Forma de Pagamento</th>
              <th>Valor</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="inv in invoices" :key="inv.id">
              <td>#{{ inv.id }}</td>
              <td>{{ inv.date }}</td>
              <td>{{ inv.method }}</td>
              <td><strong>{{ inv.value }}</strong></td>
              <td>
                <span class="status-badge paid">
                  <i class="ph ph-check"></i> Pago
                </span>
              </td>
              <td>
                <button class="btn btn-outline btn-sm" @click="alert('Download do comprovante iniciado.')">
                  <i class="ph ph-download-simple"></i> Recibo
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.financial-page {
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

.financial-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.summary-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.card-label {
  font-size: 13px;
  color: var(--text-light-gray);
  font-weight: 500;
}

.summary-card h2 {
  font-size: 26px;
  color: var(--secondary);
}

.card-subtext {
  font-size: 12px;
  color: var(--text-gray);
}

/* Faturas */
.invoices-card {
  padding: 32px;
}

.invoices-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.invoices-header h2 {
  font-size: 20px;
  color: var(--secondary);
}

.filters {
  display: flex;
  gap: 8px;
  background: var(--bg-gray);
  padding: 4px;
  border-radius: var(--radius-sm);
}

.filter-btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: var(--text-gray);
  transition: var(--transition);
}

.filter-btn.active {
  background: white;
  color: var(--secondary);
  box-shadow: var(--shadow-sm);
}

.table-responsive {
  width: 100%;
  overflow-x: auto;
}

.invoices-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
}

.invoices-table th {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-dark);
  font-weight: 600;
  background: var(--bg-gray);
}

.invoices-table td {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-gray);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: var(--radius-full);
}

.status-badge.paid {
  background: var(--primary-light);
  color: var(--primary-hover);
}

.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: var(--radius-sm);
}
</style>
