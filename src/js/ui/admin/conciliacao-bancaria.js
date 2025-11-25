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
        // ALTERAÇÃO: Adicionar propriedades de paginação
        this.currentPage = 1;
        this.pageSize = 50;
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

                <!-- ALTERAÇÃO: Paginação -->
                <div class="pagination" id="conciliacao-pagination-container">
                    <!-- Será preenchido dinamicamente -->
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
            
            // ALTERAÇÃO: Incluir parâmetros de paginação nos filtros
            const filtersWithPagination = {
                ...this.filters,
                page: this.currentPage,
                page_size: this.pageSize
            };
            this.report = await getReconciliationReport(filtersWithPagination);
            
            // ALTERAÇÃO: Atualizar totalPages do relatório
            if (this.report && this.report.total_pages) {
                this.totalPages = this.report.total_pages;
            } else if (this.report && this.report.total_movements) {
                this.totalPages = Math.ceil(this.report.total_movements / this.pageSize);
            }
            
            this.renderSummary();
            this.renderMovements();
            this.renderPagination();
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
            this.totalPages = 1;
            this.renderSummary();
            this.renderMovements();
            this.renderPagination(); // ALTERAÇÃO: Garantir que paginação seja renderizada mesmo em caso de erro
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

        // ALTERAÇÃO: Event delegation para paginação usando padrão das outras seções
        const paginationContainer = document.getElementById('conciliacao-pagination-container');
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
                
                this.loadReport();
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

        this.currentPage = 1; // ALTERAÇÃO: Resetar para primeira página ao aplicar filtros
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
     * ALTERAÇÃO: Renderiza controles de paginação
     */
    renderPagination() {
        const container = document.getElementById('conciliacao-pagination-container');
        if (!container) return;

        // ALTERAÇÃO: Sempre renderizar paginação se houver itens, mesmo que seja apenas 1 página
        if (!this.report || !this.report.total_movements) {
            container.innerHTML = '';
            return;
        }

        const totalItems = this.report.total_movements || 0;
        if (totalItems === 0) {
            container.innerHTML = '';
            return;
        }

        const startItem = (this.currentPage - 1) * this.pageSize + 1;
        const endItem = Math.min(this.currentPage * this.pageSize, totalItems);

        container.innerHTML = `
            <div class="pagination-wrapper">
                <div class="pagination-info">
                    <span class="pagination-text">
                        Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${totalItems}</strong> movimentações
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

