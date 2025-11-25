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
        // ALTERAÇÃO: Adicionar propriedades de paginação
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalItems = 0;
        this.totalPages = 1;
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

                <!-- ALTERAÇÃO: Paginação -->
                <div class="pagination" id="contas-pagar-pagination-container">
                    <!-- Será preenchido dinamicamente -->
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
            // ALTERAÇÃO: Incluir parâmetros de paginação nos filtros
            const filtersWithPagination = {
                ...this.filters,
                page: this.currentPage,
                page_size: this.pageSize
            };
            const response = await getPendingPayments(filtersWithPagination);
            
            // Tratar resposta como array ou objeto com items
            if (Array.isArray(response)) {
                this.pendingPayments = response;
                this.totalItems = response.length;
                this.totalPages = Math.ceil(this.totalItems / this.pageSize);
            } else if (response && response.items) {
                // Resposta paginada
                this.pendingPayments = response.items || [];
                this.totalItems = response.total || response.items.length;
                this.totalPages = response.total_pages || Math.ceil(this.totalItems / this.pageSize);
            } else {
                this.pendingPayments = [];
                this.totalItems = 0;
                this.totalPages = 1;
            }

            this.renderPendingPayments();
            this.updateTotalCount();
            this.renderPagination();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar contas a pagar', { 
                type: 'error',
                title: 'Erro'
            });
            this.pendingPayments = [];
            this.totalItems = 0;
            this.totalPages = 1;
            this.renderPendingPayments();
            this.renderPagination(); // ALTERAÇÃO: Garantir que paginação seja renderizada mesmo em caso de erro
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
            totalElement.textContent = this.totalItems;
        }
    }

    /**
     * ALTERAÇÃO: Renderiza controles de paginação
     */
    renderPagination() {
        const container = document.getElementById('contas-pagar-pagination-container');
        if (!container) return;

        // ALTERAÇÃO: Sempre renderizar paginação se houver itens, mesmo que seja apenas 1 página
        if (this.totalItems === 0) {
            container.innerHTML = '';
            return;
        }

        const startItem = (this.currentPage - 1) * this.pageSize + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, this.totalItems);

        container.innerHTML = `
            <div class="pagination-wrapper">
                <div class="pagination-info">
                    <span class="pagination-text">
                        Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${this.totalItems}</strong> contas pendentes
                    </span>
                    ${this.totalPages > 1 ? `<span class="pagination-page-info">Página ${this.currentPage} de ${this.totalPages}</span>` : ''}
                </div>
                ${this.totalPages > 1 ? `
                <div class="pagination-controls">
                    <button class="pagination-btn pagination-btn-nav" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev" title="Página anterior">
                        <i class="fa-solid fa-chevron-left"></i>
                        <span>Anterior</span>
                    </button>
                    <div class="pagination-pages">
                        ${this.generatePageNumbers()}
                    </div>
                    <button class="pagination-btn pagination-btn-nav" ${this.currentPage === this.totalPages ? 'disabled' : ''} data-page="next" title="Próxima página">
                        <span>Próxima</span>
                        <i class="fa-solid fa-chevron-right"></i>
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }

    /**
     * ALTERAÇÃO: Gera números de paginação usando padrão das outras seções
     * @returns {string} HTML dos números de paginação
     */
    generatePageNumbers() {
        const pages = [];
        const maxVisible = 7; // Máximo de números de página visíveis
        
        if (this.totalPages <= maxVisible) {
            // Se houver poucas páginas, mostrar todas
            for (let i = 1; i <= this.totalPages; i++) {
                pages.push(
                    `<button class="page-number ${i === this.currentPage ? 'active' : ''}" data-page="${i}" title="Página ${i}">${i}</button>`
                );
            }
            return pages.join("");
        }

        // Lógica para muitas páginas
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(this.totalPages, this.currentPage + 2);

        // Ajustar início se estiver no final
        if (endPage - startPage < 4) {
            if (this.currentPage <= 3) {
                startPage = 1;
                endPage = Math.min(5, this.totalPages);
            } else if (this.currentPage >= this.totalPages - 2) {
                startPage = Math.max(1, this.totalPages - 4);
                endPage = this.totalPages;
            }
        }

        // Primeira página
        if (startPage > 1) {
            pages.push(`<button class="page-number" data-page="1" title="Primeira página">1</button>`);
            if (startPage > 2) {
                pages.push(`<span class="page-ellipsis" title="Mais páginas">...</span>`);
            }
        }

        // Páginas do meio
        for (let i = startPage; i <= endPage; i++) {
            pages.push(
                `<button class="page-number ${i === this.currentPage ? 'active' : ''}" data-page="${i}" title="Página ${i}">${i}</button>`
            );
        }

        // Última página
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                pages.push(`<span class="page-ellipsis" title="Mais páginas">...</span>`);
            }
            pages.push(`<button class="page-number" data-page="${this.totalPages}" title="Última página">${this.totalPages}</button>`);
        }

        return pages.join("");
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

        // ALTERAÇÃO: Event delegation para paginação usando padrão das outras seções
        const paginationContainer = document.getElementById('contas-pagar-pagination-container');
        if (paginationContainer) {
            paginationContainer.addEventListener('click', (e) => {
                const target = e.target.closest('.pagination-btn, .page-number');
                if (!target) return;
                
                e.preventDefault();
                e.stopPropagation();
                
                if (this.isLoading) {
                    return;
                }
                
                // Verificar se é botão de navegação
                if (target.classList.contains('pagination-btn')) {
                    if (target.disabled) {
                        return;
                    }
                    
                    const action = target.dataset.page;
                    
                    if (action === "prev" && this.currentPage > 1) {
                        this.currentPage = Math.max(1, this.currentPage - 1);
                    } else if (action === "next" && this.currentPage < this.totalPages) {
                        this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
                    } else {
                        return;
                    }
                } 
                // Verificar se é número de página
                else if (target.classList.contains('page-number')) {
                    const page = parseInt(target.dataset.page);
                    
                    if (isNaN(page) || page === this.currentPage || page < 1 || page > this.totalPages) {
                        return;
                    }
                    
                    this.currentPage = page;
                } else {
                    return;
                }
                
                this.loadPendingPayments();
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

        this.currentPage = 1; // ALTERAÇÃO: Resetar para primeira página ao aplicar filtros
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

