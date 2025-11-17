/**
 * Dashboard Financeiro
 * Exibe métricas e gráficos do fluxo de caixa
 */

import { getCashFlowSummary, getFinancialMovements } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { renderFinancialMovementCards } from '../components/financial-card.js';
import { cacheManager } from '../../utils/cache-manager.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';

export class FinancialDashboard {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentPeriod = 'this_month';
        this.includePending = false;
        this.charts = {
            cashFlow: null,
            revenueExpense: null
        };
        this.isInitialized = false;
        this.isLoading = false;
    }

    /**
     * Inicializa o dashboard
     */
    async init() {
        if (!this.container) {
            console.error('Container do dashboard não encontrado');
            return;
        }

        // ALTERAÇÃO: Evitar múltiplas inicializações
        if (this.isInitialized) {
            return;
        }

        this.isInitialized = true;
        this.render();
        await this.loadData();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML do dashboard
     */
    render() {
        this.container.innerHTML = `
            <div class="dashboard-financeiro">
                <!-- Header -->
                <div class="dashboard-header">
                    <h2>Dashboard Financeiro</h2>
                    <div class="dashboard-controls">
                        <select id="dashboard-period" class="dashboard-select" aria-label="Selecionar período">
                            <option value="this_month">Este Mês</option>
                            <option value="last_month">Mês Anterior</option>
                            <option value="last_30_days">Últimos 30 Dias</option>
                        </select>
                        <label class="dashboard-checkbox">
                            <input type="checkbox" id="dashboard-include-pending" aria-label="Incluir pendências">
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
                        <canvas id="cash-flow-chart" aria-label="Gráfico de fluxo de caixa"></canvas>
                    </div>
                    <div class="chart-container">
                        <h3>Receitas vs Despesas</h3>
                        <canvas id="revenue-expense-chart" aria-label="Gráfico de receitas versus despesas"></canvas>
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

    /**
     * Carrega dados do dashboard
     */
    async loadData() {
        // ALTERAÇÃO: Evitar múltiplas requisições simultâneas
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        try {
            // Gerar chave de cache baseada no período e filtros
            const cacheKey = `dashboard_summary_${this.currentPeriod}_${this.includePending}`;
            
            // Tentar obter do cache primeiro
            let summary = cacheManager.get(cacheKey);
            
            if (!summary) {
                // Se não estiver no cache, buscar da API
                summary = await getCashFlowSummary(this.currentPeriod, this.includePending);
                // Armazenar no cache por 5 minutos
                cacheManager.set(cacheKey, summary, 5 * 60 * 1000);
            }
            
            this.renderSummaryCards(summary);
            this.renderCharts(summary);
            await this.loadRecentMovements();
        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            showToast('Erro ao carregar dados do dashboard', { 
                type: 'error',
                title: 'Erro'
            });
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renderiza os cards de resumo financeiro
     * @param {Object} summary - Resumo do fluxo de caixa
     */
    renderSummaryCards(summary) {
        const cardsContainer = document.getElementById('summary-cards');
        if (!cardsContainer) return;

        const totalRevenue = summary.total_revenue || 0;
        const totalExpense = summary.total_expense || 0;
        const totalCmv = summary.total_cmv || 0;
        const netProfit = summary.net_profit || 0;
        const previousRevenue = summary.previous_revenue || 0;
        const previousExpense = summary.previous_expense || 0;
        const previousProfit = summary.previous_profit || 0;

        // Calcular variações percentuais
        const revenueChange = this.calculatePercentageChange(previousRevenue, totalRevenue);
        const expenseChange = this.calculatePercentageChange(previousExpense, totalExpense);
        const profitChange = this.calculatePercentageChange(previousProfit, netProfit);

        cardsContainer.innerHTML = `
            <div class="financial-summary-card revenue">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Receitas</span>
                    <i class="fa-solid fa-arrow-up financial-summary-card-icon" style="color: var(--revenue-color);" aria-hidden="true"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(totalRevenue)}</p>
                ${revenueChange !== null ? `
                    <div class="financial-summary-card-change ${revenueChange >= 0 ? 'positive' : 'negative'}">
                        <i class="fa-solid fa-${revenueChange >= 0 ? 'arrow-up' : 'arrow-down'}" aria-hidden="true"></i>
                        <span>${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% vs período anterior</span>
                    </div>
                ` : ''}
            </div>

            <div class="financial-summary-card expense">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Despesas</span>
                    <i class="fa-solid fa-arrow-down financial-summary-card-icon" style="color: var(--expense-color);" aria-hidden="true"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(totalExpense)}</p>
                ${expenseChange !== null ? `
                    <div class="financial-summary-card-change ${expenseChange <= 0 ? 'positive' : 'negative'}">
                        <i class="fa-solid fa-${expenseChange <= 0 ? 'arrow-down' : 'arrow-up'}" aria-hidden="true"></i>
                        <span>${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}% vs período anterior</span>
                    </div>
                ` : ''}
            </div>

            <div class="financial-summary-card cmv">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">CMV</span>
                    <i class="fa-solid fa-box financial-summary-card-icon" style="color: var(--cmv-color);" aria-hidden="true"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(totalCmv)}</p>
            </div>

            <div class="financial-summary-card profit">
                <div class="financial-summary-card-header">
                    <span class="financial-summary-card-title">Lucro Líquido</span>
                    <i class="fa-solid fa-chart-line financial-summary-card-icon" style="color: var(--financial-primary);" aria-hidden="true"></i>
                </div>
                <p class="financial-summary-card-value">R$ ${this.formatCurrency(netProfit)}</p>
                <div class="financial-summary-card-change ${netProfit >= 0 ? 'positive' : 'negative'}">
                    <i class="fa-solid fa-${netProfit >= 0 ? 'arrow-up' : 'arrow-down'}" aria-hidden="true"></i>
                    <span>Margem: ${this.calculateMargin(totalRevenue, netProfit)}%</span>
                </div>
                ${profitChange !== null ? `
                    <div class="financial-summary-card-change ${profitChange >= 0 ? 'positive' : 'negative'}" style="margin-top: 0.5rem;">
                        <i class="fa-solid fa-${profitChange >= 0 ? 'arrow-up' : 'arrow-down'}" aria-hidden="true"></i>
                        <span>${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)}% vs período anterior</span>
                    </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * Renderiza gráficos com Chart.js
     * @param {Object} summary - Resumo do fluxo de caixa
     */
    renderCharts(summary) {
        // Verificar se Chart.js está disponível
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está disponível. Gráficos não serão renderizados.');
            return;
        }

        // Destruir gráficos existentes se houver
        if (this.charts.cashFlow) {
            this.charts.cashFlow.destroy();
        }
        if (this.charts.revenueExpense) {
            this.charts.revenueExpense.destroy();
        }

        const cashFlowCanvas = document.getElementById('cash-flow-chart');
        const revenueExpenseCanvas = document.getElementById('revenue-expense-chart');

        if (cashFlowCanvas) {
            this.renderCashFlowChart(cashFlowCanvas, summary);
        }

        if (revenueExpenseCanvas) {
            this.renderRevenueExpenseChart(revenueExpenseCanvas, summary);
        }
    }

    /**
     * Renderiza gráfico de fluxo de caixa
     * @param {HTMLCanvasElement} canvas - Elemento canvas
     * @param {Object} summary - Dados do resumo
     */
    renderCashFlowChart(canvas, summary) {
        const ctx = canvas.getContext('2d');
        
        // Preparar dados (usar dados históricos se disponíveis, senão usar resumo atual)
        const labels = ['Receitas', 'Despesas', 'CMV', 'Lucro'];
        const data = [
            summary.total_revenue || 0,
            summary.total_expense || 0,
            summary.total_cmv || 0,
            (summary.total_revenue || 0) - (summary.total_expense || 0) - (summary.total_cmv || 0)
        ];

        this.charts.cashFlow = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Valor (R$)',
                    data: data,
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',  // Receitas - verde
                        'rgba(239, 68, 68, 0.8)',   // Despesas - vermelho
                        'rgba(245, 158, 11, 0.8)',  // CMV - laranja
                        'rgba(37, 99, 235, 0.8)'    // Lucro - azul
                    ],
                    borderColor: [
                        'rgb(16, 185, 129)',
                        'rgb(239, 68, 68)',
                        'rgb(245, 158, 11)',
                        'rgb(37, 99, 235)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `R$ ${this.formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: (value) => {
                                return `R$ ${this.formatCurrency(value)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Renderiza gráfico de receitas vs despesas
     * @param {HTMLCanvasElement} canvas - Elemento canvas
     * @param {Object} summary - Dados do resumo
     */
    renderRevenueExpenseChart(canvas, summary) {
        const ctx = canvas.getContext('2d');
        
        const revenue = summary.total_revenue || 0;
        const expense = (summary.total_expense || 0) + (summary.total_cmv || 0);

        this.charts.revenueExpense = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Receitas', 'Despesas'],
                datasets: [{
                    data: [revenue, expense],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.8)',  // Receitas - verde
                        'rgba(239, 68, 68, 0.8)'   // Despesas - vermelho
                    ],
                    borderColor: [
                        'rgb(16, 185, 129)',
                        'rgb(239, 68, 68)'
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const label = context.label || '';
                                const value = context.parsed || 0;
                                const total = revenue + expense;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                                return `${label}: R$ ${this.formatCurrency(value)} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Carrega e renderiza movimentações recentes
     */
    async loadRecentMovements() {
        try {
            // Buscar movimentações recentes sem filtros de data
            // A API pode ter problemas com validação de datas, então buscamos todas e filtramos no frontend
            const movements = await getFinancialMovements({});
            
            // Ordenar por data mais recente e pegar apenas os 5 primeiros
            const recentMovements = (movements || [])
                .sort((a, b) => {
                    const dateA = new Date(a.movement_date || a.date || 0);
                    const dateB = new Date(b.movement_date || b.date || 0);
                    return dateB - dateA;
                })
                .slice(0, 5);

            const container = document.getElementById('recent-movements-list');
            if (!container) return;

            if (recentMovements.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <i class="fa-solid fa-inbox" style="font-size: 32px; margin-bottom: 8px; opacity: 0.3;" aria-hidden="true"></i>
                        <p style="font-size: 14px;">Nenhuma movimentação recente</p>
                    </div>
                `;
                return;
            }

            // Renderizar cards de movimentações
            renderFinancialMovementCards(recentMovements, container, {
                onEdit: (movementId) => {
                    // TODO: Implementar edição de movimentação
                    console.log('Editar movimentação:', movementId);
                },
                onDelete: (movementId) => {
                    // TODO: Implementar exclusão de movimentação
                    console.log('Excluir movimentação:', movementId);
                },
                onViewRelated: (entityType, entityId) => {
                    // TODO: Implementar navegação para entidade relacionada
                    console.log('Ver entidade relacionada:', entityType, entityId);
                }
            });
        } catch (error) {
            console.error('Erro ao carregar movimentações recentes:', error);
            const container = document.getElementById('recent-movements-list');
            if (container) {
                // Não exibir erro para o usuário, apenas mostrar mensagem neutra
                container.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <i class="fa-solid fa-inbox" style="font-size: 32px; margin-bottom: 8px; opacity: 0.3;" aria-hidden="true"></i>
                        <p style="font-size: 14px;">Nenhuma movimentação recente</p>
                    </div>
                `;
            }
        }
    }

    /**
     * Configura event listeners
     */
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

    /**
     * Formata valor monetário
     * @param {number} value - Valor a formatar
     * @returns {string} Valor formatado
     */
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value || 0);
    }

    /**
     * Calcula margem de lucro
     * @param {number} revenue - Receita total
     * @param {number} profit - Lucro líquido
     * @returns {string} Margem em percentual
     */
    calculateMargin(revenue, profit) {
        if (!revenue || revenue === 0) return '0.00';
        return ((profit / revenue) * 100).toFixed(2);
    }

    /**
     * Calcula variação percentual entre dois valores
     * @param {number} previous - Valor anterior
     * @param {number} current - Valor atual
     * @returns {number|null} Variação percentual ou null se não houver valor anterior
     */
    calculatePercentageChange(previous, current) {
        if (!previous || previous === 0) return null;
        return ((current - previous) / previous) * 100;
    }
}

