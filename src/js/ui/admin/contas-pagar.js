/**
 * Gerenciador de Contas a Pagar
 * Gerencia movimentações financeiras pendentes
 */

import { getPendingPayments, updatePaymentStatus } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { renderFinancialMovementCards } from '../components/financial-card.js';
import { debounce } from '../../utils/performance-utils.js';

export class ContasPagarManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.pendingPayments = [];
        this.filters = {
            type: null
        };
        this.isInitialized = false;
        this.isLoading = false;
    }

    /**
     * Inicializa o gerenciador
     */
    async init() {
        if (!this.container) {
            console.error('Container de contas a pagar não encontrado');
            return;
        }

        // ALTERAÇÃO: Evitar múltiplas inicializações
        if (this.isInitialized) {
            return;
        }

        this.isInitialized = true;
        this.render();
        await this.loadPendingPayments();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="contas-pagar-container">
                <div class="contas-pagar-header">
                    <h3>Contas a Pagar</h3>
                    <div class="contas-pagar-info">
                        <span class="info-badge">
                            <i class="fa-solid fa-clock" aria-hidden="true"></i>
                            <span id="total-pendentes">0</span> pendentes
                        </span>
                    </div>
                </div>

                <!-- Filtros -->
                <div class="financial-filters">
                    <div class="financial-filters-grid">
                        <div class="financial-filter-group">
                            <label for="filter-contas-tipo">Tipo</label>
                            <select id="filter-contas-tipo" class="filter-select" aria-label="Filtrar por tipo">
                                <option value="">Todos</option>
                                <option value="EXPENSE">Despesa</option>
                                <option value="CMV">CMV</option>
                                <option value="TAX">Imposto</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>&nbsp;</label>
                            <button class="financial-btn financial-btn-primary" id="btn-apply-filters-contas" aria-label="Aplicar filtros">
                                <i class="fa-solid fa-filter" aria-hidden="true"></i>
                                <span>Filtrar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Lista de Contas a Pagar -->
                <div class="contas-pagar-list" id="contas-pagar-list">
                    <div class="financial-loading">Carregando...</div>
                </div>
            </div>
        `;
    }

    /**
     * Carrega contas a pagar da API
     */
    async loadPendingPayments() {
        // ALTERAÇÃO: Evitar múltiplas requisições simultâneas
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        try {
            const response = await getPendingPayments(this.filters);
            
            // Tratar resposta como array ou objeto com items
            if (Array.isArray(response)) {
                this.pendingPayments = response;
            } else if (response && response.items) {
                this.pendingPayments = response.items || [];
            } else {
                this.pendingPayments = [];
            }

            this.renderPendingPayments();
            this.updateTotalCount();
        } catch (error) {
            console.error('Erro ao carregar contas a pagar:', error);
            showToast('Erro ao carregar contas a pagar', { 
                type: 'error',
                title: 'Erro'
            });
            this.pendingPayments = [];
            this.renderPendingPayments();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renderiza a lista de contas a pagar
     */
    renderPendingPayments() {
        const listContainer = document.getElementById('contas-pagar-list');
        if (!listContainer) return;

        if (this.pendingPayments.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fa-solid fa-check-circle" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3; color: var(--paid-color);" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhuma conta pendente</p>
                </div>
            `;
            return;
        }

        // Usar componente de card de movimentação
        renderFinancialMovementCards(this.pendingPayments, listContainer, {
            onEdit: (movementId) => {
                // TODO: Implementar edição
                console.log('Editar movimentação:', movementId);
            },
            onDelete: null, // Não permitir exclusão direta
            onViewRelated: (entityType, entityId) => {
                // TODO: Implementar navegação
                console.log('Ver entidade relacionada:', entityType, entityId);
            }
        });
    }

    /**
     * Atualiza contador de pendentes
     */
    updateTotalCount() {
        const totalElement = document.getElementById('total-pendentes');
        if (totalElement) {
            totalElement.textContent = this.pendingPayments.length;
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Debounce para select de tipo (300ms)
        const debouncedApplyFilters = debounce(() => {
            this.applyFilters();
        }, 300);

        // Select de tipo com debounce
        const typeSelect = document.getElementById('filter-contas-tipo');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                debouncedApplyFilters();
            });
        }

        // Botão de aplicar filtros
        const btnApplyFilters = document.getElementById('btn-apply-filters-contas');
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
        const type = document.getElementById('filter-contas-tipo')?.value;

        this.filters = {
            type: type || null
        };

        this.loadPendingPayments();
    }
}

