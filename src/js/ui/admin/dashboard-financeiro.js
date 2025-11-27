/**
 * Dashboard Financeiro
 * Exibe métricas e gráficos do fluxo de caixa
 */

import { getCashFlowSummary, getFinancialMovements, updatePaymentStatus, getFinancialMovementById } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { renderFinancialMovementCards } from '../components/financial-card.js';
import { cacheManager } from '../../utils/cache-manager.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';
import { socketService } from '../../api/socket-client.js';

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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
        this.setupSocketListeners();
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

                <!-- ALTERAÇÃO: Cards de resumo removidos daqui - agora são renderizados antes das tabs -->
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
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
        // ALTERAÇÃO: Renderizar cards no container antes das tabs (se existir) ou no container padrão
        const externalCardsContainer = document.getElementById('financeiro-dashboard-cards');
        const cardsContainer = externalCardsContainer || document.getElementById('summary-cards');
        if (!cardsContainer) return;

        // ALTERAÇÃO: Mostrar container de cards se estava oculto
        if (externalCardsContainer) {
            externalCardsContainer.style.display = 'flex';
        }

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

        // ALTERAÇÃO: Usar estrutura de cards padrão (.quadro) se renderizando antes das tabs
        if (externalCardsContainer) {
            cardsContainer.innerHTML = `
                <div class="quadro">
                    <div class="titulo">
                        <p>Receitas</p>
                        <i class="fa-solid fa-arrow-up" style="color: var(--revenue-color);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(totalRevenue)}</p>
                        ${revenueChange !== null ? `
                            <p class="descricao">${revenueChange >= 0 ? '+' : ''}${revenueChange.toFixed(1)}% vs período anterior</p>
                        ` : ''}
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Despesas</p>
                        <i class="fa-solid fa-arrow-down" style="color: var(--expense-color);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(totalExpense)}</p>
                        ${expenseChange !== null ? `
                            <p class="descricao">${expenseChange >= 0 ? '+' : ''}${expenseChange.toFixed(1)}% vs período anterior</p>
                        ` : ''}
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>CMV</p>
                        <i class="fa-solid fa-box" style="color: var(--cmv-color);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(totalCmv)}</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Lucro Líquido</p>
                        <i class="fa-solid fa-chart-line" style="color: var(--financial-primary);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(netProfit)}</p>
                        <p class="descricao">Margem: ${this.calculateMargin(totalRevenue, netProfit)}%</p>
                        ${profitChange !== null ? `
                            <p class="descricao">${profitChange >= 0 ? '+' : ''}${profitChange.toFixed(1)}% vs período anterior</p>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            // Estrutura original para renderização dentro da tab
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
    }

    /**
     * Renderiza gráficos com Chart.js
     * @param {Object} summary - Resumo do fluxo de caixa
     */
    renderCharts(summary) {
        // Verificar se Chart.js está disponível
        if (typeof Chart === 'undefined') {
            // ALTERAÇÃO: Removido console.warn - Chart.js pode não estar disponível em todos os ambientes
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
            // ALTERAÇÃO: Usar paginação da API para buscar apenas 5 movimentações recentes
            const response = await getFinancialMovements({ 
                page: 1, 
                page_size: 5 
            });
            
            // ALTERAÇÃO: Extrair items da resposta paginada
            const recentMovements = response?.items || response || [];

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
                onEdit: async (movementId) => {
                    // ALTERAÇÃO: Abrir modal de edição baseada no tipo de entidade relacionada
                    const { openEditModalForMovement } = await import('../../utils/financial-entity-utils.js');
                    await openEditModalForMovement(movementId);
                    // Recarregar após edição
                    await this.loadRecentMovements();
                },
                onDelete: async (movementId) => {
                    // ALTERAÇÃO: Implementar exclusão de movimentação com proteção contra múltiplos cliques
                    if (this._deletingMovement) return; // Prevenir múltiplas requisições
                    
                    const { showConfirm } = await import('../alerts.js');
                    const { deleteFinancialMovement } = await import('../../api/financial-movements.js');
                    
                    const confirmed = await showConfirm({
                        title: 'Excluir Movimentação',
                        message: 'Tem certeza que deseja excluir esta movimentação?\n\nEsta ação não pode ser desfeita.',
                        confirmText: 'Excluir',
                        cancelText: 'Cancelar',
                        type: 'delete'
                    });
                    
                    if (!confirmed) return; // ALTERAÇÃO: Retornar se usuário cancelou
                    
                    this._deletingMovement = true;
                    try {
                        await deleteFinancialMovement(movementId);
                        showToast('Movimentação excluída com sucesso', {
                            type: 'success',
                            title: 'Sucesso'
                        });
                        await this.loadRecentMovements();
                    } catch (error) {
                        // ALTERAÇÃO: Extrair mensagem de erro do backend corretamente
                        let errorMessage = 'Erro ao excluir movimentação';
                        
                        // ALTERAÇÃO: Tratar 404 como sucesso silencioso (movimentação já foi excluída)
                        if (error?.status === 404) {
                            // Movimentação já foi excluída - tratar como sucesso
                            showToast('Movimentação excluída com sucesso', {
                                type: 'success',
                                title: 'Sucesso'
                            });
                            await this.loadRecentMovements();
                            return;
                        }
                        
                        if (error?.userMessage) {
                            errorMessage = error.userMessage;
                        } else if (error?.payload?.error) {
                            errorMessage = error.payload.error;
                        } else if (error?.message) {
                            errorMessage = error.message;
                        } else if (typeof error === 'string') {
                            errorMessage = error;
                        }
                        
                        showToast(errorMessage, {
                            type: 'error',
                            title: 'Erro ao Excluir'
                        });
                    } finally {
                        this._deletingMovement = false;
                    }
                },
                onViewRelated: async (entityType, entityId, movementType) => {
                    // ALTERAÇÃO: Usar utility compartilhada para reduzir duplicação
                    // ALTERAÇÃO: movementType já vem do card (CMV ou REVENUE)
                    await openRelatedEntityModal(entityType, entityId, movementType);
                },
                onMarkAsPaid: async (movementId) => {
                    // ALTERAÇÃO: Marcar movimentação como paga
                    try {
                        // ALTERAÇÃO: Buscar movimentação para verificar se está vinculada a uma compra
                        const movement = await getFinancialMovementById(movementId);
                        const relatedEntityType = movement?.related_entity_type || '';
                        const relatedEntityId = movement?.related_entity_id;
                        
                        // ALTERAÇÃO: API espera 'Paid' com P maiúsculo
                        await updatePaymentStatus(movementId, 'Paid', formatDateForAPI(new Date()));
                        showToast('Movimentação marcada como paga com sucesso!', {
                            type: 'success',
                            title: 'Sucesso'
                        });
                        
                        // Recarregar dados para atualizar os cards
                        await this.loadRecentMovements();
                        
                        // ALTERAÇÃO: Usar utility compartilhada para atualizar compras se necessário
                        await refreshPurchasesIfNeeded(relatedEntityType, relatedEntityId);
                    } catch (error) {
                        // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
                        const errorMessage = error.message || 'Erro ao marcar movimentação como paga';
                        showToast(errorMessage, {
                            type: 'error',
                            title: 'Erro'
                        });
                    }
                }
            });
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
     * Configura listeners de eventos WebSocket para atualização em tempo real
     */
    setupSocketListeners() {
        // Ouve novo pedido para atualizar métricas
        socketService.on('order.created', (data) => {
            console.log('📊 Atualizando Dashboard com novo pedido...', data);
            
            // Atualiza contador de pedidos (IDs do HTML: dashboard-pedidos-hoje)
            const elPedidosHoje = document.getElementById('dashboard-pedidos-hoje');
            if (elPedidosHoje) {
                let count = parseInt(elPedidosHoje.textContent) || 0;
                elPedidosHoje.textContent = count + 1;
                
                // Efeito visual (piscar verde)
                elPedidosHoje.style.color = '#28a745';
                elPedidosHoje.style.transition = 'color 0.3s ease';
                setTimeout(() => {
                    elPedidosHoje.style.color = '';
                }, 1000);
            }

            // Atualiza receita (ID do HTML: dashboard-receita-dia)
            const elFaturamento = document.getElementById('dashboard-receita-dia');
            if (elFaturamento && data.total) {
                // Remove 'R$', espaços e troca vírgula por ponto para somar
                let currentText = elFaturamento.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
                let currentVal = parseFloat(currentText) || 0;
                
                let newVal = currentVal + parseFloat(data.total);
                
                // Formata de volta para BRL
                elFaturamento.textContent = newVal.toLocaleString('pt-BR', { 
                    style: 'currency', 
                    currency: 'BRL' 
                });
                
                // Efeito visual (piscar verde)
                elFaturamento.style.color = '#28a745';
                elFaturamento.style.transition = 'color 0.3s ease';
                setTimeout(() => {
                    elFaturamento.style.color = '';
                }, 1000);
            }

            // Recarrega dados do dashboard para atualizar gráficos
            // Usa debounce para evitar múltiplas atualizações simultâneas
            if (this.refreshTimeout) {
                clearTimeout(this.refreshTimeout);
            }
            this.refreshTimeout = setTimeout(() => {
                this.loadData();
            }, 1000);
        });

        // Ouve mudança de status de pedido (pode afetar métricas)
        socketService.on('order.status_changed', (data) => {
            // Se o pedido foi concluído, pode atualizar receita
            if (data.new_status === 'delivered' || data.new_status === 'completed') {
                // Recarrega dados após um pequeno delay
                if (this.refreshTimeout) {
                    clearTimeout(this.refreshTimeout);
                }
                this.refreshTimeout = setTimeout(() => {
                    this.loadData();
                }, 1000);
            }
        });
    }

    /**
     * Atualiza o DOM do elemento de receita
     * @param {number} newTotal - Novo valor a ser adicionado
     */
    updateRevenueDOM(newTotal) {
        const elRevenue = document.getElementById('dash-revenue');
        if (!elRevenue) return;

        // Remove 'R$', espaços e converte para número
        const currentText = elRevenue.textContent || 'R$ 0,00';
        const currentValue = parseFloat(
            currentText
                .replace('R$', '')
                .replace(/\./g, '')
                .replace(',', '.')
                .trim()
        ) || 0;

        // Soma o novo valor
        const newValue = currentValue + parseFloat(newTotal || 0);

        // Formata de volta
        elRevenue.textContent = this.formatCurrency(newValue);
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

    /**
     * Configura eventos em tempo real para atualização automática
     * ALTERAÇÃO: Implementado para atualizar dashboard quando há mudanças
     */
    setupRealtimeEvents() {
        const client = getRealtimeClient();
        
        // ALTERAÇÃO: Escutar eventos de compras criadas/atualizadas
        client.on('purchase.created', async (data) => {
            // Invalidar cache e recarregar dados
            cacheManager.delete(`dashboard_summary_${this.currentPeriod}_${this.includePending}`);
            await this.loadData();
        });

        client.on('purchase.updated', async (data) => {
            // Invalidar cache e recarregar dados
            cacheManager.delete(`dashboard_summary_${this.currentPeriod}_${this.includePending}`);
            await this.loadData();
        });

        // ALTERAÇÃO: Escutar eventos de movimentações financeiras
        client.on('financial_movement.created', async (data) => {
            // Invalidar cache e recarregar dados
            cacheManager.delete(`dashboard_summary_${this.currentPeriod}_${this.includePending}`);
            await this.loadData();
        });

        client.on('financial_movement.payment_status_updated', async (data) => {
            // Invalidar cache e recarregar dados
            cacheManager.delete(`dashboard_summary_${this.currentPeriod}_${this.includePending}`);
            await this.loadData();
        });
    }
}

