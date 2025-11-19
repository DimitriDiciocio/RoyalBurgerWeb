/**
 * Gerenciador de Compras
 * Gerencia notas fiscais de compra e entrada de estoque
 */

import { getPurchaseInvoices, getPurchaseInvoiceById, updatePurchaseInvoice, deletePurchaseInvoice } from '../../api/purchases.js';
import { getIngredients, getIngredientById } from '../../api/ingredients.js';
import { showToast, showConfirm } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { abrirModal, fecharModal } from '../modais.js';
import { debounce } from '../../utils/performance-utils.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';
import { CompraForm } from './compra-form.js';
import { gerenciarInputsEspecificos } from '../../utils.js';
import { cacheManager } from '../../utils/cache-manager.js';
// ALTERAÇÃO: Importar utility compartilhada para modal de compra
import { showPurchaseInvoiceModal } from '../../utils/purchase-modal-utils.js';
// ALTERAÇÃO: Importar cliente de eventos em tempo real
import { getRealtimeClient } from '../../utils/realtime-events.js';

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
        this.compraForm = null;
        // ALTERAÇÃO: Propriedades para edição de itens
        this.editItems = [];
        this.editIngredients = [];
        this.currentEditInvoiceId = null;
    }

    /**
     * Inicializa o gerenciador de compras
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
        await this.loadInvoices();
        this.setupEventListeners();
        await this.initCompraForm();
        // ALTERAÇÃO: Configurar eventos em tempo real
        this.setupRealtimeEvents();
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
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
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
            // ALTERAÇÃO: Formatar método de pagamento para exibição
            const paymentMethod = this.formatPaymentMethod(invoice.payment_method || '-');
            const statusLabel = this.translateStatus(invoice.payment_status || 'Pending');

            // ALTERAÇÃO: Novo design do card com botão de pagamento
            const isPaid = paymentStatus === 'paid';
            const paymentStatusAttr = invoice.payment_status || 'Pending';

            // ALTERAÇÃO: Card com botão de editar no header e apenas dois botões no footer
            return `
                <div class="compra-card" data-invoice-id="${invoiceId}" data-payment-status="${paymentStatusAttr}">
                    <div class="compra-card-header">
                        <div class="compra-header-info">
                            <h4>
                                <i class="fa-solid fa-receipt" aria-hidden="true"></i>
                                NF ${invoiceNumber}
                            </h4>
                            <p class="compra-supplier">
                                <i class="fa-solid fa-truck" aria-hidden="true"></i>
                                ${supplierName}
                            </p>
                        </div>
                        <div class="compra-header-actions">
                            <button class="btn-editar-compra" 
                                    data-action="edit" 
                                    data-invoice-id="${invoiceId}"
                                    aria-label="Editar nota fiscal ${invoiceNumber}"
                                    title="Editar">
                                <i class="fa-solid fa-edit" aria-hidden="true"></i>
                            </button>
                            <button class="btn-excluir-compra" 
                                    data-action="delete" 
                                    data-invoice-id="${invoiceId}"
                                    aria-label="Excluir nota fiscal ${invoiceNumber}"
                                    title="Excluir">
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                            </button>
                            <span class="financial-badge status-${paymentStatus}">
                                ${escapeHTML(statusLabel)}
                            </span>
                        </div>
                    </div>
                    <div class="compra-card-body">
                        <div class="compra-info">
                            <div class="info-item total">
                                <span class="label">
                                    <i class="fa-solid fa-dollar-sign" aria-hidden="true"></i>
                                    Valor Total:
                                </span>
                                <span class="value">R$ ${this.formatCurrency(totalAmount)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">
                                    <i class="fa-solid fa-calendar" aria-hidden="true"></i>
                                    Data:
                                </span>
                                <span class="value">${this.formatDate(purchaseDate)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">
                                    <i class="fa-solid fa-credit-card" aria-hidden="true"></i>
                                    Método de Pagamento:
                                </span>
                                <span class="value">${escapeHTML(paymentMethod)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="compra-card-footer">
                        ${!isPaid ? `
                        <button class="financial-btn financial-btn-pay" 
                                data-action="mark-paid" 
                                data-invoice-id="${invoiceId}"
                                aria-label="Marcar nota fiscal ${invoiceNumber} como paga">
                            <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
                            <span>Marcar como Pago</span>
                        </button>
                        ` : ''}
                        <button class="financial-btn financial-btn-secondary" 
                                data-action="view" 
                                data-invoice-id="${invoiceId}"
                                aria-label="Ver mais detalhes da nota fiscal ${invoiceNumber}">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i>
                            <span>Ver mais</span>
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

                if (action === 'mark-paid' && invoiceId) {
                    e.preventDefault();
                    this.markAsPaid(invoiceId);
                } else if (action === 'view' && invoiceId) {
                    e.preventDefault();
                    this.viewInvoice(invoiceId);
                } else if (action === 'edit' && invoiceId) {
                    e.preventDefault();
                    this.editInvoice(invoiceId);
                } else if (action === 'delete' && invoiceId) {
                    e.preventDefault();
                    this.confirmDeleteInvoice(invoiceId);
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
     * Inicializa o formulário de compra
     */
    async initCompraForm() {
        if (!this.compraForm) {
            this.compraForm = new CompraForm('modal-nova-compra');
            await this.compraForm.init();
        }
    }

    /**
     * Abre modal de nova compra
     */
    openNewPurchaseModal() {
        if (!this.compraForm) {
            showToast('Formulário ainda não inicializado', {
                type: 'error',
                title: 'Erro'
            });
            return;
        }

        this.compraForm.openNew(() => {
            // Callback após salvar com sucesso
            this.loadInvoices();
        });
    }

    /**
     * Visualiza detalhes da nota fiscal
     * ALTERAÇÃO: Aguardar carregamento assíncrono da modal
     * @param {number} invoiceId - ID da nota fiscal
     */
    async viewInvoice(invoiceId) {
        try {
            const invoice = await getPurchaseInvoiceById(invoiceId);
            await this.showInvoiceModal(invoice);
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar nota fiscal', {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Exibe modal com detalhes da nota fiscal
     * ALTERAÇÃO: Usar utility compartilhada
     * @param {Object} invoice - Dados da nota fiscal
     */
    async showInvoiceModal(invoice) {
        // ALTERAÇÃO: Delegar para utility compartilhada
        return showPurchaseInvoiceModal(invoice);
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
     * ALTERAÇÃO: Formata valor monetário sem limitar casas decimais (exibe valor exato)
     * @param {number} value - Valor a formatar
     * @returns {string} Valor formatado em reais (pt-BR) sem arredondamento
     */
    formatCurrencyExact(value) {
        if (value === null || value === undefined || isNaN(value)) return '0,00';
        
        // ALTERAÇÃO: Usar toFixed com número alto de casas decimais para preservar precisão
        // Depois remover zeros à direita desnecessários, mas preservar pelo menos 2 casas
        const valueStr = value.toFixed(20); // Usar 20 casas para capturar toda a precisão
        const numValue = parseFloat(valueStr);
        
        // ALTERAÇÃO: Se não tem parte decimal significativa, formatar com 2 casas mínimas
        if (numValue % 1 === 0) {
            return new Intl.NumberFormat('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(numValue);
        }
        
        // ALTERAÇÃO: Remover zeros à direita, mas manter pelo menos 2 casas decimais
        let decimalStr = valueStr.split('.')[1] || '';
        // Remover zeros à direita
        decimalStr = decimalStr.replace(/0+$/, '');
        // Garantir pelo menos 2 casas decimais
        if (decimalStr.length < 2) {
            decimalStr = decimalStr.padEnd(2, '0');
        }
        
        // ALTERAÇÃO: Formatar parte inteira com separadores brasileiros
        const integerPart = Math.floor(Math.abs(numValue));
        const formattedInteger = new Intl.NumberFormat('pt-BR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(integerPart);
        
        // ALTERAÇÃO: Retornar com parte decimal preservada (sem arredondamento)
        return `${formattedInteger},${decimalStr}`;
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
     * ALTERAÇÃO: Formata método de pagamento para exibição
     * @param {string} method - Método de pagamento
     * @returns {string} Método formatado em português
     */
    formatPaymentMethod(method) {
        if (!method || method === '-') return '-';
        const m = String(method).toLowerCase();
        if (m === 'credit' || m.includes('credito')) return 'Cartão de Crédito';
        if (m === 'debit' || m.includes('debito')) return 'Cartão de Débito';
        if (m === 'pix') return 'PIX';
        if (m === 'money' || m.includes('dinheiro') || m.includes('cash')) return 'Dinheiro';
        if (m === 'bank_transfer' || m.includes('transfer')) return 'Transferência Bancária';
        // Fallback para valores antigos
        if (m.includes('credit card')) return 'Cartão de Crédito';
        if (m.includes('debit card')) return 'Cartão de Débito';
        return method; // Retornar o valor original se não reconhecer
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

    /**
     * Edita uma nota fiscal
     * ALTERAÇÃO: Modal de edição básica (status, método pagamento, notas)
     * @param {number} invoiceId - ID da nota fiscal
     */
    async editInvoice(invoiceId) {
        try {
            const invoice = await getPurchaseInvoiceById(invoiceId);
            if (!invoice) {
                showToast('Nota fiscal não encontrada', {
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }

            // ALTERAÇÃO: Criar modal de edição
            this.showEditInvoiceModal(invoice);
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar nota fiscal', {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Exibe modal de edição de nota fiscal
     * ALTERAÇÃO: Incluída funcionalidade de edição de itens
     * @param {Object} invoice - Dados da nota fiscal
     */
    async showEditInvoiceModal(invoice) {
        // ALTERAÇÃO: Criar ou obter modal seguindo padrão do sistema
        let modal = document.getElementById('modal-compra-editar');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-compra-editar';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Carregar ingredientes filtrados por fornecedor e inicializar itens
        const supplierName = invoice.supplier_name || invoice.supplier || null;
        await this.loadEditIngredients(supplierName);
        this.currentEditInvoiceId = invoice.id;

        // ALTERAÇÃO: Converter itens da nota fiscal para formato de edição, carregando dados completos do ingrediente
        this.editItems = await Promise.all((invoice.items || []).map(async (item, index) => {
            const ingredientId = item.ingredient_id || item.ingredient?.id;
            let ingredientData = item.ingredient || { name: item.ingredient_name || item.name || 'Item' };

            // ALTERAÇÃO: Sempre carregar dados completos do ingrediente para garantir stock_unit correto
            if (ingredientId) {
                try {
                    const cacheKey = `ingredient:${ingredientId}`;
                    let fullIngredient = cacheManager.get(cacheKey);
                    
                    if (!fullIngredient) {
                        fullIngredient = await getIngredientById(ingredientId);
                        cacheManager.set(cacheKey, fullIngredient, 10 * 60 * 1000);
                    }

                    if (fullIngredient) {
                        ingredientData = {
                            id: fullIngredient.id,
                            name: fullIngredient.name || ingredientData.name || item.ingredient_name || item.name || 'Item',
                            stock_unit: fullIngredient.stock_unit || ingredientData.stock_unit || 'un',
                            supplier: fullIngredient.supplier || ingredientData.supplier
                        };
                    } else {
                        // Se não conseguir carregar, garantir que stock_unit existe
                        if (!ingredientData.stock_unit) {
                            ingredientData.stock_unit = 'un';
                        }
                    }
                } catch (error) {
                    // Se não conseguir carregar, garantir que stock_unit existe
                    if (!ingredientData.stock_unit) {
                        ingredientData.stock_unit = 'un';
                    }
                    // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
                }
            } else {
                // Se não tiver ingredientId, garantir que stock_unit existe
                if (!ingredientData.stock_unit) {
                    ingredientData.stock_unit = 'un';
                }
            }

            // ALTERAÇÃO: Usar total_price que vem da API diretamente (preserva valor exato)
            // Não recalcular multiplicando unit_price * quantity pois estão em unidades diferentes
            // unit_price está na unidade de exibição (39.9 por kg) e quantity está na base (2000g)
            const totalPrice = item.total_price || 0;
            
            return {
                id: `edit-item-${Date.now()}-${index}`,
                ingredient_id: ingredientId,
                ingredient_data: ingredientData,
                quantity: item.quantity || 0,
                total_price: totalPrice,
                unit_price: item.unit_price || item.price || 0,
                // ALTERAÇÃO: Armazenar display_quantity e stock_unit para uso posterior
                display_quantity: this.getEditableQuantity(item.quantity || 0, ingredientData.stock_unit || 'un'),
                stock_unit: ingredientData.stock_unit || 'un'
            };
        }));

        const invoiceNumber = escapeHTML(invoice.invoice_number || 'N/A');
        const currentStatus = invoice.payment_status || 'Pending';
        const currentMethod = invoice.payment_method || '';
        const currentNotes = invoice.notes || '';

        // ALTERAÇÃO: Estrutura HTML seguindo padrão do sistema com seção de itens
        modal.innerHTML = `
            <div class="div-overlay" data-close-modal="modal-compra-editar"></div>
            <div class="modal-content-compra-editar">
                <div class="header-modal">
                    <h2>Editar Nota Fiscal ${invoiceNumber}</h2>
                    <i class="fa-solid fa-xmark fechar-modal" data-close-modal="modal-compra-editar" aria-label="Fechar modal"></i>
                </div>
                <div class="conteudo-modal">
                    <form id="form-editar-compra">
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="edit-compra-payment-status" required>
                                    <option value="Pending" ${currentStatus === 'Pending' ? 'selected' : ''}>Pendente</option>
                                    <option value="Paid" ${currentStatus === 'Paid' ? 'selected' : ''}>Pago</option>
                                </select>
                                <label for="edit-compra-payment-status" class="active">Status do Pagamento *</label>
                            </div>
                            <small class="form-text">Atualize o status de pagamento da nota fiscal</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="edit-compra-payment-method">
                                    <option value="">Selecione...</option>
                                    <option value="money" ${currentMethod === 'money' ? 'selected' : ''}>Dinheiro</option>
                                    <option value="credit" ${currentMethod === 'credit' ? 'selected' : ''}>Cartão de Crédito</option>
                                    <option value="debit" ${currentMethod === 'debit' ? 'selected' : ''}>Cartão de Débito</option>
                                    <option value="pix" ${currentMethod === 'pix' ? 'selected' : ''}>PIX</option>
                                </select>
                                <label for="edit-compra-payment-method" class="${currentMethod ? 'active' : ''}">Forma de Pagamento</label>
                            </div>
                            <small class="form-text">Método de pagamento utilizado (opcional)</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <textarea id="edit-compra-notes" rows="3">${escapeHTML(currentNotes)}</textarea>
                                <label for="edit-compra-notes" class="${currentNotes ? 'active' : ''}">Observações</label>
                            </div>
                            <small class="form-text">Informações adicionais sobre a compra (opcional)</small>
                        </div>

                        <!-- ALTERAÇÃO: Seção de itens da nota fiscal -->
                        <div class="compra-items-section">
                            <div class="compra-items-header">
                                <h3>Itens da Nota Fiscal</h3>
                                <button type="button" class="btn-adicionar-item" id="btn-adicionar-item-edit">
                                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                                    <span>Adicionar Item</span>
                                </button>
                            </div>
                            
                            <!-- Formulário para adicionar/editar item -->
                            <div class="compra-item-form-wrapper" id="compra-item-form-wrapper-edit" style="display: none;">
                                <!-- Formulário será inserido aqui -->
                            </div>
                            
                            <!-- Lista de itens cadastrados -->
                            <div class="compra-items-cadastrados" id="compra-items-cadastrados-edit">
                                <p class="compra-no-items" id="compra-no-items-edit" style="display: ${this.editItems.length > 0 ? 'none' : 'block'};">Nenhum item adicionado. Clique em "Adicionar Item" para começar.</p>
                            </div>
                            
                            <!-- Valor Total -->
                            <div class="compra-total-wrapper">
                                <div class="compra-total">
                                    <span class="total-label">Valor Total:</span>
                                    <span class="total-value" id="edit-compra-total-value">R$ 0,00</span>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" data-close-modal="modal-compra-editar">Cancelar</button>
                    <button type="button" class="btn-salvar" id="btn-save-edit-compra" data-invoice-id="${invoice.id}">
                        Salvar Alterações
                    </button>
                </div>
            </div>
        `;

        // ALTERAÇÃO: Renderizar itens existentes
        this.renderEditItems();

        // ALTERAÇÃO: Atualizar total inicial
        this.updateEditTotal();

        // ALTERAÇÃO: Configurar event listeners
        this.setupEditModalListeners();

        // ALTERAÇÃO: Usar sistema de modais.js para abrir modal
        abrirModal('modal-compra-editar');

        // ALTERAÇÃO: Gerenciar estados dos inputs
        const inputs = modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        gerenciarInputsEspecificos(inputs);
    }

    /**
     * Salva alterações da nota fiscal
     * ALTERAÇÃO: Incluída atualização de itens
     * @param {number} invoiceId - ID da nota fiscal
     */
    async saveEditInvoice(invoiceId) {
        try {
            const paymentStatus = document.getElementById('edit-compra-payment-status')?.value;
            const paymentMethod = document.getElementById('edit-compra-payment-method')?.value || null;
            const notes = document.getElementById('edit-compra-notes')?.value.trim() || null;

            if (!paymentStatus) {
                showToast('Status do pagamento é obrigatório', {
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }

            // ALTERAÇÃO: Validar e preparar itens
            if (this.editItems.length === 0) {
                showToast('Adicione pelo menos um item à nota fiscal', {
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }

            // Calcular total dos itens
            let totalAmount = 0;
            const validItems = [];

            this.editItems.forEach(item => {
                const quantity = item.quantity || 0; // ALTERAÇÃO: Já está em unidade base após confirmEditItem
                const displayQuantity = item.display_quantity || quantity; // ALTERAÇÃO: Quantidade de exibição
                const totalPrice = item.total_price || 0;
                const unitPrice = item.unit_price || 0; // ALTERAÇÃO: Já calculado na unidade de exibição
                const stockUnit = item.stock_unit || item.ingredient_data?.stock_unit || 'un';

                totalAmount += totalPrice;

                validItems.push({
                    ingredient_id: item.ingredient_id,
                    quantity: quantity, // ALTERAÇÃO: Quantidade em unidade base (2000g)
                    display_quantity: displayQuantity, // ALTERAÇÃO: Quantidade de exibição (2kg)
                    stock_unit: stockUnit, // ALTERAÇÃO: Unidade do ingrediente
                    unit_price: unitPrice, // ALTERAÇÃO: unit_price na unidade de exibição (39.90 por kg)
                    total_price: totalPrice // ALTERAÇÃO: total_price exato (79.80)
                });
            });

            const updateData = {
                payment_status: paymentStatus,
                payment_method: paymentMethod,
                notes: notes,
                total_amount: totalAmount,
                items: validItems
            };

            // Se mudou para Paid, adicionar payment_date se não existir
            if (paymentStatus === 'Paid') {
                const invoice = await getPurchaseInvoiceById(invoiceId);
                if (invoice && !invoice.payment_date) {
                    updateData.payment_date = new Date().toISOString();
                }
            }

            await updatePurchaseInvoice(invoiceId, updateData);

            showToast('Nota fiscal atualizada com sucesso!', {
                type: 'success',
                title: 'Sucesso'
            });

            // ALTERAÇÃO: Fechar modal usando sistema modais.js
            fecharModal('modal-compra-editar');

            // Recarregar lista
            await this.loadInvoices();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            const errorMessage = error.message || 'Erro ao atualizar nota fiscal';
            showToast(errorMessage, {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Marca uma nota fiscal como paga
     * ALTERAÇÃO: Nova função para marcar como pago diretamente do card
     * @param {number} invoiceId - ID da nota fiscal
     */
    async markAsPaid(invoiceId) {
        try {
            // Buscar dados atuais da nota fiscal
            const invoice = await getPurchaseInvoiceById(invoiceId);
            if (!invoice) {
                showToast('Nota fiscal não encontrada', {
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }

            // Verificar se já está paga
            if (invoice.payment_status === 'Paid') {
                showToast('Esta nota fiscal já está marcada como paga', {
                    type: 'info',
                    title: 'Informação'
                });
                return;
            }

            // Preparar dados de atualização
            const updateData = {
                payment_status: 'Paid'
            };

            // Adicionar payment_date se não existir
            if (!invoice.payment_date) {
                updateData.payment_date = formatDateForAPI(new Date());
            }

            // Atualizar nota fiscal
            await updatePurchaseInvoice(invoiceId, updateData);

            showToast('Nota fiscal marcada como paga com sucesso!', {
                type: 'success',
                title: 'Sucesso'
            });

            // Recarregar lista para atualizar o card
            await this.loadInvoices();
        } catch (error) {
            const errorMessage = error.message || 'Erro ao marcar nota fiscal como paga';
            showToast(errorMessage, {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * ALTERAÇÃO: Carrega ingredientes para edição filtrados por fornecedor
     * @param {string} supplierName - Nome do fornecedor para filtrar ingredientes
     */
    async loadEditIngredients(supplierName = null) {
        const cacheKey = 'ingredients:active:1000';
        const cached = cacheManager.get(cacheKey);

        let allIngredients = [];
        if (cached) {
            allIngredients = cached;
        } else {
            try {
                const response = await getIngredients({ page_size: 1000, status: 'active' });
                allIngredients = response.items || response || [];
                cacheManager.set(cacheKey, allIngredients, 5 * 60 * 1000);
            } catch (error) {
                allIngredients = [];
            }
        }

        // ALTERAÇÃO: Filtrar ingredientes por fornecedor se fornecido (comparação case-insensitive)
        if (supplierName && supplierName.trim() !== '') {
            const normalizedSupplierName = supplierName.trim().toLowerCase();
            this.editIngredients = allIngredients.filter(ing => {
                if (!ing.supplier) return false;
                const normalizedIngSupplier = ing.supplier.trim().toLowerCase();
                return normalizedIngSupplier === normalizedSupplierName;
            });
        } else {
            this.editIngredients = allIngredients;
        }
    }

    /**
     * ALTERAÇÃO: Configura event listeners da modal de edição
     */
    setupEditModalListeners() {
        const modal = document.getElementById('modal-compra-editar');
        if (!modal) return;

        // Botão adicionar item
        const btnAddItem = document.getElementById('btn-adicionar-item-edit');
        if (btnAddItem) {
            btnAddItem.addEventListener('click', () => {
                this.addEditItemToForm();
            });
        }

        // Botão salvar
        const btnSave = document.getElementById('btn-save-edit-compra');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                this.saveEditInvoice(this.currentEditInvoiceId);
            });
        }

        // ALTERAÇÃO: Botão excluir removido da modal - agora está no card

        // Event delegation para ações dos itens
        const itemsList = document.getElementById('compra-items-cadastrados-edit');
        if (itemsList) {
            itemsList.addEventListener('click', (e) => {
                const removeBtn = e.target.closest('.btn-remover-item-lista');
                const editBtn = e.target.closest('.btn-editar-item-lista');

                if (removeBtn) {
                    const itemId = removeBtn.dataset.itemId;
                    this.removeEditItemFromList(itemId);
                } else if (editBtn) {
                    const itemId = editBtn.dataset.itemId;
                    this.editItemInList(itemId);
                }
            });
        }
    }

    /**
     * ALTERAÇÃO: Adiciona formulário de novo item na edição
     */
    addEditItemToForm() {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        if (formWrapper.style.display !== 'none') {
            showToast('Finalize o item atual antes de adicionar outro', { type: 'warning', title: 'Atenção' });
            return;
        }

        const itemId = `edit-item-${Date.now()}`;

        const itemHTML = `
            <div class="compra-item-form" data-item-id="${itemId}">
                <h4>Novo Item</h4>
                <div class="compra-item-form-body">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select class="compra-item-ingredient" data-item-id="${itemId}" required>
                                <option value="">Selecione o insumo...</option>
                                ${this.editIngredients.map(ing => `
                                    <option value="${ing.id}">${escapeHTML(ing.name || 'Insumo')}</option>
                                `).join('')}
                            </select>
                            <label>Insumo *</label>
                        </div>
                        <small class="form-text">Selecione o insumo que foi comprado</small>
                    </div>
                    
                    <div class="compra-item-info" data-item-id="${itemId}" style="display: none;">
                        <div class="compra-item-info-row">
                            <div class="compra-info-item">
                                <span class="info-label">Unidade:</span>
                                <span class="info-value compra-item-unit" data-item-id="${itemId}">-</span>
                            </div>
                        </div>
                    </div>

                    <div class="compra-item-row">
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-quantity" 
                                       data-item-id="${itemId}" 
                                       step="0.001" 
                                       min="0" 
                                       required>
                                <label>Quantidade *</label>
                            </div>
                            <small class="form-text">Quantidade comprada</small>
                        </div>
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-price" 
                                       data-item-id="${itemId}" 
                                       step="0.01" 
                                       min="0" 
                                       required>
                                <label>Valor Total (R$) *</label>
                            </div>
                            <small class="form-text">Valor total gasto</small>
                        </div>
                    </div>

                    <div class="compra-item-form-actions">
                        <button type="button" class="btn-cancelar-item" data-item-id="${itemId}">
                            <i class="fa-solid fa-times" aria-hidden="true"></i>
                            Cancelar
                        </button>
                        <button type="button" class="btn-confirmar-item" data-item-id="${itemId}">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        `;

        formWrapper.innerHTML = itemHTML;
        formWrapper.style.display = 'block';

        // Configurar listeners
        this.setupEditFormItemListeners(itemId);

        // Gerenciar estados dos inputs
        const itemInputs = formWrapper.querySelectorAll('.div-input input, .div-input select');
        gerenciarInputsEspecificos(itemInputs);

        // Botão cancelar
        const btnCancelar = formWrapper.querySelector('.btn-cancelar-item');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                formWrapper.innerHTML = '';
                formWrapper.style.display = 'none';
            });
        }
    }

    /**
     * ALTERAÇÃO: Configura listeners do formulário de item na edição
     */
    setupEditFormItemListeners(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        // Select de ingrediente
        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        if (ingredientSelect) {
            ingredientSelect.addEventListener('change', async () => {
                await this.onEditFormIngredientSelected(itemId);
            });
        }

        // Inputs de quantidade e preço
        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        if (quantityInput && priceInput) {
            quantityInput.addEventListener('input', debounce(() => {
                this.calculateEditFormPriceFromQuantity(itemId);
            }, 300));

            priceInput.addEventListener('input', debounce(() => {
                this.calculateEditFormQuantityFromPrice(itemId);
            }, 300));
        }

        // Botão confirmar
        const btnConfirmar = formWrapper.querySelector('.btn-confirmar-item');
        if (btnConfirmar) {
            btnConfirmar.addEventListener('click', () => {
                this.confirmEditItem(itemId);
            });
        }
    }

    /**
     * ALTERAÇÃO: Quando ingrediente é selecionado no formulário de edição
     */
    async onEditFormIngredientSelected(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;

        if (!ingredientId) {
            const infoDiv = formWrapper.querySelector('.compra-item-info');
            if (infoDiv) infoDiv.style.display = 'none';
            return;
        }

        try {
            const cacheKey = `ingredient:${ingredientId}`;
            let ingredient = cacheManager.get(cacheKey);

            if (!ingredient) {
                ingredient = await getIngredientById(ingredientId);
                cacheManager.set(cacheKey, ingredient, 10 * 60 * 1000);
            }

            formWrapper.dataset.ingredientData = JSON.stringify({
                id: ingredientId,
                name: ingredient.name,
                stock_unit: ingredient.stock_unit || 'un'
            });

            const infoDiv = formWrapper.querySelector('.compra-item-info');
            const unitSpan = formWrapper.querySelector('.compra-item-unit');

            if (infoDiv) infoDiv.style.display = 'block';
            if (unitSpan) unitSpan.textContent = this.normalizeUnit(ingredient.stock_unit || 'un').toUpperCase();
        } catch (error) {
            showToast('Erro ao carregar informações do insumo', { type: 'error', title: 'Erro' });
        }
    }

    /**
     * ALTERAÇÃO: Calcula preço total a partir da quantidade
     */
    calculateEditFormPriceFromQuantity(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        if (!quantityInput || !priceInput) return;

        const quantity = parseFloat(quantityInput.value) || 0;
        const currentPrice = parseFloat(priceInput.value) || 0;
        const currentQuantity = parseFloat(quantityInput.dataset.lastQuantity || quantity) || 1;

        if (currentQuantity > 0 && quantity > 0) {
            // ALTERAÇÃO: Calcular preço sem arredondamento
            const newPrice = (currentPrice / currentQuantity) * quantity;
            // ALTERAÇÃO: Preservar todas as casas decimais (usar string para evitar arredondamento do JavaScript)
            priceInput.value = String(newPrice);
        }

        quantityInput.dataset.lastQuantity = quantity;
    }

    /**
     * ALTERAÇÃO: Calcula quantidade a partir do preço total
     */
    calculateEditFormQuantityFromPrice(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        if (!quantityInput || !priceInput) return;

        const price = parseFloat(priceInput.value) || 0;
        const currentQuantity = parseFloat(quantityInput.value) || 0;
        const currentPrice = parseFloat(priceInput.dataset.lastPrice || price) || 1;

        if (currentPrice > 0 && price > 0) {
            // ALTERAÇÃO: Calcular quantidade sem arredondamento
            const newQuantity = (currentQuantity / currentPrice) * price;
            // ALTERAÇÃO: Preservar todas as casas decimais (usar string para evitar arredondamento do JavaScript)
            quantityInput.value = String(newQuantity);
        }

        priceInput.dataset.lastPrice = price;
    }

    /**
     * ALTERAÇÃO: Confirma item e adiciona à lista na edição
     */
    confirmEditItem(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;
        const quantity = quantityInput ? parseFloat(quantityInput.value) : null;
        const totalPrice = priceInput ? parseFloat(priceInput.value) : null;

        if (!ingredientId) {
            showToast('Selecione um insumo', { type: 'error', title: 'Erro' });
            return;
        }

        if (!quantity || quantity <= 0) {
            showToast('Informe a quantidade', { type: 'error', title: 'Erro' });
            return;
        }

        if (!totalPrice || totalPrice <= 0) {
            showToast('Informe o valor total', { type: 'error', title: 'Erro' });
            return;
        }

        let ingredientData = {};
        try {
            ingredientData = JSON.parse(formWrapper.dataset.ingredientData || '{}');
        } catch (e) {
            // Usar dados do select se não conseguir parsear
            const ingredient = this.editIngredients.find(ing => ing.id === ingredientId);
            if (ingredient) {
                ingredientData = {
                    id: ingredientId,
                    name: ingredient.name,
                    stock_unit: ingredient.stock_unit || 'un'
                };
            }
        }

        // ALTERAÇÃO: Converter quantidade da unidade de exibição para unidade base antes de salvar
        const stockUnit = ingredientData.stock_unit || 'un';
        const baseQuantity = this.convertQuantityToBase(quantity, stockUnit);

        // ALTERAÇÃO: Calcular unit_price na unidade de exibição (kg/L), não na unidade base (g/ml)
        // Isso evita valores muito pequenos (ex: 0.0399 por grama) que são arredondados incorretamente
        const unitPrice = totalPrice / quantity; // Por kg/L, não por g/ml

        const item = {
            id: itemId,
            ingredient_id: ingredientId,
            ingredient_data: ingredientData,
            quantity: baseQuantity, // ALTERAÇÃO: Salvar na unidade base (2000g)
            display_quantity: quantity, // ALTERAÇÃO: Quantidade de exibição (2kg)
            stock_unit: stockUnit, // ALTERAÇÃO: Unidade do ingrediente
            total_price: totalPrice,
            unit_price: unitPrice // ALTERAÇÃO: unit_price na unidade de exibição (39.90 por kg)
        };

        this.editItems.push(item);
        this.renderEditItemInList(item);

        formWrapper.innerHTML = '';
        formWrapper.style.display = 'none';

        this.updateEditTotal();
        showToast('Item adicionado com sucesso!', { type: 'success', title: 'Sucesso' });
    }

    /**
     * ALTERAÇÃO: Renderiza item na lista de edição
     */
    renderEditItemInList(item) {
        const itemsList = document.getElementById('compra-items-cadastrados-edit');
        const noItemsMsg = document.getElementById('compra-no-items-edit');

        if (!itemsList) return;

        if (noItemsMsg) {
            noItemsMsg.style.display = 'none';
        }

        const itemHTML = `
            <div class="compra-item-cadastrado" data-item-id="${item.id}">
                <div class="compra-item-cadastrado-content">
                    <div class="compra-item-info-main">
                        <div class="compra-item-nome">
                            <i class="fa-solid fa-box" aria-hidden="true"></i>
                            <span class="nome-insumo">${escapeHTML(item.ingredient_data?.name || 'Insumo')}</span>
                        </div>
                        <div class="compra-item-detalhes">
                            <div class="detalhe-item">
                                <span class="detalhe-label">Quantidade:</span>
                                <span class="detalhe-value">${this.formatQuantity(item.quantity, item.ingredient_data?.stock_unit || 'un')}</span>
                            </div>
                            <div class="detalhe-item">
                                <span class="detalhe-label">Valor:</span>
                                <span class="detalhe-value valor-destaque">R$ ${this.formatCurrency(item.total_price)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="compra-item-actions">
                        <button type="button" class="btn-editar-item-lista" data-item-id="${item.id}" aria-label="Editar item">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="btn-remover-item-lista" data-item-id="${item.id}" aria-label="Remover item">
                            <i class="fa-solid fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        itemsList.insertAdjacentHTML('beforeend', itemHTML);
    }

    /**
     * ALTERAÇÃO: Renderiza todos os itens na lista de edição
     */
    renderEditItems() {
        const itemsList = document.getElementById('compra-items-cadastrados-edit');
        if (!itemsList) return;

        itemsList.innerHTML = '';
        const noItemsMsg = document.getElementById('compra-no-items-edit');

        if (this.editItems.length === 0) {
            if (noItemsMsg) {
                itemsList.appendChild(noItemsMsg);
                noItemsMsg.style.display = 'block';
            }
            return;
        }

        if (noItemsMsg) {
            noItemsMsg.style.display = 'none';
        }

        this.editItems.forEach(item => {
            this.renderEditItemInList(item);
        });
    }

    /**
     * ALTERAÇÃO: Remove item da lista de edição
     */
    removeEditItemFromList(itemId) {
        const itemElement = document.querySelector(`.compra-item-cadastrado[data-item-id="${itemId}"]`);
        if (itemElement) {
            itemElement.remove();
        }

        this.editItems = this.editItems.filter(item => item.id !== itemId);

        const itemsList = document.getElementById('compra-items-cadastrados-edit');
        const noItemsMsg = document.getElementById('compra-no-items-edit');
        if (itemsList && this.editItems.length === 0 && noItemsMsg) {
            itemsList.appendChild(noItemsMsg);
            noItemsMsg.style.display = 'block';
        }

        this.updateEditTotal();
        showToast('Item removido', { type: 'info', title: 'Info' });
    }

    /**
     * ALTERAÇÃO: Edita item existente na lista
     */
    editItemInList(itemId) {
        const item = this.editItems.find(i => i.id === itemId);
        if (!item) return;

        // Remover da lista temporariamente
        this.removeEditItemFromList(itemId);

        // Abrir formulário com dados do item
        const formWrapper = document.getElementById('compra-item-form-wrapper-edit');
        if (!formWrapper) return;

        const newItemId = `edit-item-${Date.now()}`;

        const itemHTML = `
            <div class="compra-item-form" data-item-id="${newItemId}">
                <h4>Editar Item</h4>
                <div class="compra-item-form-body">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select class="compra-item-ingredient" data-item-id="${newItemId}" required>
                                <option value="">Selecione o insumo...</option>
                                ${this.editIngredients.map(ing => `
                                    <option value="${ing.id}" ${ing.id === item.ingredient_id ? 'selected' : ''}>${escapeHTML(ing.name || 'Insumo')}</option>
                                `).join('')}
                            </select>
                            <label class="active">Insumo *</label>
                        </div>
                        <small class="form-text">Selecione o insumo que foi comprado</small>
                    </div>
                    
                    <div class="compra-item-info" data-item-id="${newItemId}" style="display: block;">
                        <div class="compra-item-info-row">
                            <div class="compra-info-item">
                                <span class="info-label">Unidade:</span>
                                <span class="info-value compra-item-unit" data-item-id="${newItemId}">${this.normalizeUnit(item.ingredient_data?.stock_unit || 'un').toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    <div class="compra-item-row">
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-quantity" 
                                       data-item-id="${newItemId}" 
                                       step="0.001" 
                                       min="0" 
                                       value="${this.getEditableQuantity(item.quantity, item.ingredient_data?.stock_unit || 'un')}"
                                       required>
                                <label class="active">Quantidade *</label>
                            </div>
                            <small class="form-text">Quantidade comprada (${this.normalizeUnit(item.ingredient_data?.stock_unit || 'un').toUpperCase()})</small>
                        </div>
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-price" 
                                       data-item-id="${newItemId}" 
                                       step="0.01" 
                                       min="0" 
                                       value="${item.total_price}"
                                       required>
                                <label class="active">Valor Total (R$) *</label>
                            </div>
                            <small class="form-text">Valor total gasto</small>
                        </div>
                    </div>

                    <div class="compra-item-form-actions">
                        <button type="button" class="btn-cancelar-item" data-item-id="${newItemId}">
                            <i class="fa-solid fa-times" aria-hidden="true"></i>
                            Cancelar
                        </button>
                        <button type="button" class="btn-confirmar-item" data-item-id="${newItemId}">
                            <i class="fa-solid fa-check" aria-hidden="true"></i>
                            Confirmar
                        </button>
                    </div>
                </div>
            </div>
        `;

        formWrapper.innerHTML = itemHTML;
        formWrapper.style.display = 'block';
        formWrapper.dataset.ingredientData = JSON.stringify(item.ingredient_data);

        this.setupEditFormItemListeners(newItemId);

        const itemInputs = formWrapper.querySelectorAll('.div-input input, .div-input select');
        gerenciarInputsEspecificos(itemInputs);

        const btnCancelar = formWrapper.querySelector('.btn-cancelar-item');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                // Restaurar item original
                this.editItems.push(item);
                this.renderEditItemInList(item);
                this.updateEditTotal();
                formWrapper.innerHTML = '';
                formWrapper.style.display = 'none';
            });
        }
    }

    /**
     * ALTERAÇÃO: Atualiza total da compra na edição
     */
    updateEditTotal() {
        const total = this.editItems.reduce((sum, item) => {
            return sum + (item.total_price || 0);
        }, 0);

        const totalElement = document.getElementById('edit-compra-total-value');
        if (totalElement) {
            // ALTERAÇÃO: Usar formatCurrency para arredondar valores monetários para 2 casas decimais
            totalElement.textContent = `R$ ${this.formatCurrency(total)}`;
        }
    }

    /**
     * ALTERAÇÃO: Normaliza unidade de medida
     */
    normalizeUnit(unit) {
        if (!unit) return 'un';
        const u = unit.toLowerCase().trim();
        if (u === 'kilogram' || u === 'kilograma') return 'kg';
        if (u === 'gram' || u === 'grama') return 'g';
        if (u === 'liter' || u === 'litro') return 'l';
        if (u === 'milliliter' || u === 'mililitro') return 'ml';
        if (u === 'unit' || u === 'unidade') return 'un';
        return u;
    }

    /**
     * ALTERAÇÃO: Formata quantidade com base na unidade de medida do ingrediente
     * 
     * REGRA CRÍTICA: O banco armazena na mesma unidade do ingrediente
     * Se o ingrediente tem stock_unit = 'kg', o banco armazena em kg, não em gramas
     * Portanto, NÃO deve converter dividindo por 1000 quando a unidade já é kg ou L
     * 
     * @param {number} quantity - Quantidade armazenada no banco (na mesma unidade do ingrediente)
     * @param {string} stockUnit - Unidade de estoque do ingrediente (kg, g, L, ml, un)
     * @returns {string} Quantidade formatada com unidade
     */
    formatQuantity(quantity, stockUnit) {
        if (!quantity || quantity === 0) return '0';
        
        const normalizedUnit = this.normalizeUnit(stockUnit);
        let displayQuantity = quantity;
        let displayUnit = normalizedUnit;

        // ALTERAÇÃO CRÍTICA: Não converter quando unidade já é kg ou L
        // O banco armazena na mesma unidade do ingrediente
        // Se stock_unit = 'kg', quantity já está em kg (não precisa dividir por 1000)
        
        // Apenas usar a quantidade como está - banco armazena na mesma unidade do ingrediente
        displayQuantity = quantity;
        displayUnit = normalizedUnit;

        // ALTERAÇÃO: Formatar quantidade com decimais apropriados
        let formattedQuantity;
        if (displayUnit === 'kg' || displayUnit === 'L') {
            // ALTERAÇÃO: Para kg e L, exibir com até 3 casas decimais se necessário
            formattedQuantity = displayQuantity % 1 === 0 
                ? displayQuantity.toFixed(0) 
                : parseFloat(displayQuantity.toFixed(3)).toString();
        } else if (displayUnit === 'g' || displayUnit === 'ml') {
            // ALTERAÇÃO: Para g e ml, exibir com até 1 casa decimal se necessário
            formattedQuantity = displayQuantity % 1 === 0 
                ? displayQuantity.toFixed(0) 
                : parseFloat(displayQuantity.toFixed(1)).toString();
        } else {
            // ALTERAÇÃO: Para unidades (un), exibir sem decimais ou com até 3 casas se necessário
            formattedQuantity = displayQuantity % 1 === 0 
                ? displayQuantity.toFixed(0) 
                : parseFloat(displayQuantity.toFixed(3)).toString();
        }

        return `${formattedQuantity} ${displayUnit.toUpperCase()}`;
    }

    /**
     * ALTERAÇÃO: Obtém quantidade editável para exibição em campos de input
     * 
     * REGRA CRÍTICA: O banco armazena na mesma unidade do ingrediente
     * Se o ingrediente tem stock_unit = 'kg', o banco armazena em kg, não em gramas
     * Portanto, NÃO deve converter dividindo por 1000 quando a unidade já é kg ou L
     * 
     * Usado para preencher campos de input ao editar itens
     * @param {number} quantity - Quantidade armazenada no banco (na mesma unidade do ingrediente)
     * @param {string} stockUnit - Unidade de estoque do ingrediente (kg, g, L, ml, un)
     * @returns {number} Quantidade para exibição no input (na mesma unidade do ingrediente)
     */
    getEditableQuantity(quantity, stockUnit) {
        if (!quantity || quantity === 0) return 0;
        
        const normalizedUnit = this.normalizeUnit(stockUnit);
        
        // ALTERAÇÃO CRÍTICA: Não converter quando unidade já é kg ou L
        // O banco armazena na mesma unidade do ingrediente
        // Se stock_unit = 'kg', quantity já está em kg (não precisa dividir por 1000)
        
        // Para kg, L, g, ml, un - quantidade já está na unidade correta
        return quantity;
    }

    /**
     * ALTERAÇÃO: Converte quantidade da unidade de exibição para unidade base
     * Usado ao salvar itens (o usuário digita na unidade de exibição, mas o backend espera unidade base)
     * 
     * REGRA CRÍTICA: NÃO converter quando unidade compra = unidade insumo
     * Se o ingrediente tem unidade base 'kg', o banco armazena em kg, não em gramas!
     * 
     * @param {number} quantity - Quantidade digitada pelo usuário (na unidade de exibição: kg, L, etc)
     * @param {string} stockUnit - Unidade de estoque do ingrediente (kg, g, L, ml, un)
     * @returns {number} Quantidade na unidade base do banco (mesma unidade do ingrediente)
     */
    convertQuantityToBase(quantity, stockUnit) {
        if (!quantity || quantity === 0) return 0;
        
        const normalizedUnit = this.normalizeUnit(stockUnit);
        
        // ALTERAÇÃO CRÍTICA: O banco armazena na mesma unidade do ingrediente
        // Se o ingrediente tem stock_unit = 'kg', o banco armazena em kg, NÃO em gramas
        // Portanto, NÃO deve converter quando a unidade do ingrediente já é kg ou L
        
        // Para kg, L, g, ml, un - quantidade já está na unidade correta
        // Não fazer conversão - o banco armazena na mesma unidade do ingrediente
        return quantity;
    }

    /**
     * ALTERAÇÃO: Converte preço unitário da unidade base para unidade de exibição
     * O backend armazena unit_price na unidade base (por grama ou por ml)
     * Mas na exibição, precisamos mostrar na unidade de exibição (por kg ou por L)
     * @param {number} baseUnitPrice - Preço unitário na unidade base (por grama ou por ml)
     * @param {string} stockUnit - Unidade de estoque do ingrediente (kg, g, L, ml, un)
     * @returns {number} Preço unitário na unidade de exibição (por kg, L, g, ml ou un)
     */
    formatUnitPrice(baseUnitPrice, stockUnit) {
        if (!baseUnitPrice || baseUnitPrice === 0) return 0;
        
        const normalizedUnit = this.normalizeUnit(stockUnit);
        
        // ALTERAÇÃO: Converter da unidade base para unidade de exibição
        if (normalizedUnit === 'kg') {
            // Preço está por grama, converter para por kg (multiplicar por 1000)
            return baseUnitPrice * 1000;
        } else if (normalizedUnit === 'l') {
            // Preço está por ml, converter para por L (multiplicar por 1000)
            return baseUnitPrice * 1000;
        }
        
        // Para g, ml, un - preço já está na unidade correta
        return baseUnitPrice;
    }

    /**
     * Confirma exclusão de nota fiscal
     * ALTERAÇÃO: Novo método para exclusão
     * @param {number} invoiceId - ID da nota fiscal
     */
    async confirmDeleteInvoice(invoiceId) {
        try {
            const invoice = await getPurchaseInvoiceById(invoiceId);
            if (!invoice) {
                showToast('Nota fiscal não encontrada', {
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }

            const invoiceNumber = invoice.invoice_number || 'N/A';
            
            // ALTERAÇÃO: Usar sistema de alertas do projeto em vez de confirm() nativo
            const confirmed = await showConfirm({
                title: 'Excluir Nota Fiscal',
                message: `Deseja realmente excluir a nota fiscal ${escapeHTML(invoiceNumber)}?\n\n` +
                    `Ao confirmar, serão revertidas automaticamente:\n` +
                    `• Entradas de estoque dos ingredientes\n` +
                    `• Movimento financeiro relacionado\n\n` +
                    `Esta ação é permanente e não pode ser desfeita.`,
                confirmText: 'Excluir',
                cancelText: 'Cancelar',
                type: 'delete'
            });

            if (!confirmed) {
                return;
            }

            // ALTERAÇÃO: Excluir nota fiscal
            await deletePurchaseInvoice(invoiceId);

            // ALTERAÇÃO: Fechar modal de edição antes de mostrar mensagem de sucesso
            fecharModal('modal-compra-editar');

            showToast('Nota fiscal excluída com sucesso!', {
                type: 'success',
                title: 'Sucesso'
            });

            // Recarregar lista
            await this.loadInvoices();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            const errorMessage = error.message || 'Erro ao excluir nota fiscal';
            showToast(errorMessage, {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Configura eventos em tempo real para atualização automática
     * ALTERAÇÃO: Implementado para atualizar lista de compras quando há mudanças
     */
    setupRealtimeEvents() {
        const client = getRealtimeClient();
        
        // ALTERAÇÃO: Escutar eventos de compras criadas/atualizadas
        client.on('purchase.created', async (data) => {
            // Recarregar lista de compras
            await this.loadInvoices();
        });

        client.on('purchase.updated', async (data) => {
            // Recarregar lista de compras quando atualizada
            await this.loadInvoices();
        });
    }
}

