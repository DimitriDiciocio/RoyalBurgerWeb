/**
 * Gerenciador de Contas a Pagar
 * Gerencia movimentações financeiras pendentes
 */

import { getPendingPayments, updatePaymentStatus, getFinancialMovementById } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { renderFinancialMovementCards } from '../components/financial-card.js';
import { debounce } from '../../utils/performance-utils.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';
// ALTERAÇÃO: Importar utilities compartilhadas para reduzir duplicação
import { openRelatedEntityModal, refreshPurchasesIfNeeded } from '../../utils/financial-entity-utils.js';
// ALTERAÇÃO: Importar cliente de eventos em tempo real
import { getRealtimeClient } from '../../utils/realtime-events.js';

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
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
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
        // ALTERAÇÃO: Configurar eventos em tempo real
        this.setupRealtimeEvents();
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
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
            onEdit: async (movementId) => {
                // ALTERAÇÃO: Abrir modal de edição baseada no tipo de entidade relacionada
                const { openEditModalForMovement } = await import('../../utils/financial-entity-utils.js');
                await openEditModalForMovement(movementId);
                // Recarregar após edição
                await this.loadPendingPayments();
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
                    await this.loadPendingPayments();
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
                        await this.loadPendingPayments();
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
                    await this.loadPendingPayments();
                    
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

    /**
     * Configura eventos em tempo real para atualização automática
     * ALTERAÇÃO: Implementado para atualizar contas a pagar quando há mudanças
     */
    setupRealtimeEvents() {
        const client = getRealtimeClient();
        
        // ALTERAÇÃO: Escutar eventos de compras criadas/atualizadas
        client.on('purchase.created', async (data) => {
            await this.loadPendingPayments();
        });

        client.on('purchase.updated', async (data) => {
            // Se status de pagamento mudou, recarregar
            if (data.payment_status) {
                await this.loadPendingPayments();
            }
        });

        // ALTERAÇÃO: Escutar eventos de movimentações financeiras
        client.on('financial_movement.created', async (data) => {
            // Se for despesa pendente, recarregar
            if (data.payment_status === 'Pending' && (data.type === 'EXPENSE' || data.type === 'TAX')) {
                await this.loadPendingPayments();
            }
        });

        client.on('financial_movement.payment_status_updated', async (data) => {
            // Sempre recarregar quando status de pagamento muda
            await this.loadPendingPayments();
        });
    }
}

