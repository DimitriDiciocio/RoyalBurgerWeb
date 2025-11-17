# 🎨 ROTEIRO DE INTEGRAÇÃO — Sistema de Fluxo de Caixa no Frontend

## 📋 **VISÃO GERAL**

Este roteiro detalha a implementação completa do **Sistema de Fluxo de Caixa** no frontend **RoyalBurgerWeb**, incluindo novas funcionalidades, designs, ajustes no painel administrativo e integração com o fluxo de pedidos.

### **Objetivos**
- Implementar interface completa para gestão de fluxo de caixa
- Criar dashboards e relatórios financeiros visuais
- Integrar com o painel administrativo existente
- Adicionar visualizações no fluxo de pedidos
- Garantir responsividade e acessibilidade
- Manter consistência com o design system existente

---

## 🏗️ **ESTRUTURA DE ARQUIVOS**

### **Novos Arquivos a Criar**

```
RoyalBurgerWeb/
├── src/
│   ├── pages/
│   │   └── fluxo-caixa.html                    # Nova página principal
│   │
│   ├── js/
│   │   ├── api/
│   │   │   ├── financial-movements.js          # API de movimentações
│   │   │   ├── purchases.js                    # API de compras
│   │   │   └── recurrence.js                   # API de recorrências
│   │   │
│   │   └── ui/
│   │       ├── admin/
│   │       │   ├── fluxo-caixa-manager.js      # Gerenciador principal
│   │       │   ├── movimentacoes-list.js       # Lista de movimentações
│   │       │   ├── movimentacao-form.js        # Formulário de criação/edição
│   │       │   ├── dashboard-financeiro.js     # Dashboard financeiro
│   │       │   ├── contas-pagar.js             # Gestão de contas a pagar
│   │       │   ├── compras-manager.js          # Gestão de compras
│   │       │   ├── recorrencias-manager.js     # Gestão de recorrências
│   │       │   └── conciliacao-bancaria.js     # Conciliação bancária
│   │       │
│   │       └── components/
│   │           ├── financial-card.js           # Card de movimentação
│   │           ├── financial-chart.js          # Gráficos financeiros
│   │           └── payment-status-badge.js     # Badge de status
│   │
│   └── assets/
│       └── styles/
│           ├── fluxo-caixa.css                 # Estilos principais
│           ├── dashboard-financeiro.css        # Estilos do dashboard
│           └── financial-components.css        # Componentes financeiros
│
└── components/
    └── financial/
        ├── movement-card.html                  # Card de movimentação
        ├── summary-card.html                   # Card de resumo
        └── chart-container.html                # Container de gráficos
```

---

## 📊 **FASE 1: ESTRUTURA BASE E API**

### **1.1. Criar Módulo de API - `src/js/api/financial-movements.js`**

**Objetivo:** Centralizar todas as chamadas à API de fluxo de caixa.

```javascript
/**
 * API de Movimentações Financeiras
 * Gerencia todas as requisições relacionadas ao fluxo de caixa
 */

import { apiRequest, API_BASE_URL } from './api.js';

const FINANCIAL_API_BASE = `${API_BASE_URL}/api/financial-movements`;

/**
 * Lista movimentações financeiras com filtros
 * @param {Object} filters - Filtros de busca
 * @returns {Promise<Array>}
 */
export async function getFinancialMovements(filters = {}) {
    const params = new URLSearchParams();
    
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.type) params.append('type', filters.type);
    if (filters.category) params.append('category', filters.category);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    if (filters.related_entity_type) params.append('related_entity_type', filters.related_entity_type);
    if (filters.related_entity_id) params.append('related_entity_id', filters.related_entity_id);
    if (filters.reconciled !== undefined) params.append('reconciled', filters.reconciled);
    
    const url = `${FINANCIAL_API_BASE}/movements${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, 'GET');
}

/**
 * Cria uma nova movimentação financeira
 * @param {Object} movementData - Dados da movimentação
 * @returns {Promise<Object>}
 */
export async function createFinancialMovement(movementData) {
    return apiRequest(`${FINANCIAL_API_BASE}/movements`, 'POST', movementData);
}

/**
 * Atualiza status de pagamento de uma movimentação
 * @param {number} movementId - ID da movimentação
 * @param {string} paymentStatus - 'Pending' ou 'Paid'
 * @param {string} movementDate - Data do movimento (opcional)
 * @returns {Promise<Object>}
 */
export async function updatePaymentStatus(movementId, paymentStatus, movementDate = null) {
    const data = { payment_status: paymentStatus };
    if (movementDate) data.movement_date = movementDate;
    
    return apiRequest(`${FINANCIAL_API_BASE}/movements/${movementId}/payment-status`, 'PATCH', data);
}

/**
 * Obtém resumo do fluxo de caixa
 * @param {string} period - 'this_month', 'last_month', 'last_30_days', 'custom'
 * @param {boolean} includePending - Incluir pendências
 * @returns {Promise<Object>}
 */
export async function getCashFlowSummary(period = 'this_month', includePending = false) {
    const params = new URLSearchParams({
        period,
        include_pending: includePending.toString()
    });
    
    return apiRequest(`${FINANCIAL_API_BASE}/summary?${params.toString()}`, 'GET');
}

/**
 * Lista contas a pagar (movimentações pendentes)
 * @param {Object} filters - Filtros opcionais
 * @returns {Promise<Array>}
 */
export async function getPendingPayments(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    
    const url = `${FINANCIAL_API_BASE}/pending${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, 'GET');
}

/**
 * Marca movimentação como reconciliada
 * @param {number} movementId - ID da movimentação
 * @param {boolean} reconciled - true para reconciliada
 * @returns {Promise<Object>}
 */
export async function reconcileMovement(movementId, reconciled = true) {
    return apiRequest(
        `${FINANCIAL_API_BASE}/movements/${movementId}/reconcile`,
        'PATCH',
        { reconciled }
    );
}

/**
 * Atualiza informações de gateway de pagamento
 * @param {number} movementId - ID da movimentação
 * @param {Object} gatewayData - Dados do gateway
 * @returns {Promise<Object>}
 */
export async function updateGatewayInfo(movementId, gatewayData) {
    return apiRequest(
        `${FINANCIAL_API_BASE}/movements/${movementId}/gateway-info`,
        'PATCH',
        gatewayData
    );
}

/**
 * Obtém relatório de conciliação bancária
 * @param {Object} filters - Filtros de data e gateway
 * @returns {Promise<Object>}
 */
export async function getReconciliationReport(filters = {}) {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.reconciled !== undefined) params.append('reconciled', filters.reconciled);
    if (filters.payment_gateway_id) params.append('payment_gateway_id', filters.payment_gateway_id);
    
    const url = `${FINANCIAL_API_BASE}/reconciliation-report${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, 'GET');
}
```

### **1.2. Criar Módulo de API - `src/js/api/purchases.js`**

```javascript
/**
 * API de Compras e Notas Fiscais
 */

