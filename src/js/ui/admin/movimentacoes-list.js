/**
 * Lista de Movimentações Financeiras
 * Gerencia exibição, filtros e paginação
 */

import { getFinancialMovements, updatePaymentStatus } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { debounce } from '../../utils/performance-utils.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';

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
        this.totalItems = 0;
        this.totalPages = 1;
        this.isInitialized = false;
        this.isLoading = false;
    }

    /**
     * Inicializa a lista de movimentações
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
        await this.loadCategories(); // ALTERAÇÃO: Carregar categorias antes de carregar movimentações
        await this.loadMovements();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML da lista
     */
    render() {
        this.container.innerHTML = `
            <div class="movements-list-container">
                <!-- Filtros -->
                <div class="financial-filters">
                    <div class="financial-filters-grid">
                        <div class="financial-filter-group">
                            <label for="filter-start-date">Data Início</label>
                            <input type="date" id="filter-start-date" class="filter-input" aria-label="Data de início do filtro">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-end-date">Data Fim</label>
                            <input type="date" id="filter-end-date" class="filter-input" aria-label="Data de fim do filtro">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-type">Tipo</label>
                            <select id="filter-type" class="filter-select" aria-label="Filtrar por tipo">
                                <option value="">Todos</option>
                                <option value="REVENUE">Receita</option>
                                <option value="EXPENSE">Despesa</option>
                                <option value="CMV">CMV</option>
                                <option value="TAX">Imposto</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-payment-status">Status</label>
                            <select id="filter-payment-status" class="filter-select" aria-label="Filtrar por status de pagamento">
                                <option value="">Todos</option>
                                <option value="Pending">Pendente</option>
                                <option value="Paid">Pago</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-category">Categoria</label>
                            <select id="filter-category" class="filter-select" aria-label="Filtrar por categoria">
                                <option value="">Todas</option>
                                <!-- Categorias serão carregadas dinamicamente -->
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>&nbsp;</label>
                            <button class="financial-btn financial-btn-primary" id="btn-apply-filters" aria-label="Aplicar filtros">
                                <i class="fa-solid fa-filter" aria-hidden="true"></i>
                                <span>Filtrar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tabela -->
                <div class="financial-movements-table-container">
                    <table class="financial-movements-table" role="table" aria-label="Tabela de movimentações financeiras">
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
                <div class="pagination" id="pagination-container">
                    <!-- Será preenchido dinamicamente -->
                </div>
            </div>
        `;
    }

    /**
     * ALTERAÇÃO: Carrega categorias únicas das movimentações
     * Otimizado para limitar busca e evitar sobrecarga na API
     */
    async loadCategories() {
        try {
            // ALTERAÇÃO: Limitar busca a 100 itens para obter categorias (suficiente para categorias únicas)
            // Reduz carga na API quando há muitos registros
            const response = await getFinancialMovements({
                page: 1,
                page_size: 100
            });
            
            // Extrair categorias únicas
            let movements = [];
            if (Array.isArray(response)) {
                movements = response;
            } else if (response && response.items) {
                movements = response.items || [];
            }
            
            // Obter categorias únicas e ordenadas
            const categories = [...new Set(movements
                .map(m => m.category)
                .filter(cat => cat && cat.trim() !== '')
            )].sort();
            
            // Popular o select de categorias
            const categorySelect = document.getElementById('filter-category');
            if (categorySelect) {
                // Manter a opção "Todas"
                const currentValue = categorySelect.value;
                categorySelect.innerHTML = '<option value="">Todas</option>';
                
                // Adicionar categorias
                categories.forEach(category => {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                });
                
                // Restaurar valor selecionado se ainda existir
                if (currentValue) {
                    categorySelect.value = currentValue;
                }
            }
            
            // Se não encontrou categorias, usar categorias padrão como fallback
            if (categories.length === 0) {
                this.loadDefaultCategories();
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - usar categorias padrão em caso de erro
            this.loadDefaultCategories();
        }
    }

    /**
     * Carrega categorias padrão (fallback)
     */
    loadDefaultCategories() {
        const categorySelect = document.getElementById('filter-category');
        if (!categorySelect) return;
        
        const defaultCategories = [
            'Vendas',
            'Custos Variáveis',
            'Custos Fixos',
            'Tributos',
            'Compras de Estoque'
        ];
        
        categorySelect.innerHTML = '<option value="">Todas</option>';
        defaultCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categorySelect.appendChild(option);
        });
    }

    /**
     * Carrega movimentações da API
     */
    async loadMovements() {
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
            const response = await getFinancialMovements(filtersWithPagination);
            
            // Tratar resposta como array ou objeto com paginação
            if (Array.isArray(response)) {
                this.movements = response;
                this.totalItems = response.length;
                this.totalPages = Math.ceil(this.totalItems / this.pageSize);
            } else if (response && response.items) {
                // Resposta paginada
                this.movements = response.items || [];
                this.totalItems = response.total || response.items.length;
                this.totalPages = response.total_pages || Math.ceil(this.totalItems / this.pageSize);
            } else {
                this.movements = [];
                this.totalItems = 0;
                this.totalPages = 1;
            }

            this.renderTable();
            this.renderPagination();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar movimentações', { 
                type: 'error',
                title: 'Erro'
            });
            this.movements = [];
            this.totalItems = 0;
            this.totalPages = 1;
            this.renderTable();
            this.renderPagination(); // ALTERAÇÃO: Garantir que paginação seja renderizada mesmo em caso de erro
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renderiza a tabela de movimentações
     */
    renderTable() {
        const tbody = document.getElementById('movements-table-body');
        
        if (!tbody) return;

        if (this.movements.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 2rem;">
                        <i class="fa-solid fa-inbox" style="font-size: 32px; margin-bottom: 8px; opacity: 0.3;" aria-hidden="true"></i>
                        <p>Nenhuma movimentação encontrada</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.movements.map(movement => {
            const movementId = movement.id || movement.movement_id;
            const movementDate = movement.movement_date || movement.date || movement.created_at;
            const type = (movement.type || '').toLowerCase();
            const paymentStatus = (movement.payment_status || 'Pending').toLowerCase();
            const value = parseFloat(movement.value || movement.amount || 0);
            const description = escapeHTML(movement.description || '');
            const category = escapeHTML(movement.category || '');
            const subcategory = movement.subcategory ? escapeHTML(movement.subcategory) : '';
            const typeLabel = this.translateType(movement.type || '');
            const statusLabel = this.translateStatus(movement.payment_status || 'Pending');
            const valueColor = movement.type === 'REVENUE' ? 'var(--revenue-color)' : 'var(--expense-color)';
            const valueSign = movement.type === 'REVENUE' ? '+' : '-';

            return `
                <tr data-movement-id="${movementId}">
                    <td>${this.formatDate(movementDate)}</td>
                    <td>
                        <span class="financial-badge type-${type}">
                            ${escapeHTML(typeLabel)}
                        </span>
                    </td>
                    <td>${description || '-'}</td>
                    <td>
                        ${category ? `<div>${category}</div>` : '-'}
                        ${subcategory ? `<div style="font-size: 0.75rem; color: #6b7280;">${subcategory}</div>` : ''}
                    </td>
                    <td style="font-weight: 600; color: ${valueColor};">
                        ${valueSign} R$ ${this.formatCurrency(value)}
                    </td>
                    <td>
                        <span class="financial-badge status-${paymentStatus}">
                            ${escapeHTML(statusLabel)}
                        </span>
                    </td>
                    <td>
                        <div class="financial-action-buttons">
                            ${movement.payment_status === 'Pending' || paymentStatus === 'pending' ? `
                                <button class="financial-btn financial-btn-success financial-btn-icon" 
                                        data-action="mark-paid" 
                                        data-movement-id="${movementId}"
                                        title="Marcar como Pago"
                                        aria-label="Marcar movimentação ${movementId} como paga">
                                    <i class="fa-solid fa-check" aria-hidden="true"></i>
                                </button>
                            ` : ''}
                            <button class="financial-btn financial-btn-secondary financial-btn-icon" 
                                    data-action="edit" 
                                    data-movement-id="${movementId}"
                                    title="Editar"
                                    aria-label="Editar movimentação ${movementId}">
                                <i class="fa-solid fa-edit" aria-hidden="true"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Renderiza controles de paginação
     */
    renderPagination() {
        const container = document.getElementById('pagination-container');
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
                        Mostrando <strong>${startItem}-${endItem}</strong> de <strong>${this.totalItems}</strong> movimentações
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
     * Marca movimentação como paga
     * @param {number} movementId - ID da movimentação
     */
    async markAsPaid(movementId) {
        try {
            const currentDate = formatDateForAPI(new Date());
            await updatePaymentStatus(movementId, 'Paid', currentDate);
            showToast('Movimentação marcada como paga', { 
                type: 'success',
                title: 'Sucesso'
            });
            await this.loadMovements();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao atualizar status', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Edita movimentação
     * @param {number} movementId - ID da movimentação
     */
    async editMovement(movementId) {
        // Obter instância do formulário do painel administrativo
        // Tentar várias formas de acessar o adminPanelManager
        let adminPanel = window.adminPanelManager;
        if (!adminPanel && window.adminPanel) {
            adminPanel = window.adminPanel;
        }
        
        if (adminPanel && adminPanel.managers && adminPanel.managers.movimentacaoForm) {
            await adminPanel.managers.movimentacaoForm.openEdit(movementId, () => {
                // Recarregar lista após edição
                this.loadMovements();
            });
        } else {
            // Se não encontrar, tentar criar o formulário diretamente
            const MovimentacaoForm = (await import('./movimentacao-form.js')).MovimentacaoForm;
            let modal = document.getElementById('modal-movimentacao');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modal-movimentacao';
                modal.className = 'modal';
                // ALTERAÇÃO: Adicionar atributo para resetar campos ao fechar usando sistema de modais
                modal.setAttribute('data-reset-on-close', 'true');
                modal.style.display = 'none';
                document.body.appendChild(modal);
            }
            const form = new MovimentacaoForm('modal-movimentacao');
            await form.init();
            await form.openEdit(movementId, () => {
                this.loadMovements();
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
        const startDateInput = document.getElementById('filter-start-date');
        const endDateInput = document.getElementById('filter-end-date');
        const categorySelect = document.getElementById('filter-category'); // ALTERAÇÃO: Agora é select

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

        // ALTERAÇÃO: Select de categoria com evento change (não precisa debounce)
        if (categorySelect) {
            categorySelect.addEventListener('change', () => {
                this.applyFilters();
            });
        }

        // Botão de aplicar filtros
        const applyFiltersBtn = document.getElementById('btn-apply-filters');
        if (applyFiltersBtn) {
            applyFiltersBtn.addEventListener('click', () => {
                this.applyFilters();
            });
        }

        // Event delegation para ações da tabela
        const tableBody = document.getElementById('movements-table-body');
        if (tableBody) {
            tableBody.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;

                const action = button.dataset.action;
                const movementId = parseInt(button.dataset.movementId);

                if (action === 'mark-paid') {
                    e.preventDefault();
                    this.markAsPaid(movementId);
                } else if (action === 'edit') {
                    e.preventDefault();
                    this.editMovement(movementId);
                }
            });
        }

        // ALTERAÇÃO: Event delegation para paginação usando padrão das outras seções
        const paginationContainer = document.getElementById('pagination-container');
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
                
                this.loadMovements();
            });
        }
    }

    /**
     * Aplica filtros
     */
    applyFilters() {
        const startDateInput = document.getElementById('filter-start-date')?.value;
        const endDateInput = document.getElementById('filter-end-date')?.value;
        const type = document.getElementById('filter-type')?.value;
        const paymentStatus = document.getElementById('filter-payment-status')?.value;
        const category = document.getElementById('filter-category')?.value;

        // Converter datas do formato HTML5 (AAAA-MM-DD) para formato da API (DD-MM-AAAA)
        const startDate = startDateInput ? formatDateForAPI(startDateInput) : null;
        const endDate = endDateInput ? formatDateForAPI(endDateInput) : null;

        this.filters = {
            start_date: startDate,
            end_date: endDate,
            type: type || null,
            payment_status: paymentStatus || null,
            category: category || null
        };

        this.currentPage = 1; // Resetar para primeira página ao aplicar filtros
        this.loadMovements();
    }

    /**
     * Formata data
     * @param {string} dateString - Data a formatar
     * @returns {string} Data formatada
     */
    formatDate(dateString) {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch (error) {
            return dateString;
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
        }).format(Math.abs(value || 0));
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
     * Traduz status de pagamento
     * @param {string} status - Status em inglês
     * @returns {string} Status em português
     */
    translateStatus(status) {
        const translations = {
            'Pending': 'Pendente',
            'Paid': 'Pago',
            'Reconciled': 'Reconciliada'
        };
        return translations[status] || status;
    }
}

