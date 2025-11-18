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

        const total = this.report.total || 0;
        const reconciled = this.report.reconciled || 0;
        const pending = total - reconciled;
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

        // TODO: Implementar renderização completa com opção de marcar como reconciliada
        listContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #6b7280;">
                <p>Lista de movimentações para conciliação será implementada em breve.</p>
            </div>
        `;
    }

    /**
     * Marca movimentação como reconciliada
     * @param {number} movementId - ID da movimentação
     */
    async markAsReconciled(movementId) {
        try {
            await reconcileMovement(movementId, true);
            showToast('Movimentação marcada como reconciliada', { 
                type: 'success',
                title: 'Sucesso'
            });
            await this.loadReport();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao reconciliar movimentação', { 
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
}