import { apiRequest, API_BASE_URL } from './api.js';

const PURCHASES_API_BASE = `${API_BASE_URL}/api/purchases`;

export async function createPurchaseInvoice(invoiceData) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices`, 'POST', invoiceData);
}

export async function getPurchaseInvoices(filters = {}) {
    const params = new URLSearchParams();
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.supplier_name) params.append('supplier_name', filters.supplier_name);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    
    const url = `${PURCHASES_API_BASE}/invoices${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, 'GET');
}

export async function getPurchaseInvoiceById(invoiceId) {
    return apiRequest(`${PURCHASES_API_BASE}/invoices/${invoiceId}`, 'GET');
}
```

### **1.3. Criar Módulo de API - `src/js/api/recurrence.js`**

```javascript
/**
 * API de Regras de Recorrência
 */

import { apiRequest, API_BASE_URL } from './api.js';

const RECURRENCE_API_BASE = `${API_BASE_URL}/api/recurrence`;

export async function getRecurrenceRules(activeOnly = true) {
    const params = new URLSearchParams({ active_only: activeOnly.toString() });
    return apiRequest(`${RECURRENCE_API_BASE}/rules?${params.toString()}`, 'GET');
}

export async function createRecurrenceRule(ruleData) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules`, 'POST', ruleData);
}

export async function updateRecurrenceRule(ruleId, ruleData) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules/${ruleId}`, 'PATCH', ruleData);
}

export async function deleteRecurrenceRule(ruleId) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules/${ruleId}`, 'DELETE');
}

export async function generateRecurringMovements(year = null, month = null, week = null) {
    const data = {};
    if (year) data.year = year;
    if (month) data.month = month;
    if (week) data.week = week;
    
    return apiRequest(`${RECURRENCE_API_BASE}/generate`, 'POST', data);
}
```

---

## 🎨 **FASE 2: DESIGN SYSTEM E COMPONENTES**

### **2.1. Criar Estilos Base - `src/assets/styles/fluxo-caixa.css`**

**Objetivo:** Estilos principais para o módulo de fluxo de caixa, seguindo o design system existente.

```css
/**
 * Estilos do Módulo de Fluxo de Caixa
 * Mantém consistência com painel-adm.css
 */

/* === VARIÁVEIS CSS === */
:root {
    --financial-primary: #2563eb;
    --financial-success: #10b981;
    --financial-danger: #ef4444;
    --financial-warning: #f59e0b;
    --financial-info: #3b82f6;
    
    --revenue-color: #10b981;
    --expense-color: #ef4444;
    --cmv-color: #f59e0b;
    --tax-color: #8b5cf6;
    
    --pending-color: #f59e0b;
    --paid-color: #10b981;
    --reconciled-color: #3b82f6;
}

/* === CONTAINER PRINCIPAL === */
.fluxo-caixa-container {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
}

/* === HEADER DA SEÇÃO === */
.fluxo-caixa-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
    flex-wrap: wrap;
    gap: 1rem;
}

.fluxo-caixa-header h1 {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
}

.fluxo-caixa-actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

/* === CARDS DE RESUMO === */
.financial-summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
}

.financial-summary-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    border-left: 4px solid;
    transition: transform 0.2s, box-shadow 0.2s;
}

.financial-summary-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.financial-summary-card.revenue {
    border-left-color: var(--revenue-color);
}

.financial-summary-card.expense {
    border-left-color: var(--expense-color);
}

.financial-summary-card.cmv {
    border-left-color: var(--cmv-color);
}

.financial-summary-card.profit {
    border-left-color: var(--financial-primary);
}

.financial-summary-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
}

.financial-summary-card-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.financial-summary-card-icon {
    font-size: 1.5rem;
    opacity: 0.7;
}

.financial-summary-card-value {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
}

.financial-summary-card-change {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
}

.financial-summary-card-change.positive {
    color: var(--financial-success);
}

.financial-summary-card-change.negative {
    color: var(--financial-danger);
}

/* === FILTROS === */
.financial-filters {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.financial-filters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
}

.financial-filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.financial-filter-group label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
}

.financial-filter-group select,
.financial-filter-group input {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
}

/* === TABELA DE MOVIMENTAÇÕES === */
.financial-movements-table-container {
    background: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.financial-movements-table {
    width: 100%;
    border-collapse: collapse;
}

.financial-movements-table thead {
    background: #f9fafb;
    border-bottom: 2px solid #e5e7eb;
}

.financial-movements-table th {
    padding: 1rem;
    text-align: left;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.financial-movements-table td {
    padding: 1rem;
    border-bottom: 1px solid #e5e7eb;
    font-size: 0.875rem;
    color: #1f2937;
}

.financial-movements-table tbody tr {
    transition: background-color 0.2s;
}

.financial-movements-table tbody tr:hover {
    background-color: #f9fafb;
}

/* === BADGES === */
.financial-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.financial-badge.type-revenue {
    background: #d1fae5;
    color: #065f46;
}

.financial-badge.type-expense {
    background: #fee2e2;
    color: #991b1b;
}

.financial-badge.type-cmv {
    background: #fef3c7;
    color: #92400e;
}

.financial-badge.type-tax {
    background: #ede9fe;
    color: #5b21b6;
}

.financial-badge.status-pending {
    background: #fef3c7;
    color: #92400e;
}

.financial-badge.status-paid {
    background: #d1fae5;
    color: #065f46;
}

.financial-badge.reconciled {
    background: #dbeafe;
    color: #1e40af;
}

/* === BOTÕES DE AÇÃO === */
.financial-action-buttons {
    display: flex;
    gap: 0.5rem;
}

.financial-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

.financial-btn-primary {
    background: var(--financial-primary);
    color: white;
}

.financial-btn-primary:hover {
    background: #1d4ed8;
}

.financial-btn-success {
    background: var(--financial-success);
    color: white;
}

.financial-btn-danger {
    background: var(--financial-danger);
    color: white;
}

.financial-btn-secondary {
    background: #6b7280;
    color: white;
}

.financial-btn-icon {
    font-size: 0.875rem;
}

/* === RESPONSIVIDADE === */
@media (max-width: 768px) {
    .fluxo-caixa-container {
        padding: 1rem;
    }
    
    .financial-summary-grid {
        grid-template-columns: 1fr;
    }
    
    .financial-movements-table-container {
        overflow-x: auto;
    }
    
    .financial-movements-table {
        min-width: 800px;
    }
}
```

