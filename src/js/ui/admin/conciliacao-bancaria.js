/**
 * Gerenciador de Conciliação Bancária
 * Gerencia conciliação de movimentações com extratos bancários
 */

import { getReconciliationReport, reconcileMovement } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { debounce } from '../../utils/performance-utils.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';

export class ConciliacaoBancariaManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.report = null;
        this.filters = {
            start_date: null,
            end_date: null,
            reconciled: null,
            payment_gateway_id: null
        };
        this.isInitialized = false;
        this.isLoading = false;
    }

    /**
     * Inicializa o gerenciador
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
        await this.loadReport();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="conciliacao-container">
                <div class="conciliacao-header">
                    <h3>Conciliação Bancária</h3>
                    <p class="conciliacao-description">
                        Compare movimentações financeiras com extratos bancários e marque como reconciliadas
                    </p>
                </div>

                <!-- Filtros -->
                <div class="financial-filters">
                    <div class="financial-filters-grid">
                        <div class="financial-filter-group">
                            <label for="filter-conciliacao-start-date">Data Início</label>
                            <input type="date" id="filter-conciliacao-start-date" class="filter-input" aria-label="Data de início">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-conciliacao-end-date">Data Fim</label>
                            <input type="date" id="filter-conciliacao-end-date" class="filter-input" aria-label="Data de fim">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-conciliacao-status">Status</label>
                            <select id="filter-conciliacao-status" class="filter-select" aria-label="Filtrar por status">
                                <option value="">Todos</option>
                                <option value="false">Não Reconciliadas</option>
                                <option value="true">Reconciliadas</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>&nbsp;</label>
                            <button class="financial-btn financial-btn-primary" id="btn-apply-filters-conciliacao" aria-label="Aplicar filtros">
                                <i class="fa-solid fa-filter" aria-hidden="true"></i>
                                <span>Filtrar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ALTERAÇÃO: Resumo removido - cards são renderizados em conciliacao-dashboard-cards antes das tabs -->
                <!-- Lista de Movimentações -->
                <div class="conciliacao-list" id="conciliacao-list">
                    <div class="financial-loading">Carregando...</div>
                </div>
            </div>
        `;
    }

    /**
     * Carrega relatório de conciliação
     */
    async loadReport() {
        // ALTERAÇÃO: Evitar múltiplas requisições simultâneas
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        try {
            // ALTERAÇÃO: Mostrar loading no container de lista
            const listContainer = document.getElementById('conciliacao-list');
            if (listContainer) {
                listContainer.innerHTML = '<div class="financial-loading">Carregando relatório...</div>';
            }
            
            this.report = await getReconciliationReport(this.filters);
            this.renderSummary();
            this.renderMovements();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é tratado e exibido ao usuário via toast
            // console.error('Erro ao carregar relatório de conciliação:', error);
            
            // ALTERAÇÃO: Mensagem de erro mais específica
            let errorMessage = 'Erro ao carregar relatório de conciliação';
            if (error.message && error.message.includes('SQLCODE')) {
                errorMessage = 'Erro no banco de dados ao gerar relatório. Verifique os filtros e tente novamente.';
            } else if (error.message) {
                errorMessage = `Erro: ${error.message}`;
            }
            
            showToast(errorMessage, { 
                type: 'error',
                title: 'Erro no Relatório'
            });
            this.report = null;
            this.renderSummary();
            this.renderMovements();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renderiza resumo da conciliação
     */
    renderSummary() {
        // ALTERAÇÃO: Renderizar cards apenas no container antes das tabs
        const externalCardsContainer = document.getElementById('conciliacao-dashboard-cards');
        
        if (!this.report) {
            if (externalCardsContainer) {
                externalCardsContainer.style.display = 'none';
            }
            return;
        }

        // ALTERAÇÃO: Corrigir referências aos campos do relatório
        const total = this.report.total_movements || 0;
        const reconciled = this.report.reconciled_count || 0;
        const pending = this.report.unreconciled_count || 0;
        const reconciledAmount = this.report.reconciled_amount || 0;
        const unreconciledAmount = this.report.unreconciled_amount || 0;
        const percentage = total > 0 ? ((reconciled / total) * 100).toFixed(1) : 0;

        // ALTERAÇÃO: Renderizar apenas no container antes das tabs usando estrutura padrão (.quadro)
        if (externalCardsContainer) {
            externalCardsContainer.style.display = 'flex';
            externalCardsContainer.innerHTML = `
                <div class="quadro">
                    <div class="titulo">
                        <p>Total de Movimentações</p>
                        <i class="fa-solid fa-list" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">${total}</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Reconciliadas</p>
                        <i class="fa-solid fa-check-double" style="color: var(--reconciled-color, #10b981);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">${reconciled}</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Pendentes</p>
                        <i class="fa-solid fa-clock" style="color: var(--pending-color, #f59e0b);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">${pending}</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Taxa de Conciliação</p>
                        <i class="fa-solid fa-percent" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">${percentage}%</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Valor Reconciliado</p>
                        <i class="fa-solid fa-check-circle" style="color: var(--reconciled-color, #10b981);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(reconciledAmount)}</p>
                    </div>
                </div>

                <div class="quadro">
                    <div class="titulo">
                        <p>Valor Pendente</p>
                        <i class="fa-solid fa-clock" style="color: var(--pending-color, #f59e0b);" aria-hidden="true"></i>
                    </div>
                    <div class="valor">
                        <p class="grande">R$ ${this.formatCurrency(unreconciledAmount)}</p>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Renderiza lista de movimentações
     */
    renderMovements() {
        const listContainer = document.getElementById('conciliacao-list');
        if (!listContainer) return;

        if (!this.report || !this.report.movements || this.report.movements.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fa-solid fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhuma movimentação encontrada</p>
                </div>
            `;
            return;
        }

        // ALTERAÇÃO: Implementar renderização completa de movimentações
        listContainer.innerHTML = this.report.movements.map(movement => {
            const movementId = movement.id;
            const type = (movement.type || '').toLowerCase();
            const value = parseFloat(movement.value || 0);
            const description = escapeHTML(movement.description || '');
            const movementDate = movement.movement_date ? this.formatDate(movement.movement_date) : 'Data não informada';
            const paymentMethod = this.formatPaymentMethod(movement.payment_method);
            const reconciled = movement.reconciled || false;
            const reconciledAt = movement.reconciled_at ? this.formatDate(movement.reconciled_at) : null;
            const transactionId = escapeHTML(movement.transaction_id || '');
            const bankAccount = escapeHTML(movement.bank_account || '');
            const gatewayId = escapeHTML(movement.payment_gateway_id || '');

            const typeClass = `type-${type}`;
            const typeLabel = this.translateType(movement.type || '');
            const valueSign = type === 'revenue' ? '+' : '-';
            const valueClass = type === 'revenue' ? 'positive' : 'negative';

            return `
                <div class="financial-movement-card ${typeClass} ${reconciled ? 'reconciled' : ''}" 
                     data-movement-id="${movementId}">
                    <div class="financial-movement-card-header">
                        <div class="financial-movement-card-type">
                            <span class="financial-badge ${typeClass}">${typeLabel}</span>
                            ${reconciled ? '<span class="financial-badge reconciled"><i class="fa-solid fa-check-double"></i> Reconciliada</span>' : ''}
                        </div>
                        <div class="financial-movement-card-actions">
                            <button class="financial-btn ${reconciled ? 'financial-btn-secondary' : 'financial-btn-success'}" 
                                    data-action="reconcile" 
                                    data-movement-id="${movementId}"
                                    data-reconciled="${reconciled}"
                                    title="${reconciled ? 'Desmarcar como reconciliada' : 'Marcar como reconciliada'}"
                                    aria-label="${reconciled ? 'Desmarcar conciliação' : 'Marcar como reconciliada'}">
                                <i class="fa-solid ${reconciled ? 'fa-undo' : 'fa-check-double'}" aria-hidden="true"></i>
                                <span>${reconciled ? 'Desmarcar' : 'Reconciliar'}</span>
                            </button>
                        </div>
                    </div>
                    
                    <div class="financial-movement-card-body">
                        <div class="financial-movement-card-value">
                            <span class="value-sign ${valueClass}">${valueSign}</span>
                            <span class="value-amount">R$ ${this.formatCurrency(value)}</span>
                        </div>
                        
                        <div class="financial-movement-card-description">
                            <p class="description-text">${description}</p>
                        </div>
                        
                        <div class="financial-movement-card-details">
                            <div class="detail-item">
                                <i class="fa-solid fa-calendar" aria-hidden="true"></i>
                                <span>${movementDate}</span>
                            </div>
                            ${paymentMethod ? `
                                <div class="detail-item">
                                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                                    <span>${paymentMethod}</span>
                                </div>
                            ` : ''}
                            ${transactionId ? `
                                <div class="detail-item">
                                    <i class="fa-solid fa-hashtag" aria-hidden="true"></i>
                                    <span>Transação: ${transactionId}</span>
                                </div>
                            ` : ''}
                            ${gatewayId ? `
                                <div class="detail-item">
                                    <i class="fa-solid fa-network-wired" aria-hidden="true"></i>
                                    <span>Gateway: ${gatewayId}</span>
                                </div>
                            ` : ''}
                            ${bankAccount ? `
                                <div class="detail-item">
                                    <i class="fa-solid fa-university" aria-hidden="true"></i>
                                    <span>Conta: ${bankAccount}</span>
                                </div>
                            ` : ''}
                            ${reconciledAt ? `
                                <div class="detail-item">
                                    <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
                                    <span>Reconciliada em: ${reconciledAt}</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // ALTERAÇÃO: Configurar event listeners para botões de conciliação
        this.setupReconciliationListeners();
    }

    /**
     * Marca movimentação como reconciliada ou não
     * @param {number} movementId - ID da movimentação
     * @param {boolean} reconciled - true para reconciliada, false para desmarcar
     */
    async markAsReconciled(movementId, reconciled = true) {
        try {
            await reconcileMovement(movementId, reconciled);
            showToast(
                reconciled 
                    ? 'Movimentação marcada como reconciliada' 
                    : 'Conciliação removida da movimentação',
                { 
                    type: 'success',
                    title: 'Sucesso'
                }
            );
            // ALTERAÇÃO: Recarregar relatório para atualizar dados
            await this.loadReport();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            const errorMessage = error.message || 'Erro ao reconciliar movimentação';
            showToast(errorMessage, { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Debounce para inputs de data (500ms)
        const debouncedApplyFilters = debounce(() => {
            this.applyFilters();
        }, 500);

        // Inputs de data com debounce
        const startDateInput = document.getElementById('filter-conciliacao-start-date');
        const endDateInput = document.getElementById('filter-conciliacao-end-date');
        const statusSelect = document.getElementById('filter-conciliacao-status');

        if (startDateInput) {
            startDateInput.addEventListener('change', () => {
                debouncedApplyFilters();
            });
        }

        if (endDateInput) {
            endDateInput.addEventListener('change', () => {
                debouncedApplyFilters();
            });
        }

        if (statusSelect) {
            statusSelect.addEventListener('change', () => {
                debouncedApplyFilters();
            });
        }

        // Botão de aplicar filtros
        const btnApplyFilters = document.getElementById('btn-apply-filters-conciliacao');
        if (btnApplyFilters) {
            btnApplyFilters.addEventListener('click', () => {
                this.applyFilters();
            });
        }
    }

    /**
     * Aplica filtros
     */
    applyFilters() {
        const startDateInput = document.getElementById('filter-conciliacao-start-date')?.value;
        const endDateInput = document.getElementById('filter-conciliacao-end-date')?.value;
        const status = document.getElementById('filter-conciliacao-status')?.value;

        // Converter datas do formato HTML5 (AAAA-MM-DD) para formato da API (DD-MM-AAAA)
        const startDate = startDateInput ? formatDateForAPI(startDateInput) : null;
        const endDate = endDateInput ? formatDateForAPI(endDateInput) : null;

        this.filters = {
            start_date: startDate,
            end_date: endDate,
            reconciled: status !== '' ? status === 'true' : null,
            payment_gateway_id: null
        };

        this.loadReport();
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
     * Formata data para exibição
     * @param {string} dateString - Data em formato ISO
     * @returns {string} Data formatada
     */
    formatDate(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }).format(date);
        } catch (e) {
            return dateString;
        }
    }

    /**
     * Formata método de pagamento
     * @param {string} method - Método de pagamento
     * @returns {string} Método formatado
     */
    formatPaymentMethod(method) {
        if (!method) return '';
        const m = String(method).toLowerCase();
        if (m === 'credit' || m.includes('credito')) return 'Cartão de Crédito';
        if (m === 'debit' || m.includes('debito')) return 'Cartão de Débito';
        if (m === 'pix') return 'PIX';
        if (m === 'money' || m.includes('dinheiro') || m.includes('cash')) return 'Dinheiro';
        if (m === 'bank_transfer' || m.includes('transfer')) return 'Transferência Bancária';
        return method;
    }

    /**
     * Traduz tipo de movimentação
     * @param {string} type - Tipo em inglês
     * @returns {string} Tipo em português
     */
    translateType(type) {
        const translations = {
            'REVENUE': 'Receita',
            'EXPENSE': 'Despesa',
            'CMV': 'CMV',
            'TAX': 'Imposto'
        };
        return translations[type] || type;
    }

    /**
     * Configura event listeners para botões de conciliação
     */
    setupReconciliationListeners() {
        const listContainer = document.getElementById('conciliacao-list');
        if (!listContainer) return;

        // ALTERAÇÃO: Remover listeners anteriores para evitar vazamento de memória
        const existingHandler = listContainer._reconciliationClickHandler;
        if (existingHandler) {
            listContainer.removeEventListener('click', existingHandler);
        }

        // ALTERAÇÃO: Criar novo handler
        const clickHandler = async (e) => {
            const button = e.target.closest('[data-action="reconcile"]');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();

            const movementId = parseInt(button.dataset.movementId);
            const isReconciled = button.dataset.reconciled === 'true';

            if (!movementId) return;

            // ALTERAÇÃO: Desabilitar botão durante processamento
            button.disabled = true;
            const originalText = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';

            try {
                await this.markAsReconciled(movementId, !isReconciled);
            } catch (error) {
                // ALTERAÇÃO: Erro já é tratado em markAsReconciled
            } finally {
                // ALTERAÇÃO: Reabilitar botão
                button.disabled = false;
                button.innerHTML = originalText;
            }
        };

        // ALTERAÇÃO: Armazenar referência ao handler para cleanup
        listContainer._reconciliationClickHandler = clickHandler;
        listContainer.addEventListener('click', clickHandler);
    }
}

