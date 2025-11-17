/**
 * Gerenciador de Compras
 * Gerencia notas fiscais de compra e entrada de estoque
 */

import { createPurchaseInvoice, getPurchaseInvoices, getPurchaseInvoiceById } from '../../api/purchases.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { abrirModal, fecharModal } from '../modais.js';
import { debounce } from '../../utils/performance-utils.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';

export class ComprasManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.invoices = [];
        this.filters = {
            start_date: null,
            end_date: null,
            supplier_name: null,
            payment_status: null
        };
        this.isInitialized = false;
        this.isLoading = false;
    }

    /**
     * Inicializa o gerenciador de compras
     */
    async init() {
        if (!this.container) {
            console.error('Container de compras não encontrado');
            return;
        }

        // ALTERAÇÃO: Evitar múltiplas inicializações
        if (this.isInitialized) {
            return;
        }

        this.isInitialized = true;
        this.render();
        await this.loadInvoices();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="compras-container">
                <div class="compras-header">
                    <h3>Notas Fiscais de Compra</h3>
                    <button class="financial-btn financial-btn-primary" id="btn-nova-compra" aria-label="Nova compra">
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                        <span>Nova Compra</span>
                    </button>
                </div>

                <!-- Filtros -->
                <div class="financial-filters">
                    <div class="financial-filters-grid">
                        <div class="financial-filter-group">
                            <label for="filter-compra-start-date">Data Início</label>
                            <input type="date" id="filter-compra-start-date" class="filter-input" aria-label="Data de início">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-compra-end-date">Data Fim</label>
                            <input type="date" id="filter-compra-end-date" class="filter-input" aria-label="Data de fim">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-compra-supplier">Fornecedor</label>
                            <input type="text" id="filter-compra-supplier" class="filter-input" placeholder="Buscar fornecedor" aria-label="Filtrar por fornecedor">
                        </div>
                        <div class="financial-filter-group">
                            <label for="filter-compra-status">Status</label>
                            <select id="filter-compra-status" class="filter-select" aria-label="Filtrar por status">
                                <option value="">Todos</option>
                                <option value="Pending">Pendente</option>
                                <option value="Paid">Pago</option>
                            </select>
                        </div>
                        <div class="financial-filter-group">
                            <label>&nbsp;</label>
                            <button class="financial-btn financial-btn-primary" id="btn-apply-filters-compras" aria-label="Aplicar filtros">
                                <i class="fa-solid fa-filter" aria-hidden="true"></i>
                                <span>Filtrar</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Lista de Compras -->
                <div class="compras-list" id="compras-list">
                    <!-- Será preenchido dinamicamente -->
                </div>
            </div>
        `;
    }

    /**
     * Carrega notas fiscais da API
     */
    async loadInvoices() {
        // ALTERAÇÃO: Evitar múltiplas requisições simultâneas
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        try {
            const response = await getPurchaseInvoices(this.filters);
            
            // Tratar resposta como array ou objeto com items
            if (Array.isArray(response)) {
                this.invoices = response;
            } else if (response && response.items) {
                this.invoices = response.items || [];
            } else {
                this.invoices = [];
            }

            this.renderInvoicesList();
        } catch (error) {
            console.error('Erro ao carregar compras:', error);
            showToast('Erro ao carregar compras', { 
                type: 'error',
                title: 'Erro'
            });
            this.invoices = [];
            this.renderInvoicesList();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Renderiza a lista de notas fiscais
     */
    renderInvoicesList() {
        const listContainer = document.getElementById('compras-list');
        if (!listContainer) return;
        
        if (this.invoices.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fa-solid fa-inbox" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhuma compra registrada</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.invoices.map(invoice => {
            const invoiceId = invoice.id || invoice.invoice_id;
            const invoiceNumber = escapeHTML(invoice.invoice_number || 'N/A');
            const supplierName = escapeHTML(invoice.supplier_name || 'Fornecedor não informado');
            const paymentStatus = (invoice.payment_status || 'Pending').toLowerCase();
            const totalAmount = parseFloat(invoice.total_amount || invoice.total || 0);
            const purchaseDate = invoice.purchase_date || invoice.date || invoice.created_at;
            const paymentMethod = escapeHTML(invoice.payment_method || '-');
            const statusLabel = this.translateStatus(invoice.payment_status || 'Pending');

            return `
                <div class="compra-card" data-invoice-id="${invoiceId}">
                    <div class="compra-card-header">
                        <div>
                            <h4>NF ${invoiceNumber}</h4>
                            <p class="compra-supplier">${supplierName}</p>
                        </div>
                        <span class="financial-badge status-${paymentStatus}">
                            ${escapeHTML(statusLabel)}
                        </span>
                    </div>
                    <div class="compra-card-body">
                        <div class="compra-info">
                            <div class="info-item">
                                <span class="label">Valor Total:</span>
                                <span class="value">R$ ${this.formatCurrency(totalAmount)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Data:</span>
                                <span class="value">${this.formatDate(purchaseDate)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Método de Pagamento:</span>
                                <span class="value">${paymentMethod}</span>
                            </div>
                        </div>
                    </div>
                    <div class="compra-card-footer">
                        <button class="financial-btn financial-btn-secondary" 
                                data-action="view" 
                                data-invoice-id="${invoiceId}"
                                aria-label="Ver detalhes da nota fiscal ${invoiceNumber}">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i>
                            <span>Ver Detalhes</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
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
        const startDateInput = document.getElementById('filter-compra-start-date');
        const endDateInput = document.getElementById('filter-compra-end-date');
        const supplierInput = document.getElementById('filter-compra-supplier');

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

        // Input de fornecedor com debounce (300ms para busca)
        if (supplierInput) {
            supplierInput.addEventListener('input', debounce(() => {
                debouncedApplyFilters();
            }, 300));
        }

        // Botão de nova compra
        const btnNovaCompra = document.getElementById('btn-nova-compra');
        if (btnNovaCompra) {
            btnNovaCompra.addEventListener('click', () => {
                this.openNewPurchaseModal();
            });
        }

        // Botão de aplicar filtros
        const btnApplyFilters = document.getElementById('btn-apply-filters-compras');
        if (btnApplyFilters) {
            btnApplyFilters.addEventListener('click', () => {
                this.applyFilters();
            });
        }

        // Event delegation para ações dos cards
        const listContainer = document.getElementById('compras-list');
        if (listContainer) {
            listContainer.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;

                const action = button.dataset.action;
                const invoiceId = parseInt(button.dataset.invoiceId);

                if (action === 'view' && invoiceId) {
                    e.preventDefault();
                    this.viewInvoice(invoiceId);
                }
            });
        }
    }

    /**
     * Aplica filtros
     */
    applyFilters() {
        const startDateInput = document.getElementById('filter-compra-start-date')?.value;
        const endDateInput = document.getElementById('filter-compra-end-date')?.value;
        const supplier = document.getElementById('filter-compra-supplier')?.value;
        const status = document.getElementById('filter-compra-status')?.value;

        // Converter datas do formato HTML5 (AAAA-MM-DD) para formato da API (DD-MM-AAAA)
        const startDate = startDateInput ? formatDateForAPI(startDateInput) : null;
        const endDate = endDateInput ? formatDateForAPI(endDateInput) : null;

        this.filters = {
            start_date: startDate,
            end_date: endDate,
            supplier_name: supplier || null,
            payment_status: status || null
        };

        this.loadInvoices();
    }

    /**
     * Abre modal de nova compra
     */
    openNewPurchaseModal() {
        // TODO: Implementar modal de nova compra
        showToast('Funcionalidade em desenvolvimento', { 
            type: 'info',
            title: 'Em desenvolvimento'
        });
    }

    /**
     * Visualiza detalhes da nota fiscal
     * @param {number} invoiceId - ID da nota fiscal
     */
    async viewInvoice(invoiceId) {
        try {
            const invoice = await getPurchaseInvoiceById(invoiceId);
            this.showInvoiceModal(invoice);
        } catch (error) {
            console.error('Erro ao carregar nota fiscal:', error);
            showToast('Erro ao carregar nota fiscal', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Exibe modal com detalhes da nota fiscal
     * @param {Object} invoice - Dados da nota fiscal
     */
    showInvoiceModal(invoice) {
        // Criar ou obter modal
        let modal = document.getElementById('modal-compra-detalhes');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-compra-detalhes';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const invoiceNumber = escapeHTML(invoice.invoice_number || 'N/A');
        const supplierName = escapeHTML(invoice.supplier_name || 'Fornecedor não informado');
        const totalAmount = parseFloat(invoice.total_amount || invoice.total || 0);
        const purchaseDate = invoice.purchase_date || invoice.date || invoice.created_at;
        const paymentMethod = escapeHTML(invoice.payment_method || '-');
        const paymentStatus = (invoice.payment_status || 'Pending').toLowerCase();
        const statusLabel = this.translateStatus(invoice.payment_status || 'Pending');
        const items = invoice.items || [];

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 700px;">
                <div class="header-modal">
                    <h2>Detalhes da Nota Fiscal ${invoiceNumber}</h2>
                    <i class="fa-solid fa-xmark fechar-modal" onclick="document.getElementById('modal-compra-detalhes').style.display='none'" aria-label="Fechar modal"></i>
                </div>
                <div class="conteudo-modal">
                    <div class="invoice-details">
                        <div class="invoice-detail-section">
                            <h3>Informações Gerais</h3>
                            <div class="invoice-detail-grid">
                                <div class="invoice-detail-item">
                                    <span class="label">Fornecedor:</span>
                                    <span class="value">${supplierName}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Data de Compra:</span>
                                    <span class="value">${this.formatDate(purchaseDate)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Valor Total:</span>
                                    <span class="value" style="font-weight: 700; font-size: 1.125rem;">R$ ${this.formatCurrency(totalAmount)}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Método de Pagamento:</span>
                                    <span class="value">${paymentMethod}</span>
                                </div>
                                <div class="invoice-detail-item">
                                    <span class="label">Status:</span>
                                    <span class="financial-badge status-${paymentStatus}">${escapeHTML(statusLabel)}</span>
                                </div>
                            </div>
                        </div>

                        ${items.length > 0 ? `
                        <div class="invoice-detail-section">
                            <h3>Itens da Nota Fiscal</h3>
                            <div class="invoice-items-list">
                                <table class="invoice-items-table">
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Quantidade</th>
                                            <th>Valor Unitário</th>
                                            <th>Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${items.map(item => `
                                            <tr>
                                                <td>${escapeHTML(item.name || item.product_name || 'Item')}</td>
                                                <td>${item.quantity || 1}</td>
                                                <td>R$ ${this.formatCurrency(item.unit_price || item.price || 0)}</td>
                                                <td>R$ ${this.formatCurrency((item.unit_price || item.price || 0) * (item.quantity || 1))}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" onclick="document.getElementById('modal-compra-detalhes').style.display='none'">Fechar</button>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        // Fechar ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
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
     * Traduz status de pagamento
     * @param {string} status - Status em inglês
     * @returns {string} Status em português
     */
    translateStatus(status) {
        const translations = {
            'Pending': 'Pendente',
            'Paid': 'Pago'
        };
        return translations[status] || status;
    }
}