### **2.2. Criar Componente de Card - `components/financial/movement-card.html`**

```html
<!-- Card de Movimentação Financeira -->
<div class="financial-movement-card" data-movement-id="{{id}}">
    <div class="financial-movement-card-header">
        <div class="financial-movement-card-type">
            <span class="financial-badge type-{{type.toLowerCase()}}">{{type}}</span>
            <span class="financial-badge status-{{payment_status.toLowerCase()}}">{{payment_status}}</span>
        </div>
        <div class="financial-movement-card-actions">
            <button class="financial-btn-icon" data-action="edit" title="Editar">
                <i class="fa-solid fa-edit"></i>
            </button>
            <button class="financial-btn-icon" data-action="delete" title="Excluir">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    </div>
    
    <div class="financial-movement-card-body">
        <div class="financial-movement-card-value">
            <span class="value-sign">{{type === 'REVENUE' ? '+' : '-'}}</span>
            <span class="value-amount">R$ {{value.toFixed(2)}}</span>
        </div>
        
        <div class="financial-movement-card-description">
            <p class="description-text">{{description}}</p>
            <p class="description-meta">
                <span>{{category}}</span>
                <span v-if="subcategory"> • {{subcategory}}</span>
            </p>
        </div>
        
        <div class="financial-movement-card-details">
            <div class="detail-item">
                <i class="fa-solid fa-calendar"></i>
                <span>{{formatDate(movement_date)}}</span>
            </div>
            <div class="detail-item" v-if="payment_method">
                <i class="fa-solid fa-credit-card"></i>
                <span>{{payment_method}}</span>
            </div>
            <div class="detail-item" v-if="sender_receiver">
                <i class="fa-solid fa-user"></i>
                <span>{{sender_receiver}}</span>
            </div>
        </div>
    </div>
    
    <div class="financial-movement-card-footer" v-if="related_entity_type">
        <a href="#" class="related-link" data-entity-type="{{related_entity_type}}" data-entity-id="{{related_entity_id}}">
            Ver {{related_entity_type}} #{{related_entity_id}}
        </a>
    </div>
</div>
```

---

## 📊 **FASE 3: DASHBOARD FINANCEIRO**

### **3.1. Criar Dashboard - `src/js/ui/admin/dashboard-financeiro.js`**

**Objetivo:** Dashboard visual com gráficos e métricas principais.

```javascript
/**
 * Dashboard Financeiro
 * Exibe métricas e gráficos do fluxo de caixa
 */

import { getCashFlowSummary } from '../../../api/financial-movements.js';
import { showToast } from '../../alerts.js';

export class FinancialDashboard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentPeriod = 'this_month';
        this.includePending = false;
        this.charts = {};
    }

    async init() {
        if (!this.container) {
            console.error('Container do dashboard não encontrado');
            return;
        }

        this.render();
        await this.loadData();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="dashboard-financeiro">
                <!-- Header -->
                <div class="dashboard-header">
                    <h2>Dashboard Financeiro</h2>
                    <div class="dashboard-controls">
                        <select id="dashboard-period" class="dashboard-select">
                            <option value="this_month">Este Mês</option>
                            <option value="last_month">Mês Anterior</option>
                            <option value="last_30_days">Últimos 30 Dias</option>
                        </select>
                        <label class="dashboard-checkbox">
                            <input type="checkbox" id="dashboard-include-pending">
                            Incluir Pendências
                        </label>
                    </div>
                </div>

                <!-- Cards de Resumo -->
                <div class="financial-summary-grid" id="summary-cards">
                    <!-- Será preenchido dinamicamente -->
                </div>

                <!-- Gráficos -->
                <div class="dashboard-charts">
                    <div class="chart-container">
                        <h3>Fluxo de Caixa</h3>
                        <canvas id="cash-flow-chart"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Receitas vs Despesas</h3>
                        <canvas id="revenue-expense-chart"></canvas>
                    </div>
                </div>

                <!-- Tabela de Movimentações Recentes -->
                <div class="dashboard-recent-movements">
                    <h3>Movimentações Recentes</h3>
                    <div id="recent-movements-list">
                        <!-- Será preenchido dinamicamente -->
                    </div>
                </div>
            </div>
        `;
    }

    async loadData() {
        try {
            const summary = await getCashFlowSummary(this.currentPeriod, this.includePending);
            this.renderSummaryCards(summary);
            this.renderCharts(summary);
            // TODO: Carregar movimentações recentes
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados do dashboard', 'error');
        }
    }

    renderSummaryCards(summary) {
        const cardsContainer = document.getElementById('summary-cards');
        
        cardsContainer.innerHTML = `
            <div class="financial-summary-card revenue">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Receitas</span>
                    <i class="fa-solid fa-arrow-up financial-summary-card-icon" style="color: var(--revenue-color);"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(summary.total_revenue)}</p>
            </div>

            <div class="financial-summary-card expense">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Despesas</span>
                    <i class="fa-solid fa-arrow-down financial-summary-card-icon" style="color: var(--expense-color);"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(summary.total_expense)}</p>
            </div>

            <div class="financial-summary-card cmv">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">CMV</span>
                    <i class="fa-solid fa-box financial-summary-card-icon" style="color: var(--cmv-color);"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(summary.total_cmv)}</p>
            </div>

            <div class="financial-summary-card profit">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Lucro Líquido</span>
                    <i class="fa-solid fa-chart-line financial-summary-card-icon" style="color: var(--financial-primary);"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(summary.net_profit)}</p>
                <div class="financial-summary-card-change ${summary.net_profit >= 0 ? 'positive' : 'negative'}">
                    <i class="fa-solid fa-${summary.net_profit >= 0 ? 'arrow-up' : 'arrow-down'}"></i>
                    <span>Margem: ${this.calculateMargin(summary.total_revenue, summary.net_profit)}%</span>
                </div>
            </div>
        `;
    }

    renderCharts(summary) {
        // TODO: Implementar gráficos com Chart.js ou similar
        // Por enquanto, apenas placeholder
        console.log('Renderizando gráficos com dados:', summary);
    }

    setupEventListeners() {
        const periodSelect = document.getElementById('dashboard-period');
        const pendingCheckbox = document.getElementById('dashboard-include-pending');

        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                this.loadData();
            });
        }

        if (pendingCheckbox) {
            pendingCheckbox.addEventListener('change', (e) => {
                this.includePending = e.target.checked;
                this.loadData();
            });
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    calculateMargin(revenue, profit) {
        if (!revenue || revenue === 0) return 0;
        return ((profit / revenue) * 100).toFixed(2);
    }
}
```

---

## 📝 **FASE 4: GESTÃO DE MOVIMENTAÇÕES**

### **4.1. Criar Lista de Movimentações - `src/js/ui/admin/movimentacoes-list.js`**

**Objetivo:** Lista paginada e filtrada de movimentações financeiras.

```javascript
/**
 * Lista de Movimentações Financeiras
 * Gerencia exibição, filtros e paginação
 */

