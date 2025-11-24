/**
 * Formulário de Nova Compra
 * Gerencia criação de notas fiscais de compra
 */

import { createPurchaseInvoice } from '../../api/purchases.js';
import { getIngredients, getIngredientById } from '../../api/ingredients.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { formatDateForAPI } from '../../utils/date-formatter.js';
import { abrirModal, fecharModal } from '../modais.js';
import { gerenciarInputsEspecificos } from '../../utils.js';
import { cacheManager } from '../../utils/cache-manager.js';
import { debounce } from '../../utils/performance-utils.js';

export class CompraForm {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.form = null;
        this.ingredients = []; // Todos os ingredientes
        this.suppliers = []; // Lista de fornecedores únicos
        this.filteredIngredients = []; // Ingredientes filtrados por fornecedor
        this.selectedSupplier = null; // Fornecedor selecionado
        this.items = []; // Lista de itens da nota fiscal
        this.onSuccess = null;
        this.abortController = null; // Para cancelar requisições pendentes
        this.eventListeners = new Map(); // Para cleanup de event listeners
        this.draftKey = 'compra-form-draft'; // ALTERAÇÃO: Chave para localStorage
        this.autoSaveInterval = null; // ALTERAÇÃO: Intervalo de auto-save
    }

    /**
     * Inicializa o formulário
     */
    async init() {
        if (!this.modal) {
            // Criar modal se não existir
            this.modal = document.createElement('div');
            this.modal.id = 'modal-nova-compra';
            this.modal.className = 'modal';
            document.body.appendChild(this.modal);
        }

        await this.loadIngredients();
    }

    /**
     * Carrega lista de ingredientes
     * ALTERAÇÃO: Extrair fornecedores únicos
     */
    async loadIngredients() {
        const cacheKey = 'ingredients:active:1000';
        const cached = cacheManager.get(cacheKey);
        
        if (cached) {
            // Verificar se cached é array válido
            if (Array.isArray(cached)) {
                this.ingredients = cached;
                this.extractSuppliers();
                this.filteredIngredients = [...this.ingredients];
                console.log('✅ Ingredientes carregados do cache:', this.ingredients.length);
            } else {
                console.error('❌ Cache corrompido, limpando...');
                cacheManager.delete(cacheKey);
                this.ingredients = [];
                this.suppliers = [];
                this.filteredIngredients = [];
            }
            return;
        }
    
        try {
            const response = await getIngredients({ page_size: 1000, status: 'active' });
            console.log('📦 Resposta da API:', response); // DEBUG - ver estrutura real
            
            // CORREÇÃO CRÍTICA: Garantir que sempre seja um array
            let items = response.data.items || [];
            
            // if (Array.isArray(response)) {
            //     // Se response já é array
            //     items = response.data;
            // } else if (response && Array.isArray(response.items)) {
            //     // Se response tem propriedade items que é array
            //     items = response.items;
            // } else if (response && Array.isArray(response.data)) {
            //     // Se response tem propriedade data que é array
            //     items = response.data;
            // } else if (response && typeof response === 'object') {
            //     // Se response é objeto, tentar encontrar array dentro dele
            //     const possibleArrays = Object.values(response).filter(val => Array.isArray(val));
            //     if (possibleArrays.length > 0) {
            //         items = possibleArrays[0];
            //     }
            // }
            
            this.ingredients = items;

            if (this.ingredients.length > 0) {
                cacheManager.set(cacheKey, this.ingredients, 5 * 60 * 1000);
            }
            
            this.extractSuppliers();
            this.filteredIngredients = [...this.ingredients];
            
            console.log('✅ Ingredientes carregados da API:', this.ingredients.length);
            console.log('✅ Fornecedores extraídos:', this.suppliers.length);
            
        } catch (error) {
            console.error('❌ Erro ao carregar ingredientes:', error);
            this.ingredients = [];
            this.suppliers = [];
            this.filteredIngredients = [];
        }
    }

    /**
     * Extrai lista de fornecedores únicos dos ingredientes
     * ALTERAÇÃO: Novo método para extrair fornecedores
     */
    async extractSuppliers() {
        const suppliersSet = new Set();
        
        this.ingredients.forEach(ingredient => {
            if (ingredient.supplier && ingredient.supplier.trim() !== '' && ingredient.supplier !== 'Não informado') {
                suppliersSet.add(ingredient.supplier.trim());
            }
        });

        console.log('suppliersSet', suppliersSet); // DEBUG

        this.suppliers = Array.from(suppliersSet).sort((a, b) => 
            a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
        );
    }

    /**
     * Filtra ingredientes por fornecedor
     * ALTERAÇÃO: Novo método para filtrar ingredientes
     */
    async filterIngredientsBySupplier(supplierName) {
        if (!supplierName || supplierName === '') {
            this.filteredIngredients = [...this.ingredients];
            this.selectedSupplier = null;
        } else {
            this.filteredIngredients = this.ingredients.filter(ing => 
                ing.supplier && ing.supplier.trim() === supplierName.trim()
            );
            this.selectedSupplier = supplierName;
        }
    }

    /**
     * Abre modal para nova compra
     * ALTERAÇÃO: Verificar e carregar rascunho do localStorage
     * @param {Function} onSuccess - Callback chamado após sucesso
     */
    async openNew(onSuccess = null) {
        // Garantir que ingredientes estejam carregados
        if (this.ingredients.length === 0) {
            console.log('⚠️ Ingredientes não carregados, carregando...'); // DEBUG
            await this.loadIngredients();
        }
        
        this.items = [];
        this.onSuccess = onSuccess;
        await this.render();
        
        if (this.hasDraft()) {
            this.showDraftConfirmation();
        } else {
            this.showModal();
            this.startAutoSave();
        }
    }

    /**
     * Renderiza o formulário
     */
    async render() {
        const purchaseDate = new Date();
        const dateValue = purchaseDate.toISOString().split('T')[0];

        this.modal.innerHTML = `
            <div class="div-overlay" data-close-modal="modal-nova-compra"></div>
            <div class="modal-content-nova-compra" id="modal-content-nova-compra">
                <div class="header-modal">
                    <h2>Nova Compra</h2>
                    <i class="fa-solid fa-xmark fechar-modal" data-close-modal="modal-nova-compra" aria-label="Fechar modal"></i>
                </div>
                <div class="conteudo-modal">
                    <form id="form-nova-compra">
                        <!-- 1. Número da Nota Fiscal -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="text" id="compra-invoice-number" 
                                       required>
                                <label for="compra-invoice-number">Número da Nota Fiscal *</label>
                            </div>
                            <small class="form-text">Digite o número da nota fiscal</small>
                        </div>

                        <!-- 2. Fornecedor (Select Dinâmico) -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="compra-supplier-select">
                                    <option value="">Selecione o fornecedor...</option>
                                    ${this.suppliers.map(supplier => `
                                        <option value="${escapeHTML(supplier)}">${escapeHTML(supplier)}</option>
                                    `).join('')}
                                </select>
                                <label for="compra-supplier-select" class="${this.suppliers.length > 0 ? 'active' : ''}">Fornecedor *</label>
                            </div>
                            <small class="form-text">Selecione o fornecedor para filtrar insumos, ou escolha um insumo para selecionar automaticamente</small>
                        </div>

                        <!-- 3. Itens da Nota Fiscal -->
                        <div class="compra-items-section">
                            <div class="compra-items-header">
                                <h3>Itens da Nota Fiscal *</h3>
                                <button type="button" class="btn-adicionar-item" id="btn-adicionar-item">
                                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                                    <span>Adicionar Item</span>
                                </button>
                            </div>
                            
                            <!-- Formulário para adicionar item -->
                            <div class="compra-item-form-wrapper" id="compra-item-form-wrapper" style="display: none;">
                                <!-- Formulário será inserido aqui -->
                            </div>
                            
                            <!-- Lista de itens cadastrados -->
                            <div class="compra-items-cadastrados" id="compra-items-cadastrados">
                                <p class="compra-no-items" id="compra-no-items">Nenhum item adicionado. Clique em "Adicionar Item" para começar.</p>
                            </div>
                            
                            <!-- 4. Valor Total -->
                            <div class="compra-total-wrapper">
                                <div class="compra-total">
                                    <span class="total-label">Valor Total:</span>
                                    <span class="total-value" id="compra-total-value">R$ 0,00</span>
                                </div>
                            </div>
                        </div>

                        <!-- 5. Data da Compra -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="date" id="compra-purchase-date" 
                                       value="${dateValue}" required>
                                <label for="compra-purchase-date" class="active">Data da Compra *</label>
                            </div>
                            <small class="form-text">Selecione a data da compra</small>
                        </div>

                        <!-- 6. Forma de Pagamento -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="compra-payment-method">
                                    <option value="">Selecione...</option>
                                    <option value="money">Dinheiro</option>
                                    <option value="credit">Cartão de Crédito</option>
                                    <option value="debit">Cartão de Débito</option>
                                    <option value="pix">PIX</option>
                                </select>
                                <label for="compra-payment-method">Forma de Pagamento</label>
                            </div>
                            <small class="form-text">Selecione como foi realizado o pagamento (opcional)</small>
                        </div>

                        <!-- 7. Status do Pagamento -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="compra-payment-status">
                                    <option value="Pending" selected>Pendente</option>
                                    <option value="Paid">Pago</option>
                                </select>
                                <label for="compra-payment-status" class="active">Status do Pagamento</label>
                            </div>
                            <small class="form-text">Indique se o pagamento já foi realizado ou está pendente</small>
                        </div>

                        <!-- 8. Observações -->
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <textarea id="compra-notes" rows="3"></textarea>
                                <label for="compra-notes">Observações</label>
                            </div>
                            <small class="form-text">Informações adicionais sobre a compra (opcional)</small>
                        </div>
                    </form>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" data-close-modal="modal-nova-compra">Cancelar</button>
                    <button type="button" class="btn-salvar" id="btn-save-compra">
                        Salvar
                    </button>
                </div>
            </div>
        `;

        // Configurar event listeners do formulário
        this.setupFormListeners();
        
        // ALTERAÇÃO: Configurar listener do select de fornecedor
        this.setupSupplierListener();
        
        // Gerenciar estados dos inputs
        const inputs = this.modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        gerenciarInputsEspecificos(inputs);
        
        // ALTERAÇÃO: Configurar listeners para auto-save
        this.setupAutoSaveListeners();
    }

    /**
     * Configura listeners para auto-save
     * ALTERAÇÃO: Novo método para salvar automaticamente
     */
    setupAutoSaveListeners() {
        // Auto-save em mudanças de campos principais
        const invoiceInput = document.getElementById('compra-invoice-number');
        const supplierSelect = document.getElementById('compra-supplier-select');
        const dateInput = document.getElementById('compra-purchase-date');
        const paymentMethodSelect = document.getElementById('compra-payment-method');
        const paymentStatusSelect = document.getElementById('compra-payment-status');
        const notesTextarea = document.getElementById('compra-notes');

        const fields = [invoiceInput, supplierSelect, dateInput, paymentMethodSelect, paymentStatusSelect, notesTextarea];
        
        fields.forEach(field => {
            if (field) {
                field.addEventListener('change', () => {
                    this.saveDraft();
                });
            }
        });
    }

    /**
     * Configura listener do select de fornecedor
     * ALTERAÇÃO: Novo método para sincronizar fornecedor e insumos
     */
    setupSupplierListener() {
        const supplierSelect = document.getElementById('compra-supplier-select');
        if (!supplierSelect) return;

        supplierSelect.addEventListener('change', () => {
            const selectedSupplier = supplierSelect.value;
            
            if (selectedSupplier) {
                // Filtrar ingredientes pelo fornecedor selecionado
                this.filterIngredientsBySupplier(selectedSupplier);
            } else {
                // Restaurar todos os ingredientes
                this.filterIngredientsBySupplier(null);
            }

            // Atualizar select de insumos no formulário de item (se estiver aberto)
            this.updateIngredientSelectInForm();
        });
    }

    /**
     * Configura event listeners do formulário
     */
    setupFormListeners() {
        // ALTERAÇÃO: Usar delegação de eventos no modal para garantir funcionamento
        const modalContent = document.getElementById('modal-content-nova-compra');
        if (!modalContent) return;

        // ALTERAÇÃO: Remover listener anterior se existir
        if (this.modalClickHandler) {
            modalContent.removeEventListener('click', this.modalClickHandler);
        }

        // ALTERAÇÃO: Criar handler que será armazenado para posterior remoção
        this.modalClickHandler = (e) => {
            // Botão adicionar item
            if (e.target.closest('#btn-adicionar-item')) {
                e.preventDefault();
                e.stopPropagation();
                this.addItemToForm();
                return;
            }

            // Botão confirmar item (adicionar à lista)
            if (e.target.closest('.btn-confirmar-item')) {
                e.preventDefault();
                e.stopPropagation();
                const itemId = e.target.closest('.btn-confirmar-item').dataset.itemId;
                this.confirmItem(itemId);
                return;
            }

            // Botão remover item da lista
            if (e.target.closest('.btn-remover-item-lista')) {
                e.preventDefault();
                e.stopPropagation();
                const itemId = e.target.closest('.btn-remover-item-lista').dataset.itemId;
                this.removeItemFromList(itemId);
                return;
            }

            // Botão salvar
            if (e.target.closest('#btn-save-compra')) {
                e.preventDefault();
                e.stopPropagation();
                this.handleSubmit();
                return;
            }

            // Botão fechar modal
            const closeBtn = e.target.closest('[data-close-modal="modal-nova-compra"]');
            if (closeBtn) {
                e.preventDefault();
                e.stopPropagation();
                fecharModal('modal-nova-compra');
                return;
            }
        };

        // ALTERAÇÃO: Adicionar listener usando delegação de eventos
        modalContent.addEventListener('click', this.modalClickHandler);
    }

    /**
     * Adiciona formulário de novo item
     * ALTERAÇÃO: Renomeado de addItem para addItemToForm
     */
    addItemToForm() {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        // Verificar se já existe um formulário aberto
        if (formWrapper.style.display !== 'none') {
            showToast('Finalize o item atual antes de adicionar outro', { type: 'warning', title: 'Atenção' });
            return;
        }

        const itemIndex = this.items.length;
        const itemId = `item-${Date.now()}`; // ALTERAÇÃO: Usar timestamp para ID único

        const itemHTML = `
            <div class="compra-item-form" data-item-id="${itemId}">
                <h4>Novo Item</h4>
                <div class="compra-item-form-body">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select class="compra-item-ingredient" data-item-id="${itemId}" required>
                                <option value="">Selecione o insumo...</option>
                                ${this.filteredIngredients.map(ing => `
                                    <option value="${ing.id}" data-supplier="${escapeHTML(ing.supplier || '')}">${escapeHTML(ing.name || 'Insumo')}</option>
                                `).join('')}
                            </select>
                            <label class="${this.filteredIngredients.length > 0 ? 'active' : ''}">Insumo *</label>
                        </div>
                        <small class="form-text">Selecione o insumo que foi comprado</small>
                    </div>
                    
                    <!-- Informações automáticas do insumo -->
                    <div class="compra-item-info" data-item-id="${itemId}" style="display: none;">
                        <div class="compra-item-info-row">
                            <div class="compra-info-item">
                                <span class="info-label">Fornecedor:</span>
                                <span class="info-value compra-item-supplier" data-item-id="${itemId}">-</span>
                            </div>
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

        // Configurar event listeners do formulário
        this.setupFormItemListeners(itemId);

        // Gerenciar estados dos inputs
        const itemInputs = formWrapper.querySelectorAll('.div-input input, .div-input select');
        gerenciarInputsEspecificos(itemInputs);

        // Adicionar listener para cancelar
        const btnCancelar = formWrapper.querySelector('.btn-cancelar-item');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                formWrapper.innerHTML = '';
                formWrapper.style.display = 'none';
            });
        }
    }

    /**
     * Configura event listeners do formulário de item
     * ALTERAÇÃO: Novo método para configurar listeners do formulário
     */
    setupFormItemListeners(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        // Select de ingrediente
        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        if (ingredientSelect) {
            ingredientSelect.addEventListener('change', async () => {
                await this.onFormIngredientSelected(itemId);
            });
        }

        // Inputs de quantidade e preço com cálculo automático
        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        if (quantityInput && priceInput) {
            quantityInput.addEventListener('input', debounce(() => {
                this.calculateFormPriceFromQuantity(itemId);
            }, 300));

            priceInput.addEventListener('input', debounce(() => {
                this.calculateFormQuantityFromPrice(itemId);
            }, 300));
        }
    }

    /**
     * Busca informações do insumo no formulário
     * ALTERAÇÃO: Sincronizar fornecedor ao selecionar insumo
     */
    async onFormIngredientSelected(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;

        if (!ingredientId) {
            const infoDiv = formWrapper.querySelector('.compra-item-info');
            if (infoDiv) infoDiv.style.display = 'none';
            return;
        }

        try {
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();
            
            const cacheKey = `ingredient:${ingredientId}`;
            let ingredient = cacheManager.get(cacheKey);
            
            if (!ingredient) {
                ingredient = await getIngredientById(ingredientId);
                cacheManager.set(cacheKey, ingredient, 10 * 60 * 1000);
            }
            
            // Armazenar dados temporariamente
            formWrapper.dataset.ingredientData = JSON.stringify({
                id: ingredientId,
                name: ingredient.name,
                supplier: ingredient.supplier || 'Não informado',
                stock_unit: ingredient.stock_unit || 'un',
                price: ingredient.price || 0
            });

            // Exibir informações
            const infoDiv = formWrapper.querySelector('.compra-item-info');
            const supplierSpan = formWrapper.querySelector('.compra-item-supplier');
            const unitSpan = formWrapper.querySelector('.compra-item-unit');

            if (infoDiv) infoDiv.style.display = 'block';
            if (supplierSpan) supplierSpan.textContent = ingredient.supplier || 'Não informado';
            if (unitSpan) unitSpan.textContent = this.normalizeUnit(ingredient.stock_unit || 'un').toUpperCase();

            // ALTERAÇÃO: Sincronizar fornecedor bidirecional
            const supplierSelect = document.getElementById('compra-supplier-select');
            if (supplierSelect && ingredient.supplier && ingredient.supplier !== 'Não informado') {
                const currentSupplier = supplierSelect.value;
                
                // Se nenhum fornecedor selecionado, ou fornecedor diferente, atualizar
                if (!currentSupplier || currentSupplier !== ingredient.supplier) {
                    // Definir fornecedor no select
                    supplierSelect.value = ingredient.supplier;
                    const label = supplierSelect.closest('.div-input')?.querySelector('label');
                    if (label) label.classList.add('active');
                    
                    // Filtrar ingredientes pelo fornecedor
                    this.filterIngredientsBySupplier(ingredient.supplier);
                    
                    // Atualizar select de insumos
                    this.updateIngredientSelectInForm();
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') return;
            showToast('Erro ao carregar informações do insumo', { type: 'error', title: 'Erro' });
        }
    }

    /**
     * Atualiza select de insumos no formulário de item
     * ALTERAÇÃO: Novo método para atualizar select dinamicamente
     */
    updateIngredientSelectInForm() {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper || formWrapper.style.display === 'none') return;

        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        if (!ingredientSelect) return;

        const currentValue = ingredientSelect.value;

        // Reconstruir options
        const optionsHTML = `
            <option value="">Selecione o insumo...</option>
            ${this.filteredIngredients.map(ing => `
                <option value="${ing.id}" data-supplier="${escapeHTML(ing.supplier || '')}">${escapeHTML(ing.name || 'Insumo')}</option>
            `).join('')}
        `;

        ingredientSelect.innerHTML = optionsHTML;

        // Restaurar valor selecionado se ainda existir na lista filtrada
        if (currentValue) {
            const optionExists = this.filteredIngredients.some(ing => ing.id == currentValue);
            if (optionExists) {
                ingredientSelect.value = currentValue;
            } else {
                // Se o ingrediente não existe mais na lista filtrada, limpar seleção
                ingredientSelect.value = '';
                const label = ingredientSelect.closest('.div-input')?.querySelector('label');
                if (label) label.classList.remove('active');
                
                // Limpar informações do insumo
                const infoDiv = formWrapper.querySelector('.compra-item-info');
                if (infoDiv) infoDiv.style.display = 'none';
                formWrapper.dataset.ingredientData = '';
            }
        }

        // Atualizar gerenciamento de inputs
        gerenciarInputsEspecificos([ingredientSelect]);
    }

    /**
     * Calcula preço a partir da quantidade (formulário)
     * ALTERAÇÃO: Novo método para formulário
     */
    calculateFormPriceFromQuantity(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');
        
        if (!quantityInput || !priceInput) return;

        const quantity = parseFloat(quantityInput.value);
        if (isNaN(quantity) || quantity <= 0) return;

        const ingredientData = formWrapper.dataset.ingredientData;
        if (!ingredientData) return;

        try {
            const data = JSON.parse(ingredientData);
            if (data.price > 0) {
                const calculatedPrice = quantity * data.price;
                // ALTERAÇÃO: Preservar todas as casas decimais sem arredondamento
                priceInput.value = String(calculatedPrice);
                const label = priceInput.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }
        } catch (e) {
            // Ignorar erro de parse
        }
    }

    /**
     * Calcula quantidade a partir do preço (formulário)
     * ALTERAÇÃO: Novo método para formulário
     */
    calculateFormQuantityFromPrice(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');
        
        if (!quantityInput || !priceInput) return;

        const totalPrice = parseFloat(priceInput.value);
        if (isNaN(totalPrice) || totalPrice <= 0) return;

        const ingredientData = formWrapper.dataset.ingredientData;
        if (!ingredientData) return;

        try {
            const data = JSON.parse(ingredientData);
            if (data.price > 0) {
                const calculatedQuantity = totalPrice / data.price;
                // ALTERAÇÃO: Preservar todas as casas decimais sem arredondamento
                quantityInput.value = String(calculatedQuantity);
                const label = quantityInput.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }
        } catch (e) {
            // Ignorar erro de parse
        }
    }

    /**
     * Confirma o item e adiciona à lista
     * ALTERAÇÃO: Novo método para confirmar item
     */
    confirmItem(itemId) {
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (!formWrapper) return;

        // Validar campos
        const ingredientSelect = formWrapper.querySelector('.compra-item-ingredient');
        const quantityInput = formWrapper.querySelector('.compra-item-quantity');
        const priceInput = formWrapper.querySelector('.compra-item-price');

        const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;
        const quantity = quantityInput ? parseFloat(quantityInput.value) : null;
        const totalPrice = priceInput ? parseFloat(priceInput.value) : null;

        if (!ingredientId) {
            showToast('Selecione um insumo', { type: 'error', title: 'Erro' });
            ingredientSelect?.focus();
            return;
        }

        if (!quantity || quantity <= 0) {
            showToast('Informe a quantidade', { type: 'error', title: 'Erro' });
            quantityInput?.focus();
            return;
        }

        if (!totalPrice || totalPrice <= 0) {
            showToast('Informe o valor total', { type: 'error', title: 'Erro' });
            priceInput?.focus();
            return;
        }

        // Obter dados do ingrediente
        let ingredientData = null;
        try {
            ingredientData = JSON.parse(formWrapper.dataset.ingredientData || '{}');
        } catch (e) {
            showToast('Erro ao processar dados do insumo', { type: 'error', title: 'Erro' });
            return;
        }

        // Adicionar à lista de itens
        const item = {
            id: itemId,
            ingredient_id: ingredientId,
            ingredient_data: ingredientData,
            quantity: quantity,
            total_price: totalPrice,
            unit_price: totalPrice / quantity
        };

        this.items.push(item);

        // Renderizar na lista
        this.renderItemInList(item);

        // Limpar formulário
        formWrapper.innerHTML = '';
        formWrapper.style.display = 'none';

        // Atualizar total
        this.updateGrandTotal();

        // ALTERAÇÃO: Salvar rascunho após adicionar item
        this.saveDraft();

        showToast('Item adicionado com sucesso!', { type: 'success', title: 'Sucesso' });
    }

    /**
     * Renderiza item na lista de itens cadastrados
     * ALTERAÇÃO: Novo método para renderizar item na lista
     */
    renderItemInList(item) {
        const itemsList = document.getElementById('compra-items-cadastrados');
        const noItemsMsg = document.getElementById('compra-no-items');
        
        if (!itemsList) return;

        // Esconder mensagem de "sem itens"
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
                    <button type="button" class="btn-remover-item-lista" data-item-id="${item.id}" aria-label="Remover item">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
            </div>
        `;

        itemsList.insertAdjacentHTML('beforeend', itemHTML);
    }

    /**
     * Remove item da lista
     * ALTERAÇÃO: Novo método para remover item da lista
     */
    removeItemFromList(itemId) {
        const itemElement = document.querySelector(`.compra-item-cadastrado[data-item-id="${itemId}"]`);
        if (itemElement) {
            itemElement.remove();
        }

        this.items = this.items.filter(item => item.id !== itemId);

        // Mostrar mensagem se vazio
        const itemsList = document.getElementById('compra-items-cadastrados');
        const noItemsMsg = document.getElementById('compra-no-items');
        if (itemsList && this.items.length === 0 && noItemsMsg) {
            noItemsMsg.style.display = 'block';
        }

        // Atualizar total
        this.updateGrandTotal();

        // ALTERAÇÃO: Salvar rascunho após remover item
        this.saveDraft();

        showToast('Item removido', { type: 'info', title: 'Info' });
    }


    /**
     * Salva rascunho no localStorage
     * ALTERAÇÃO: Novo método para persistir dados
     */
    saveDraft() {
        try {
            const draft = {
                invoiceNumber: document.getElementById('compra-invoice-number')?.value || '',
                supplier: document.getElementById('compra-supplier-select')?.value || '',
                purchaseDate: document.getElementById('compra-purchase-date')?.value || '',
                paymentMethod: document.getElementById('compra-payment-method')?.value || '',
                paymentStatus: document.getElementById('compra-payment-status')?.value || 'Pending',
                notes: document.getElementById('compra-notes')?.value || '',
                items: this.items.map(item => ({
                    id: item.id,
                    ingredient_id: item.ingredient_id,
                    ingredient_data: item.ingredient_data,
                    quantity: item.quantity,
                    total_price: item.total_price,
                    unit_price: item.unit_price
                })),
                selectedSupplier: this.selectedSupplier,
                timestamp: new Date().toISOString()
            };

            localStorage.setItem(this.draftKey, JSON.stringify(draft));
        } catch (error) {
            // Ignorar erros de localStorage (quota exceeded, etc)
        }
    }

    /**
     * Carrega rascunho do localStorage
     * ALTERAÇÃO: Novo método para recuperar dados salvos
     */
    loadDraft() {
        try {
            const draftStr = localStorage.getItem(this.draftKey);
            if (!draftStr) return false;

            const draft = JSON.parse(draftStr);

            // Preencher campos do formulário
            const invoiceInput = document.getElementById('compra-invoice-number');
            if (invoiceInput && draft.invoiceNumber) {
                invoiceInput.value = draft.invoiceNumber;
                const label = invoiceInput.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }

            const supplierSelect = document.getElementById('compra-supplier-select');
            if (supplierSelect && draft.supplier) {
                supplierSelect.value = draft.supplier;
                const label = supplierSelect.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
                
                // Aplicar filtro de fornecedor
                this.filterIngredientsBySupplier(draft.supplier);
            }

            const dateInput = document.getElementById('compra-purchase-date');
            if (dateInput && draft.purchaseDate) {
                dateInput.value = draft.purchaseDate;
            }

            const paymentMethodSelect = document.getElementById('compra-payment-method');
            if (paymentMethodSelect && draft.paymentMethod) {
                paymentMethodSelect.value = draft.paymentMethod;
                const label = paymentMethodSelect.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }

            const paymentStatusSelect = document.getElementById('compra-payment-status');
            if (paymentStatusSelect && draft.paymentStatus) {
                paymentStatusSelect.value = draft.paymentStatus;
            }

            const notesTextarea = document.getElementById('compra-notes');
            if (notesTextarea && draft.notes) {
                notesTextarea.value = draft.notes;
                const label = notesTextarea.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }

            // Restaurar itens
            if (draft.items && draft.items.length > 0) {
                this.items = draft.items;
                
                // Renderizar itens na lista
                const itemsList = document.getElementById('compra-items-cadastrados');
                const noItemsMsg = document.getElementById('compra-no-items');
                
                if (itemsList && noItemsMsg) {
                    noItemsMsg.style.display = 'none';
                    
                    draft.items.forEach(item => {
                        this.renderItemInList(item);
                    });
                }

                // Atualizar total
                this.updateGrandTotal();
            }

            return true;
        } catch (error) {
            // Em caso de erro, limpar rascunho corrompido
            this.clearDraft();
            return false;
        }
    }

    /**
     * Verifica se existe rascunho salvo
     * ALTERAÇÃO: Novo método para verificar localStorage
     */
    hasDraft() {
        try {
            const draft = localStorage.getItem(this.draftKey);
            return draft !== null && draft !== '';
        } catch (error) {
            return false;
        }
    }

    /**
     * Limpa rascunho do localStorage
     * ALTERAÇÃO: Novo método para limpar dados salvos
     */
    clearDraft() {
        try {
            localStorage.removeItem(this.draftKey);
        } catch (error) {
            // Ignorar erros
        }
    }

    /**
     * Mostra confirmação para carregar rascunho
     * ALTERAÇÃO: Novo método para perguntar ao usuário
     */
    showDraftConfirmation() {
        const draftStr = localStorage.getItem(this.draftKey);
        if (!draftStr) {
            this.showModal();
            this.startAutoSave();
            return;
        }

        try {
            const draft = JSON.parse(draftStr);
            const timestamp = new Date(draft.timestamp);
            const timeAgo = this.getTimeAgo(timestamp);

            // Criar modal de confirmação
            const confirmHTML = `
                <div class="draft-confirmation-overlay" id="draft-confirmation-overlay">
                    <div class="draft-confirmation-modal">
                        <div class="draft-confirmation-header">
                            <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
                            <h3>Rascunho Encontrado</h3>
                        </div>
                        <div class="draft-confirmation-body">
                            <p>Foi encontrado um rascunho salvo automaticamente ${timeAgo}.</p>
                            <div class="draft-info">
                                <div class="draft-info-item">
                                    <span class="draft-label">Nota Fiscal:</span>
                                    <span class="draft-value">${escapeHTML(draft.invoiceNumber || 'Não informado')}</span>
                                </div>
                                <div class="draft-info-item">
                                    <span class="draft-label">Fornecedor:</span>
                                    <span class="draft-value">${escapeHTML(draft.supplier || 'Não informado')}</span>
                                </div>
                                <div class="draft-info-item">
                                    <span class="draft-label">Itens:</span>
                                    <span class="draft-value">${draft.items?.length || 0} item(ns)</span>
                                </div>
                            </div>
                            <p class="draft-question">Deseja continuar de onde parou?</p>
                        </div>
                        <div class="draft-confirmation-actions">
                            <button type="button" class="btn-draft-discard" id="btn-draft-discard">
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                                Descartar
                            </button>
                            <button type="button" class="btn-draft-load" id="btn-draft-load">
                                <i class="fa-solid fa-check" aria-hidden="true"></i>
                                Continuar
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', confirmHTML);

            // Event listeners
            const btnLoad = document.getElementById('btn-draft-load');
            const btnDiscard = document.getElementById('btn-draft-discard');
            const overlay = document.getElementById('draft-confirmation-overlay');

            if (btnLoad) {
                btnLoad.addEventListener('click', () => {
                    overlay.remove();
                    this.showModal();
                    this.loadDraft();
                    this.startAutoSave();
                    showToast('Rascunho carregado com sucesso!', { type: 'success', title: 'Sucesso' });
                });
            }

            if (btnDiscard) {
                btnDiscard.addEventListener('click', () => {
                    this.clearDraft();
                    overlay.remove();
                    this.showModal();
                    this.startAutoSave();
                    showToast('Rascunho descartado', { type: 'info', title: 'Info' });
                });
            }
        } catch (error) {
            // Em caso de erro, limpar e abrir modal normalmente
            this.clearDraft();
            this.showModal();
            this.startAutoSave();
        }
    }

    /**
     * Retorna tempo decorrido em formato legível
     * ALTERAÇÃO: Novo método auxiliar
     */
    getTimeAgo(date) {
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'há poucos segundos';
        if (minutes === 1) return 'há 1 minuto';
        if (minutes < 60) return `há ${minutes} minutos`;
        if (hours === 1) return 'há 1 hora';
        if (hours < 24) return `há ${hours} horas`;
        if (days === 1) return 'há 1 dia';
        return `há ${days} dias`;
    }

    /**
     * Inicia auto-save periódico
     * ALTERAÇÃO: Novo método para salvar periodicamente
     */
    startAutoSave() {
        // Limpar intervalo anterior se existir
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
        }

        // Salvar a cada 30 segundos
        this.autoSaveInterval = setInterval(() => {
            this.saveDraft();
        }, 30000);
    }

    /**
     * Para auto-save periódico
     * ALTERAÇÃO: Novo método para parar salvamento
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Converte unidades de medida para unidade padrão
     * @param {number} quantity - Quantidade
     * @param {string} fromUnit - Unidade de origem (g, kg, L, ml, un)
     * @param {string} toUnit - Unidade de destino (g, kg, L, ml, un)
     * @returns {number} Quantidade convertida
     */
    convertUnit(quantity, fromUnit, toUnit) {
        if (!fromUnit || !toUnit || !quantity || quantity === 0) {
            return quantity;
        }

        const from = this.normalizeUnit(fromUnit);
        const to = this.normalizeUnit(toUnit);

        if (from === to) {
            return quantity;
        }

        // Conversões de peso: kg ↔ g
        if (from === 'kg' && to === 'g') {
            return quantity * 1000; // kg para g
        } else if (from === 'g' && to === 'kg') {
            return quantity / 1000; // g para kg
        }

        // Conversões de volume: L ↔ ml
        if (from === 'l' && to === 'ml') {
            return quantity * 1000; // L para ml
        } else if (from === 'ml' && to === 'l') {
            return quantity / 1000; // ml para L
        }

        // Unidades não conversíveis (diferentes tipos) retornam o valor original
        // (ex: un para kg não faz sentido, manter original)
        // Mesmo tipo mas conversão não aplicável (ex: kg para un) retorna original
        return quantity;
    }

    /**
     * Normaliza unidade para formato padrão
     * @param {string} unit - Unidade
     * @returns {string} Unidade normalizada
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
     * Atualiza total geral da compra
     * ALTERAÇÃO: Simplificado para usar diretamente this.items
     */
    updateGrandTotal() {
        const total = this.items.reduce((sum, item) => {
            return sum + (item.total_price || 0);
        }, 0);

        const totalElement = document.getElementById('compra-total-value');
        if (totalElement) {
            // ALTERAÇÃO: Usar formatCurrency para arredondar valores monetários para 2 casas decimais
            totalElement.textContent = `R$ ${this.formatCurrency(total)}`;
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
     * Valida formulário antes de submeter
     * ALTERAÇÃO: Validar fornecedor do select
     * @returns {boolean} True se válido
     */
    validateForm() {
        // Validar campos obrigatórios
        const invoiceNumber = document.getElementById('compra-invoice-number')?.value.trim();
        const supplierSelect = document.getElementById('compra-supplier-select')?.value.trim();

        if (!invoiceNumber) {
            showToast('Número da nota fiscal é obrigatório', { type: 'error', title: 'Erro' });
            document.getElementById('compra-invoice-number')?.focus();
            return false;
        }

        if (!supplierSelect) {
            showToast('Selecione um fornecedor', { type: 'error', title: 'Erro' });
            document.getElementById('compra-supplier-select')?.focus();
            return false;
        }

        // Validar itens
        if (this.items.length === 0) {
            showToast('Adicione pelo menos um item à nota fiscal', { type: 'error', title: 'Erro' });
            return false;
        }

        return true;
    }

    /**
     * Submete o formulário
     */
    async handleSubmit() {
        if (!this.validateForm()) {
            return;
        }

        // Coletar dados do formulário
        const invoiceNumber = document.getElementById('compra-invoice-number').value.trim();
        const supplierName = document.getElementById('compra-supplier-select').value.trim();
        const purchaseDate = document.getElementById('compra-purchase-date').value;
        const paymentMethod = document.getElementById('compra-payment-method').value || null;
        const paymentStatus = document.getElementById('compra-payment-status').value;
        const notes = document.getElementById('compra-notes').value.trim() || null;

        // Calcular total usando preço total dos itens
        let totalAmount = 0;
        const validItems = [];
        
        // ALTERAÇÃO: Usar for...of ao invés de forEach para permitir throw adequado
        for (const item of this.items) {
            const displayQuantity = item.quantity || 0;
            const totalPrice = item.total_price || 0;
            const stockUnit = item.ingredient_data?.stock_unit || 'un';
            
            // ALTERAÇÃO: Converter quantidade da unidade de exibição para unidade base antes de salvar
            // ALTERAÇÃO CRÍTICA: Não deve converter quando unidade compra = unidade insumo
            // O banco armazena na mesma unidade do ingrediente (ex: se stock_unit = 'kg', armazena em kg)
            const baseQuantity = this.convertQuantityToBase(displayQuantity, stockUnit);
            
            // ALTERAÇÃO: Validar quantidade e preço antes de calcular unit_price
            if (baseQuantity <= 0) {
                showToast(`Quantidade inválida para o item ${item.ingredient_data?.name || 'desconhecido'}`, { 
                    type: 'error', 
                    title: 'Erro' 
                });
                throw new Error('Quantidade inválida');
            }
            
            if (totalPrice <= 0) {
                showToast(`Preço total inválido para o item ${item.ingredient_data?.name || 'desconhecido'}`, { 
                    type: 'error', 
                    title: 'Erro' 
                });
                throw new Error('Preço total inválido');
            }
            
            // ALTERAÇÃO: Calcular unit_price na unidade de exibição (kg/L), não na unidade base (g/ml)
            // Isso evita valores muito pequenos (ex: 0.0399 por grama) que são arredondados incorretamente
            let unitPrice = totalPrice / displayQuantity;
            
            // ALTERAÇÃO: Validar que unit_price é válido (> 0) após cálculo
            if (unitPrice <= 0 || !isFinite(unitPrice)) {
                const itemName = item.ingredient_data?.name || 'desconhecido';
                showToast(
                    `Erro ao calcular preço unitário para o item ${itemName}. ` +
                    `Verifique quantidade e valor total.`, 
                    { 
                        type: 'error', 
                        title: 'Erro' 
                    }
                );
                throw new Error('Preço unitário inválido');
            }
            
            // ALTERAÇÃO: Validar valor mínimo (0.01 para permitir valores monetários válidos)
            // unit_price agora está na unidade de exibição, então valores mínimos são maiores
            if (unitPrice < 0.01) {
                const itemName = item.ingredient_data?.name || 'este item';
                const quantityDisplay = this.formatQuantity(displayQuantity, stockUnit);
                const minTotal = (0.01 * displayQuantity).toFixed(2);
                const currentTotal = totalPrice.toFixed(2);
                
                showToast(
                    `O preço unitário para "${itemName}" é muito pequeno. ` +
                    `Para ${quantityDisplay}, o valor total deve ser pelo menos R$ ${minTotal}. ` +
                    `Valor atual: R$ ${currentTotal}.`, 
                    { 
                        type: 'error', 
                        title: 'Valor unitário muito pequeno',
                        duration: 10000
                    }
                );
                throw new Error('Preço unitário muito pequeno');
            }
            
            totalAmount += totalPrice;
            
            validItems.push({
                ingredient_id: item.ingredient_id,
                quantity: baseQuantity, // ALTERAÇÃO: Salvar na unidade base (2000g)
                // ALTERAÇÃO: Enviar quantidade de exibição (2kg) para cálculo correto no backend
                display_quantity: displayQuantity,
                // ALTERAÇÃO: Enviar unidade do ingrediente para referência
                stock_unit: stockUnit,
                // ALTERAÇÃO: Enviar unit_price na unidade de exibição (39.90 por kg)
                unit_price: unitPrice,
                // ALTERAÇÃO: Enviar total_price exato (79.80)
                total_price: totalPrice
            });
        }

        const formData = {
            invoice_number: invoiceNumber,
            supplier_name: supplierName,
            total_amount: totalAmount,
            purchase_date: formatDateForAPI(purchaseDate),
            payment_method: paymentMethod,
            payment_status: paymentStatus,
            items: validItems,
            notes: notes
        };

        // Se pagamento é "Pago", adicionar payment_date
        if (paymentStatus === 'Paid') {
            formData.payment_date = formatDateForAPI(purchaseDate);
        }

        try {
            await createPurchaseInvoice(formData);

            showToast('Compra registrada com sucesso!', { 
                type: 'success',
                title: 'Sucesso'
            });

            // ALTERAÇÃO: Limpar rascunho após sucesso
            this.clearDraft();
            this.stopAutoSave();

            // Fechar modal
            fecharModal('modal-nova-compra');

            // Resetar formulário
            this.resetForm();

            // Chamar callback de sucesso
            if (this.onSuccess) {
                this.onSuccess();
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            const errorMessage = error.message || 'Erro ao registrar compra';
            showToast(errorMessage, { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Reseta o formulário
     * ALTERAÇÃO: Parar auto-save ao resetar
     */
    resetForm() {
        this.items = [];
        this.selectedSupplier = null;
        this.filteredIngredients = [...this.ingredients];
        
        // ALTERAÇÃO: Parar auto-save
        this.stopAutoSave();
        
        // ALTERAÇÃO: Cancelar requisições pendentes ao resetar
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        // ALTERAÇÃO: Remover event listeners ao resetar
        this.cleanupEventListeners();
        const form = document.getElementById('form-nova-compra');
        if (form) {
            form.reset();
        }

        // Limpar formulário de item se estiver aberto
        const formWrapper = document.getElementById('compra-item-form-wrapper');
        if (formWrapper) {
            formWrapper.innerHTML = '';
            formWrapper.style.display = 'none';
        }

        // Limpar lista de itens cadastrados
        const itemsList = document.getElementById('compra-items-cadastrados');
        const noItemsMsg = document.getElementById('compra-no-items');
        if (itemsList) {
            itemsList.innerHTML = '';
            if (noItemsMsg) {
                itemsList.appendChild(noItemsMsg);
                noItemsMsg.style.display = 'block';
            }
        }

        // Resetar total
        this.updateGrandTotal();
    }

    /**
     * Remove todos os event listeners registrados
     * ALTERAÇÃO: Método para cleanup adequado de event listeners
     */
    cleanupEventListeners() {
        // ALTERAÇÃO: Remover listener do modal
        if (this.modalClickHandler) {
            const modalContent = document.getElementById('modal-content-nova-compra');
            if (modalContent) {
                modalContent.removeEventListener('click', this.modalClickHandler);
            }
            this.modalClickHandler = null;
        }

        // ALTERAÇÃO: Remover listeners de itens individuais
        for (const [key, { element, event, handler }] of this.eventListeners.entries()) {
            if (element && typeof handler === 'function') {
                element.removeEventListener(event, handler);
            }
        }
        this.eventListeners.clear();
    }

    /**
     * Exibe o modal
     */
    showModal() {
        abrirModal('modal-nova-compra');
    }

    /**
     * Destroi a instância e limpa recursos
     * ALTERAÇÃO: Parar auto-save ao destruir
     */
    destroy() {
        this.stopAutoSave();
        this.cleanupEventListeners();
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.items = [];
        this.ingredients = [];
        this.onSuccess = null;
    }
}