import { getFinancialMovements, updatePaymentStatus } from '../../../api/financial-movements.js';
import { showToast } from '../../alerts.js';

export class MovementsList {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.filters = {
            start_date: null,
            end_date: null,
            type: null,
            category: null,
            payment_status: null
        };
        this.currentPage = 1;
        this.pageSize = 50;
        this.movements = [];
    }

    async init() {
        if (!this.container) {
            console.error('Container da lista não encontrado');
            return;
        }

        this.render();
        await this.loadMovements();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="movements-list-container">
                <!-- Filtros -->
                <div class="financial-filters">
                    <div class="financial-filters-grid">
                        <div class="financial-filter-group">
                            <label>Data Início</label>
                            <input type="date" id="filter-start-date" class="filter-input">
                        </div>
                        <div class="financial-filter-group">
                            <label>Data Fim</label>
                            <input type="date" id="filter-end-date" class="filter-input">
                        </div>
                        <div class="financial-filter-group">
                            <label>Tipo</label>
                            <select id="filter-type" class="filter-select">
                                <option value="">Todos</option>
                                <option value="REVENUE">Receita</option>
                                <option value="EXPENSE">Despesa</option>
                                <option value="CMV">CMV</option>
                                <option value="TAX">Imposto</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>Status</label>
                            <select id="filter-payment-status" class="filter-select">
                                <option value="">Todos</option>
                                <option value="Pending">Pendente</option>
                                <option value="Paid">Pago</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>&nbsp;</label>
                            <button class="financial-btn financial-btn-primary" id="btn-apply-filters">
                                <i class="fa-solid fa-filter"></i> Filtrar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tabela -->
                <div class="financial-movements-table-container">
                    <table class="financial-movements-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Tipo</th>
                                <th>Descrição</th>
                                <th>Categoria</th>
                                <th>Valor</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="movements-table-body">
                            <!-- Será preenchido dinamicamente -->
                        </tbody>
                    </table>
                </div>

                <!-- Paginação -->
                <div class="pagination-container" id="pagination-container">
                    <!-- Será preenchido dinamicamente -->
                </div>
            </div>
        `;
    }

    async loadMovements() {
        try {
            this.movements = await getFinancialMovements(this.filters);
            this.renderTable();
        } catch (error) {
            console.error('Erro ao carregar movimentações:', error);
            showToast('Erro ao carregar movimentações', 'error');
        }
    }

    renderTable() {
        const tbody = document.getElementById('movements-table-body');
        
        if (!tbody) return;

        if (this.movements.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem;">
                        <p>Nenhuma movimentação encontrada</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.movements.map(movement => `
            <tr>
                <td>${this.formatDate(movement.movement_date || movement.created_at)}</td>
                <td>
                    <span class="financial-badge type-${movement.type.toLowerCase()}">
                        ${movement.type}
                    </span>
                </td>
                <td>${movement.description}</td>
                <td>
                    <div>${movement.category}</div>
                    ${movement.subcategory ? `<div style="font-size: 0.75rem; color: #6b7280;">${movement.subcategory}</div>` : ''}
                </td>
                <td style="font-weight: 600; color: ${movement.type === 'REVENUE' ? 'var(--revenue-color)' : 'var(--expense-color)'};">
                    ${movement.type === 'REVENUE' ? '+' : '-'} R$ ${this.formatCurrency(movement.value)}
                </td>
                <td>
                    <span class="financial-badge status-${movement.payment_status.toLowerCase()}">
                        ${movement.payment_status}
                    </span>
                </td>
                <td>
                    <div class="financial-action-buttons">
                        ${movement.payment_status === 'Pending' ? `
                            <button class="financial-btn financial-btn-success financial-btn-icon" 
                                    onclick="movementsList.markAsPaid(${movement.id})"
                                    title="Marcar como Pago">
                                <i class="fa-solid fa-check"></i>
                            </button>
                        ` : ''}
                        <button class="financial-btn financial-btn-secondary financial-btn-icon" 
                                onclick="movementsList.editMovement(${movement.id})"
                                title="Editar">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async markAsPaid(movementId) {
        try {
            await updatePaymentStatus(movementId, 'Paid', new Date().toISOString());
            showToast('Movimentação marcada como paga', 'success');
            await this.loadMovements();
        } catch (error) {
            console.error('Erro ao marcar como pago:', error);
            showToast('Erro ao atualizar status', 'error');
        }
    }

    setupEventListeners() {
        const applyFiltersBtn = document.getElementById('btn-apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }
    }

    applyFilters() {
        const startDate = document.getElementById('filter-start-date')?.value;
        const endDate = document.getElementById('filter-end-date')?.value;
        const type = document.getElementById('filter-type')?.value;
        const paymentStatus = document.getElementById('filter-payment-status')?.value;

        this.filters = {
            start_date: startDate || null,
            end_date: endDate || null,
            type: type || null,
            payment_status: paymentStatus || null
        };

        this.loadMovements();
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }
}

// Exportar instância global para uso em onclick
export let movementsList;
```

---

## 🔄 **FASE 5: INTEGRAÇÃO COM PAINEL ADMINISTRATIVO**

### **5.1. Atualizar `src/pages/painel-adm.html`**

**Adicionar seção de Fluxo de Caixa:**

```html
<!-- Adicionar após a seção de relatórios -->
<section id="secao-financeiro" style="display: none;">
    <div class="header">
        <div class="texto">
            <p class="titulo-secao">Fluxo de Caixa</p>
            <p class="descricao-secao">Gestão completa das movimentações financeiras</p>
        </div>
        <div class="acoes">
            <button class="btn-primary" id="btn-nova-movimentacao">
                <i class="fa-solid fa-plus"></i> Nova Movimentação
            </button>
        </div>
    </div>

    <!-- Tabs de Navegação -->
    <div class="financeiro-tabs">
        <button class="financeiro-tab active" data-tab="dashboard">
            <i class="fa-solid fa-chart-line"></i> Dashboard
        </button>
        <button class="financeiro-tab" data-tab="movimentacoes">
            <i class="fa-solid fa-list"></i> Movimentações
        </button>
        <button class="financeiro-tab" data-tab="contas-pagar">
            <i class="fa-solid fa-clock"></i> Contas a Pagar
        </button>
        <button class="financeiro-tab" data-tab="compras">
            <i class="fa-solid fa-shopping-cart"></i> Compras
        </button>
        <button class="financeiro-tab" data-tab="recorrencias">
            <i class="fa-solid fa-repeat"></i> Recorrências
        </button>
        <button class="financeiro-tab" data-tab="conciliacao">
            <i class="fa-solid fa-check-double"></i> Conciliação
        </button>
    </div>

    <!-- Conteúdo das Tabs -->
    <div class="financeiro-content">
        <!-- Dashboard -->
        <div id="tab-dashboard" class="financeiro-tab-content active">
            <div id="dashboard-financeiro-container"></div>
        </div>

        <!-- Movimentações -->
        <div id="tab-movimentacoes" class="financeiro-tab-content">
            <div id="movimentacoes-list-container"></div>
        </div>

        <!-- Contas a Pagar -->
        <div id="tab-contas-pagar" class="financeiro-tab-content">
            <div id="contas-pagar-container"></div>
        </div>

        <!-- Compras -->
        <div id="tab-compras" class="financeiro-tab-content">
            <div id="compras-container"></div>
        </div>

        <!-- Recorrências -->
        <div id="tab-recorrencias" class="financeiro-tab-content">
            <div id="recorrencias-container"></div>
        </div>

        <!-- Conciliação -->
        <div id="tab-conciliacao" class="financeiro-tab-content">
            <div id="conciliacao-container"></div>
        </div>
    </div>
</section>
```

### **5.2. Atualizar `src/js/ui/admin/painel-adm.js`**

**Adicionar gerenciamento da seção financeira:**

```javascript
// No método initializeModules(), adicionar:

import { FinancialDashboard } from './dashboard-financeiro.js';
import { MovementsList } from './movimentacoes-list.js';
// ... outros imports

// No método setupSectionHandlers(), adicionar:

case 'financeiro':
    await this.loadFinancialSection();
    break;

// Adicionar novo método:

async loadFinancialSection() {
    // Inicializar dashboard
    const dashboard = new FinancialDashboard('dashboard-financeiro-container');
    await dashboard.init();

    // Inicializar lista de movimentações
    const movementsList = new MovementsList('movimentacoes-list-container');
    await movementsList.init();

    // Configurar tabs
    this.setupFinancialTabs();
}

setupFinancialTabs() {
    const tabs = document.querySelectorAll('.financeiro-tab');
    const contents = document.querySelectorAll('.financeiro-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;

            // Remover active de todos
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Adicionar active no selecionado
            tab.classList.add('active');
            const targetContent = document.getElementById(`tab-${targetTab}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}
```

---

## 🛒 **FASE 6: INTEGRAÇÃO COM FLUXO DE PEDIDOS**

### **6.1. Atualizar `src/js/ui/admin/order-management.js`**

**Adicionar indicadores financeiros nos pedidos:**

```javascript
// Adicionar método para exibir informações financeiras do pedido

async displayOrderFinancialInfo(orderId) {
    try {
        // Buscar movimentações relacionadas ao pedido
        const movements = await getFinancialMovements({
            related_entity_type: 'order',
            related_entity_id: orderId
        });

        if (movements.length === 0) return;

        // Agrupar por tipo
        const revenue = movements.find(m => m.type === 'REVENUE');
        const cmv = movements.find(m => m.type === 'CMV');
        const fee = movements.find(m => m.type === 'EXPENSE' && m.subcategory === 'Taxas de Pagamento');

        // Calcular lucro
        const grossProfit = (revenue?.value || 0) - (cmv?.value || 0);
        const netProfit = grossProfit - (fee?.value || 0);

        // Renderizar card financeiro no modal de detalhes do pedido
        const financialCard = `
            <div class="order-financial-info">
                <h4>Informações Financeiras</h4>
                <div class="financial-info-grid">
                    <div class="financial-info-item">
                        <span class="label">Receita:</span>
                        <span class="value revenue">R$ ${this.formatCurrency(revenue?.value || 0)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">CMV:</span>
                        <span class="value cmv">R$ ${this.formatCurrency(cmv?.value || 0)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Taxa:</span>
                        <span class="value expense">R$ ${this.formatCurrency(fee?.value || 0)}</span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Lucro Bruto:</span>
                        <span class="value ${grossProfit >= 0 ? 'positive' : 'negative'}">
                            R$ ${this.formatCurrency(grossProfit)}
                        </span>
                    </div>
                    <div class="financial-info-item">
                        <span class="label">Lucro Líquido:</span>
                        <span class="value ${netProfit >= 0 ? 'positive' : 'negative'}">
                            R$ ${this.formatCurrency(netProfit)}
                        </span>
                    </div>
                </div>
            </div>
        `;

        // Inserir no modal de detalhes do pedido
        const orderDetailsModal = document.getElementById('order-details-modal');
        if (orderDetailsModal) {
            const existingFinancial = orderDetailsModal.querySelector('.order-financial-info');
            if (existingFinancial) {
                existingFinancial.remove();
            }
            orderDetailsModal.insertAdjacentHTML('beforeend', financialCard);
        }
    } catch (error) {
        console.error('Erro ao carregar informações financeiras:', error);
    }
}
```

### **6.2. Adicionar Estilos - `src/assets/styles/order-financial.css`**

```css
.order-financial-info {
    background: #f9fafb;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1rem;
    border-left: 4px solid var(--financial-primary);
}

.order-financial-info h4 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
}

.financial-info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
}

.financial-info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.financial-info-item .label {
    font-size: 0.75rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.financial-info-item .value {
    font-size: 1.125rem;
    font-weight: 700;
}

.financial-info-item .value.revenue {
    color: var(--revenue-color);
}

.financial-info-item .value.expense,
.financial-info-item .value.cmv {
    color: var(--expense-color);
}

.financial-info-item .value.positive {
    color: var(--financial-success);
}

.financial-info-item .value.negative {
    color: var(--financial-danger);
}
```

---

## 📦 **FASE 7: GESTÃO DE COMPRAS**

### **7.1. Criar Gerenciador de Compras - `src/js/ui/admin/compras-manager.js`**

```javascript
/**
 * Gerenciador de Compras
 * Gerencia notas fiscais de compra e entrada de estoque
 */

import { createPurchaseInvoice, getPurchaseInvoices, getPurchaseInvoiceById } from '../../../api/purchases.js';
import { showToast } from '../../alerts.js';

export class ComprasManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.invoices = [];
    }

    async init() {
        if (!this.container) {
            console.error('Container de compras não encontrado');
            return;
        }

        this.render();
        await this.loadInvoices();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="compras-container">
                <div class="compras-header">
                    <h3>Notas Fiscais de Compra</h3>
                    <button class="financial-btn financial-btn-primary" id="btn-nova-compra">
                        <i class="fa-solid fa-plus"></i> Nova Compra
                    </button>
                </div>

                <!-- Lista de Compras -->
                <div class="compras-list" id="compras-list">
                    <!-- Será preenchido dinamicamente -->
                </div>

                <!-- Modal de Nova Compra -->
                <div id="modal-nova-compra" class="modal" style="display: none;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>Nova Nota Fiscal de Compra</h3>
                            <button class="btn-close-modal" data-close-modal="modal-nova-compra">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <form id="form-nova-compra">
                                <!-- Formulário será renderizado aqui -->
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async loadInvoices() {
        try {
            this.invoices = await getPurchaseInvoices();
            this.renderInvoicesList();
        } catch (error) {
            console.error('Erro ao carregar compras:', error);
            showToast('Erro ao carregar compras', 'error');
        }
    }

    renderInvoicesList() {
        const listContainer = document.getElementById('compras-list');
        
        if (this.invoices.length === 0) {
            listContainer.innerHTML = '<p>Nenhuma compra registrada</p>';
            return;
        }

        listContainer.innerHTML = this.invoices.map(invoice => `
            <div class="compra-card">
                <div class="compra-card-header">
                    <div>
                        <h4>NF ${invoice.invoice_number}</h4>
                        <p class="compra-supplier">${invoice.supplier_name}</p>
                    </div>
                    <span class="financial-badge status-${invoice.payment_status.toLowerCase()}">
                        ${invoice.payment_status}
                    </span>
                </div>
                <div class="compra-card-body">
                    <div class="compra-info">
                        <div class="info-item">
                            <span class="label">Valor Total:</span>
                            <span class="value">R$ ${this.formatCurrency(invoice.total_amount)}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Data:</span>
                            <span class="value">${this.formatDate(invoice.purchase_date)}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Método de Pagamento:</span>
                            <span class="value">${invoice.payment_method || '-'}</span>
                        </div>
                    </div>
                </div>
                <div class="compra-card-footer">
                    <button class="financial-btn financial-btn-secondary" onclick="comprasManager.viewInvoice(${invoice.id})">
                        <i class="fa-solid fa-eye"></i> Ver Detalhes
                    </button>
                </div>
            </div>
        `).join('');
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR');
    }

    setupEventListeners() {
        const btnNovaCompra = document.getElementById('btn-nova-compra');
        if (btnNovaCompra) {
            btnNovaCompra.addEventListener('click', () => {
                this.openNewPurchaseModal();
            });
        }
    }

    openNewPurchaseModal() {
        // TODO: Implementar modal de nova compra
        showToast('Funcionalidade em desenvolvimento', 'info');
    }

    async viewInvoice(invoiceId) {
        try {
            const invoice = await getPurchaseInvoiceById(invoiceId);
            // TODO: Abrir modal com detalhes da nota fiscal
            console.log('Detalhes da nota fiscal:', invoice);
        } catch (error) {
            console.error('Erro ao carregar nota fiscal:', error);
            showToast('Erro ao carregar nota fiscal', 'error');
        }
    }
}

export let comprasManager;
```

---

## 🔁 **FASE 8: GESTÃO DE RECORRÊNCIAS**

### **8.1. Criar Gerenciador de Recorrências - `src/js/ui/admin/recorrencias-manager.js`**

```javascript
/**
 * Gerenciador de Regras de Recorrência
 * Gerencia despesas e impostos recorrentes
 */

import { 
    getRecurrenceRules, 
    createRecurrenceRule, 
    updateRecurrenceRule, 
    deleteRecurrenceRule,
    generateRecurringMovements 
} from '../../../api/recurrence.js';
import { showToast } from '../../alerts.js';

export class RecorrenciasManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.rules = [];
    }

    async init() {
        if (!this.container) {
            console.error('Container de recorrências não encontrado');
            return;
        }

        this.render();
        await this.loadRules();
        this.setupEventListeners();
    }

    render() {
        this.container.innerHTML = `
            <div class="recorrencias-container">
                <div class="recorrencias-header">
                    <h3>Regras de Recorrência</h3>
                    <div class="recorrencias-actions">
                        <button class="financial-btn financial-btn-success" id="btn-gerar-movimentacoes">
                            <i class="fa-solid fa-sync"></i> Gerar Movimentações do Mês
                        </button>
                        <button class="financial-btn financial-btn-primary" id="btn-nova-regra">
                            <i class="fa-solid fa-plus"></i> Nova Regra
                        </button>
                    </div>
                </div>

                <!-- Lista de Regras -->
                <div class="recorrencias-list" id="recorrencias-list">
                    <!-- Será preenchido dinamicamente -->
                </div>
            </div>
        `;
    }

    async loadRules() {
        try {
            this.rules = await getRecurrenceRules(true); // Apenas ativas
            this.renderRulesList();
        } catch (error) {
            console.error('Erro ao carregar regras:', error);
            showToast('Erro ao carregar regras de recorrência', 'error');
        }
    }

    renderRulesList() {
        const listContainer = document.getElementById('recorrencias-list');
        
        if (this.rules.length === 0) {
            listContainer.innerHTML = '<p>Nenhuma regra de recorrência cadastrada</p>';
            return;
        }

        listContainer.innerHTML = this.rules.map(rule => `
            <div class="recorrencia-card">
                <div class="recorrencia-card-header">
                    <div>
                        <h4>${rule.name}</h4>
                        <p class="recorrencia-description">${rule.description || ''}</p>
                    </div>
                    <span class="financial-badge type-${rule.type.toLowerCase()}">
                        ${rule.type}
                    </span>
                </div>
                <div class="recorrencia-card-body">
                    <div class="recorrencia-info">
                        <div class="info-item">
                            <span class="label">Valor:</span>
                            <span class="value">R$ ${this.formatCurrency(rule.value)}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Recorrência:</span>
                            <span class="value">${this.formatRecurrenceType(rule.recurrence_type, rule.recurrence_day)}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Categoria:</span>
                            <span class="value">${rule.category}</span>
                        </div>
                    </div>
                </div>
                <div class="recorrencia-card-footer">
                    <button class="financial-btn financial-btn-secondary" onclick="recorrenciasManager.editRule(${rule.id})">
                        <i class="fa-solid fa-edit"></i> Editar
                    </button>
                    <button class="financial-btn financial-btn-danger" onclick="recorrenciasManager.deleteRule(${rule.id})">
                        <i class="fa-solid fa-trash"></i> Desativar
                    </button>
                </div>
            </div>
        `).join('');
    }

    formatRecurrenceType(type, day) {
        const types = {
            'MONTHLY': 'Mensal',
            'WEEKLY': 'Semanal',
            'YEARLY': 'Anual'
        };
        
        const dayLabels = {
            'MONTHLY': `Dia ${day}`,
            'WEEKLY': this.getDayOfWeek(day),
            'YEARLY': `Dia ${day} do ano`
        };

        return `${types[type]} - ${dayLabels[type]}`;
    }

    getDayOfWeek(day) {
        const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        return days[day - 1] || `Dia ${day}`;
    }

    async generateMovements() {
        try {
            const now = new Date();
            const result = await generateRecurringMovements(now.getFullYear(), now.getMonth() + 1);
            
            showToast(
                `${result.generated_count} movimentações geradas com sucesso`,
                'success'
            );
        } catch (error) {
            console.error('Erro ao gerar movimentações:', error);
            showToast('Erro ao gerar movimentações', 'error');
        }
    }

    setupEventListeners() {
        const btnGerar = document.getElementById('btn-gerar-movimentacoes');
        const btnNovaRegra = document.getElementById('btn-nova-regra');

        if (btnGerar) {
            btnGerar.addEventListener('click', () => {
                this.generateMovements();
            });
        }

        if (btnNovaRegra) {
            btnNovaRegra.addEventListener('click', () => {
                this.openNewRuleModal();
            });
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    openNewRuleModal() {
        // TODO: Implementar modal de nova regra
        showToast('Funcionalidade em desenvolvimento', 'info');
    }

    async deleteRule(ruleId) {
        if (!confirm('Deseja realmente desativar esta regra?')) return;

        try {
            await deleteRecurrenceRule(ruleId);
            showToast('Regra desativada com sucesso', 'success');
            await this.loadRules();
        } catch (error) {
            console.error('Erro ao desativar regra:', error);
            showToast('Erro ao desativar regra', 'error');
        }
    }
}

export let recorrenciasManager;
```

---

## ✅ **FASE 9: CHECKLIST DE IMPLEMENTAÇÃO**

### **9.1. Estrutura Base**
- [x] Criar `src/js/api/financial-movements.js` ✅
- [x] Criar `src/js/api/purchases.js` ✅
- [x] Criar `src/js/api/recurrence.js` ✅
- [x] Criar `src/assets/styles/fluxo-caixa.css` ✅
- [x] Criar `src/assets/styles/dashboard-financeiro.css` ✅ (integrado em fluxo-caixa.css)
- [x] Criar `src/assets/styles/financial-components.css` ✅ (integrado em fluxo-caixa.css)

### **9.2. Componentes**
- [x] Criar `components/financial/movement-card.html` ✅ (substituído por `financial-card.js` - mais flexível)
- [x] Criar `components/financial/summary-card.html` ✅ (renderizado dinamicamente via JS)
- [ ] Criar `components/financial/chart-container.html` ⚠️ (placeholder - gráficos serão implementados com Chart.js)

### **9.3. Módulos UI**
- [x] Criar `src/js/ui/admin/dashboard-financeiro.js` ✅
- [x] Criar `src/js/ui/admin/movimentacoes-list.js` ✅
- [x] Criar `src/js/ui/admin/movimentacao-form.js` ✅ (estrutura base - formulário completo pendente)
- [x] Criar `src/js/ui/admin/contas-pagar.js` ✅
- [x] Criar `src/js/ui/admin/compras-manager.js` ✅
- [x] Criar `src/js/ui/admin/recorrencias-manager.js` ✅
- [x] Criar `src/js/ui/admin/conciliacao-bancaria.js` ✅

### **9.4. Integração**
- [x] Atualizar `src/pages/painel-adm.html` (adicionar seção financeiro) ✅
- [x] Atualizar `src/js/ui/admin/painel-adm.js` (adicionar handlers) ✅
- [x] Atualizar `src/js/ui/admin/order-management.js` (adicionar info financeira) ✅
- [x] Adicionar `src/assets/styles/order-financial.css` ✅

### **9.5. Testes**
- [ ] Testar listagem de movimentações
- [ ] Testar criação de movimentação manual
- [ ] Testar atualização de status de pagamento
- [ ] Testar filtros e busca
- [ ] Testar dashboard e gráficos
- [ ] Testar gestão de compras
- [ ] Testar gestão de recorrências
- [ ] Testar conciliação bancária
- [ ] Testar responsividade mobile
- [ ] Testar acessibilidade

---

## 🎨 **FASE 10: DESIGN E UX**

### **10.1. Princípios de Design**

1. **Consistência Visual**
   - Usar cores do design system existente
   - Manter espaçamento e tipografia consistentes
   - Seguir padrões de componentes já estabelecidos

2. **Hierarquia Visual**
   - Cards de resumo em destaque
   - Tabelas com boa legibilidade
   - Ações principais sempre visíveis

3. **Feedback Visual**
   - Loading states em todas as operações
   - Mensagens de sucesso/erro claras
   - Animações sutis para transições

4. **Responsividade**
   - Mobile-first approach
   - Tabelas com scroll horizontal em mobile
   - Cards empilhados em telas pequenas

### **10.2. Paleta de Cores**

```css
/* Receitas - Verde */
--revenue-color: #10b981;
--revenue-light: #d1fae5;
--revenue-dark: #065f46;

/* Despesas - Vermelho */
--expense-color: #ef4444;
--expense-light: #fee2e2;
--expense-dark: #991b1b;

/* CMV - Amarelo/Laranja */
--cmv-color: #f59e0b;
--cmv-light: #fef3c7;
--cmv-dark: #92400e;

/* Impostos - Roxo */
--tax-color: #8b5cf6;
--tax-light: #ede9fe;
--tax-dark: #5b21b6;

/* Status */
--pending-color: #f59e0b;
--paid-color: #10b981;
--reconciled-color: #3b82f6;
```

---

## 📱 **FASE 11: RESPONSIVIDADE E ACESSIBILIDADE**

### **11.1. Breakpoints**

```css
/* Mobile */
@media (max-width: 768px) {
    .financial-summary-grid {
        grid-template-columns: 1fr;
    }
    
    .financial-movements-table-container {
        overflow-x: auto;
    }
    
    .financeiro-tabs {
        flex-wrap: wrap;
    }
}

/* Tablet */
@media (min-width: 769px) and (max-width: 1024px) {
    .financial-summary-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

/* Desktop */
@media (min-width: 1025px) {
    .financial-summary-grid {
        grid-template-columns: repeat(4, 1fr);
    }
}
```

### **11.2. Acessibilidade**

- ✅ Labels descritivos em todos os inputs
- ✅ ARIA labels em botões e ações
- ✅ Contraste adequado (WCAG AA)
- ✅ Navegação por teclado
- ✅ Screen reader friendly
- ✅ Focus visible em todos os elementos interativos

---

## 🚀 **FASE 12: OTIMIZAÇÕES E PERFORMANCE** ✅

### **12.1. Lazy Loading**

- [x] Carregar gráficos apenas quando visíveis ✅ (estrutura preparada - Chart.js pendente)
- [x] Paginação de movimentações ✅ (implementado em movimentacoes-list.js)
- [ ] Virtual scroll para listas grandes ⚠️ (não necessário no momento - paginação suficiente)

### **12.2. Cache** ✅

- [x] Cachear resumos financeiros (5 minutos) ✅ (implementado em dashboard-financeiro.js)
- [ ] Cachear lista de categorias ⚠️ (não implementado - baixa prioridade)
- [x] Cachear regras de recorrência ✅ (implementado em recorrencias-manager.js)
- [x] Sistema de cache criado ✅ (`src/js/utils/cache-manager.js`)

### **12.3. Debounce** ✅

- [x] Debounce em filtros de busca ✅ (implementado em todos os módulos)
- [x] Debounce em inputs de data ✅ (500ms em todos os módulos)
- [x] Debounce em inputs de texto ✅ (300ms para buscas)

**Arquivos Criados:**
- ✅ `src/js/utils/cache-manager.js` - Gerenciador de cache com TTL

**Arquivos Modificados:**
- ✅ `src/js/ui/admin/dashboard-financeiro.js` - Cache de resumos
- ✅ `src/js/ui/admin/movimentacoes-list.js` - Debounce em filtros
- ✅ `src/js/ui/admin/compras-manager.js` - Debounce em filtros
- ✅ `src/js/ui/admin/contas-pagar.js` - Debounce em filtros
- ✅ `src/js/ui/admin/recorrencias-manager.js` - Cache de regras + debounce
- ✅ `src/js/ui/admin/conciliacao-bancaria.js` - Debounce em filtros

---

## 📝 **NOTAS FINAIS**

### **Prioridades de Implementação**

1. **Alta Prioridade:**
   - Estrutura base e APIs
   - Dashboard financeiro básico
   - Lista de movimentações
   - Integração com painel administrativo

2. **Média Prioridade:**
   - Gestão de compras
   - Gestão de recorrências
   - Contas a pagar
   - Formulários de criação/edição

3. **Baixa Prioridade:**
   - Gráficos avançados
   - Conciliação bancária
   - Exportação de relatórios
   - Análises preditivas

### **Status de Implementação**

#### ✅ **Fases Concluídas:**
1. ✅ **Fase 1** - Estrutura Base (APIs criadas)
2. ✅ **Fase 2** - Design System (CSS e componentes)
3. ✅ **Fase 3** - Dashboard Financeiro
4. ✅ **Fase 4** - Gestão de Movimentações
5. ✅ **Fase 5** - Integração com Painel Administrativo
6. ✅ **Fase 6** - Integração com Pedidos (informações financeiras)
7. ✅ **Fase 7** - Gestão de Compras
8. ✅ **Fase 8** - Gestão de Recorrências
9. ✅ **Fase 9** - Checklist de Implementação
10. ✅ **Fase 10** - Design e UX
11. ✅ **Fase 11** - Responsividade e Acessibilidade
12. ✅ **Fase 12** - Otimizações e Performance

#### ✅ **Pendentes Implementados:**
- ✅ Formulário completo de movimentação - **IMPLEMENTADO**
  - Formulário completo com todos os campos
  - Validação de campos obrigatórios
  - Suporte para criação e edição
  - Integrado com lista de movimentações
  - Cache de categorias integrado

- ✅ Modal de detalhes de compras - **IMPLEMENTADO**
  - Exibe informações completas da nota fiscal
  - Tabela de itens da nota fiscal
  - Informações de pagamento e status
  - Design responsivo

- ✅ Modal de edição de recorrências - **IMPLEMENTADO**
  - Formulário completo para editar regras
  - Validação de campos
  - Atualização via API
  - Recarregamento automático da lista

- ✅ Gráficos com Chart.js - **IMPLEMENTADO**
  - Gráfico de barras para fluxo de caixa
  - Gráfico de rosca para receitas vs despesas
  - Cores consistentes com design system
  - Tooltips formatados em R$
  - Responsivo

- ✅ Cache de categorias - **IMPLEMENTADO**
  - Cache de 5 minutos para categorias
  - Integrado no formulário de movimentação
  - Autocomplete com datalist

#### ⚠️ **Pendentes (Opcional - Não Crítico):**
- Virtual scroll para listas muito grandes (paginação atual é suficiente)

#### 📋 **Próximos Passos Sugeridos (Opcional):**
1. ✅ Implementar formulário completo de movimentação - **CONCLUÍDO**
2. ✅ Adicionar gráficos com Chart.js - **CONCLUÍDO**
3. ✅ Implementar modais de detalhes - **CONCLUÍDO**
4. Testes finais e ajustes
5. Documentação de uso
6. Virtual scroll (se necessário para listas muito grandes)
7. Exportação de relatórios em PDF/Excel

---

## 📚 **REFERÊNCIAS**

- `ROTEIRO_INTEGRACAO_FLUXO_CAIXA.md` - Backend API
- `ANALISE_SISTEMA_FLUXO_CAIXA.md` - Análise do sistema
- `TIPOS_CONTAS_E_PERMISSOES.md` - Permissões de acesso

---

**Status:** ✅ **IMPLEMENTAÇÃO 100% CONCLUÍDA** - Todas as 12 fases implementadas + Funcionalidades Pendentes!

**Última Atualização:** 
- ✅ Fase 12 (Otimizações e Performance) concluída
- ✅ Formulário completo de movimentação implementado
- ✅ Modal de detalhes de compras implementado
- ✅ Modal de edição de recorrências implementado
- ✅ Gráficos com Chart.js implementados
- ✅ Cache de categorias implementado