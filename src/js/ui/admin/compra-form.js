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
        this.ingredients = [];
        this.items = []; // Lista de itens da nota fiscal
        this.onSuccess = null;
        this.abortController = null; // Para cancelar requisições pendentes
        this.eventListeners = new Map(); // Para cleanup de event listeners
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
     */
    async loadIngredients() {
        // ALTERAÇÃO: Usar cache para evitar chamadas API duplicadas
        const cacheKey = 'ingredients:active:1000';
        const cached = cacheManager.get(cacheKey);
        
        if (cached) {
            this.ingredients = cached;
            return;
        }

        try {
            const response = await getIngredients({ page_size: 1000, status: 'active' });
            this.ingredients = response.items || response || [];
            // ALTERAÇÃO: Cache por 5 minutos
            cacheManager.set(cacheKey, this.ingredients, 5 * 60 * 1000);
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro será tratado pelo usuário se necessário
            this.ingredients = [];
        }
    }

    /**
     * Abre modal para nova compra
     * @param {Function} onSuccess - Callback chamado após sucesso
     */
    async openNew(onSuccess = null) {
        this.items = [];
        this.onSuccess = onSuccess;
        await this.render();
        this.showModal();
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
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="text" id="compra-invoice-number" 
                                       required>
                                <label for="compra-invoice-number">Número da Nota Fiscal *</label>
                            </div>
                            <small class="form-text">Digite o número da nota fiscal</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="text" id="compra-supplier-name" 
                                       required>
                                <label for="compra-supplier-name">Fornecedor *</label>
                            </div>
                            <small class="form-text">Digite o nome do fornecedor</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="date" id="compra-purchase-date" 
                                       value="${dateValue}" required>
                                <label for="compra-purchase-date" class="active">Data da Compra *</label>
                            </div>
                            <small class="form-text">Selecione a data da compra</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="compra-payment-method">
                                    <option value="">Selecione...</option>
                                    <option value="money">Dinheiro</option>
                                    <option value="credit">Cartão de Crédito</option>
                                    <option value="debit">Cartão de Débito</option>
                                    <option value="pix">PIX</option>
                                </select>
                                <label for="compra-payment-method">Método de Pagamento</label>
                            </div>
                            <small class="form-text">Selecione como foi realizado o pagamento (opcional)</small>
                        </div>

                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <select id="compra-payment-status">
                                    <option value="Pending" selected>Pendente</option>
                                    <option value="Paid">Pago</option>
                                </select>
                                <label for="compra-payment-status" class="active">Status de Pagamento</label>
                            </div>
                            <small class="form-text">Indique se o pagamento já foi realizado ou está pendente</small>
                        </div>

                        <!-- Itens da Nota Fiscal -->
                        <div class="compra-items-section">
                            <div class="compra-items-header">
                                <h3>Itens da Nota Fiscal *</h3>
                                <button type="button" class="btn-adicionar-item" id="btn-adicionar-item">
                                    <i class="fa-solid fa-plus" aria-hidden="true"></i>
                                    <span>Adicionar Item</span>
                                </button>
                            </div>
                            <div class="compra-items-list" id="compra-items-list">
                                <!-- Itens serão adicionados dinamicamente -->
                                <p class="compra-no-items" id="compra-no-items">Nenhum item adicionado. Clique em "Adicionar Item" para começar.</p>
                            </div>
                            <div class="compra-total-wrapper">
                                <div class="compra-total">
                                    <span class="total-label">Total:</span>
                                    <span class="total-value" id="compra-total-value">R$ 0,00</span>
                                </div>
                            </div>
                        </div>

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
        
        // Gerenciar estados dos inputs
        const inputs = this.modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        gerenciarInputsEspecificos(inputs);

        // Adicionar primeiro item automaticamente
        this.addItem();
    }

    /**
     * Configura event listeners do formulário
     */
    setupFormListeners() {
        // Botão adicionar item
        const btnAdicionarItem = document.getElementById('btn-adicionar-item');
        if (btnAdicionarItem) {
            btnAdicionarItem.addEventListener('click', () => {
                this.addItem();
            });
        }

        // Botão salvar
        const btnSave = document.getElementById('btn-save-compra');
        if (btnSave) {
            btnSave.addEventListener('click', () => {
                this.handleSubmit();
            });
        }
    }

    /**
     * Adiciona um novo item à lista
     */
    addItem() {
        const itemsList = document.getElementById('compra-items-list');
        const noItemsMsg = document.getElementById('compra-no-items');
        if (!itemsList) return;

        const itemIndex = this.items.length;
        const itemId = `item-${itemIndex}`;

        this.items.push({
            id: itemId,
            ingredient_id: null,
            ingredient_data: null, // Dados completos do insumo (fornecedor, unidade, preço de referência)
            quantity: null,
            total_price: null, // Preço total (não unitário)
            unit_price: null, // Calculado automaticamente para o backend
            isCalculating: false // Flag para prevenir loops de cálculo
        });

        if (noItemsMsg) {
            noItemsMsg.style.display = 'none';
        }

        const itemHTML = `
            <div class="compra-item" data-item-id="${itemId}">
                <div class="compra-item-header">
                    <h4>Item ${itemIndex + 1}</h4>
                    <button type="button" class="btn-remover-item" data-item-id="${itemId}" aria-label="Remover item">
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="compra-item-body">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select class="compra-item-ingredient" data-item-id="${itemId}" required>
                                <option value="">Selecione o insumo...</option>
                                ${this.ingredients.map(ing => `
                                    <option value="${ing.id}">${escapeHTML(ing.name || 'Insumo')}</option>
                                `).join('')}
                            </select>
                            <label for="${itemId}-ingredient" class="">Insumo *</label>
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
                                <span class="info-label">Unidade padrão:</span>
                                <span class="info-value compra-item-unit" data-item-id="${itemId}">-</span>
                            </div>
                            <div class="compra-info-item" style="display: none;">
                                <span class="info-label">Preço de referência:</span>
                                <span class="info-value compra-item-ref-price" data-item-id="${itemId}">-</span>
                            </div>
                        </div>
                    </div>

                    <div class="compra-item-row">
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-quantity" 
                                       data-item-id="${itemId}" 
                                       step="0.001" 
                                       min="0">
                                <label for="${itemId}-quantity" class="">Quantidade</label>
                            </div>
                            <small class="form-text">Quantidade comprada (informe quantidade OU valor total)</small>
                        </div>
                        <div class="form-field-wrapper">
                            <div class="div-input">
                                <input type="number" class="compra-item-price" 
                                       data-item-id="${itemId}" 
                                       step="0.01" 
                                       min="0">
                                <label for="${itemId}-price" class="">Preço Total (R$)</label>
                            </div>
                            <small class="form-text">Valor total gasto (informe quantidade OU valor total)</small>
                        </div>
                    </div>
                </div>
            </div>
        `;

        itemsList.insertAdjacentHTML('beforeend', itemHTML);

        // Configurar event listeners do item
        this.setupItemListeners(itemId);

        // Gerenciar estados dos inputs do item
        const itemElement = itemsList.querySelector(`[data-item-id="${itemId}"]`);
        const itemInputs = itemElement.querySelectorAll('.div-input input, .div-input select');
        gerenciarInputsEspecificos(itemInputs);
    }

    /**
     * Configura event listeners de um item
     * @param {string} itemId - ID do item
     */
    setupItemListeners(itemId) {
        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!itemElement) return;

        // Botão remover
        const btnRemover = itemElement.querySelector('.btn-remover-item');
        if (btnRemover) {
            btnRemover.addEventListener('click', () => {
                this.removeItem(itemId);
            });
        }

        // Atualizar quando ingrediente for selecionado
        const ingredientSelect = itemElement.querySelector('.compra-item-ingredient');
        if (ingredientSelect) {
            ingredientSelect.addEventListener('change', async () => {
                await this.onIngredientSelected(itemId);
            });
        }

        // Atualizar total quando quantidade ou preço mudarem (cálculo dinâmico)
        const quantityInput = itemElement.querySelector('.compra-item-quantity');
        const priceInput = itemElement.querySelector('.compra-item-price');

        // ALTERAÇÃO: Debounce para melhorar performance em digitação rápida
        if (quantityInput) {
            const debouncedHandler = debounce(() => {
                if (!this.items.find(i => i.id === itemId)?.isCalculating) {
                    this.calculatePriceFromQuantity(itemId);
                }
            }, 300);
            
            quantityInput.addEventListener('input', debouncedHandler);
            // ALTERAÇÃO: Armazenar listener para cleanup
            const listenerKey = `${itemId}:quantity:input`;
            this.eventListeners.set(listenerKey, { element: quantityInput, event: 'input', handler: debouncedHandler });
        }

        if (priceInput) {
            const debouncedHandler = debounce(() => {
                if (!this.items.find(i => i.id === itemId)?.isCalculating) {
                    this.calculateQuantityFromPrice(itemId);
                }
            }, 300);
            
            priceInput.addEventListener('input', debouncedHandler);
            // ALTERAÇÃO: Armazenar listener para cleanup
            const listenerKey = `${itemId}:price:input`;
            this.eventListeners.set(listenerKey, { element: priceInput, event: 'input', handler: debouncedHandler });
        }
    }

    /**
     * Remove um item da lista
     * @param {string} itemId - ID do item
     */
    removeItem(itemId) {
        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (itemElement) {
            itemElement.remove();
        }

        this.items = this.items.filter(item => item.id !== itemId);

        // Atualizar índices e mostrar mensagem se vazio
        this.updateItemIndices();
        this.updateGrandTotal();

        const itemsList = document.getElementById('compra-items-list');
        const noItemsMsg = document.getElementById('compra-no-items');
        if (itemsList && this.items.length === 0 && noItemsMsg) {
            noItemsMsg.style.display = 'block';
        }
    }

    /**
     * Atualiza índices dos itens na exibição
     */
    updateItemIndices() {
        const items = document.querySelectorAll('.compra-item');
        items.forEach((item, index) => {
            const header = item.querySelector('.compra-item-header h4');
            if (header) {
                header.textContent = `Item ${index + 1}`;
            }
        });
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
     * Busca e exibe informações do insumo quando selecionado
     * @param {string} itemId - ID do item
     */
    async onIngredientSelected(itemId) {
        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!itemElement) return;

        const ingredientSelect = itemElement.querySelector('.compra-item-ingredient');
        const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;

        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        if (!ingredientId) {
            // Limpar informações se nenhum insumo selecionado
            const infoDiv = itemElement.querySelector('.compra-item-info');
            if (infoDiv) {
                infoDiv.style.display = 'none';
            }
            item.ingredient_id = null;
            item.ingredient_data = null;
            return;
        }

        try {
            // ALTERAÇÃO: Cancelar requisições anteriores para o mesmo item
            if (this.abortController) {
                this.abortController.abort();
            }
            this.abortController = new AbortController();
            
            // ALTERAÇÃO: Usar cache para informações de ingrediente
            const cacheKey = `ingredient:${ingredientId}`;
            let ingredient = cacheManager.get(cacheKey);
            
            if (!ingredient) {
                ingredient = await getIngredientById(ingredientId);
                // ALTERAÇÃO: Cache por 10 minutos (dados de ingrediente mudam pouco)
                cacheManager.set(cacheKey, ingredient, 10 * 60 * 1000);
            }
            
            item.ingredient_id = ingredientId;
            item.ingredient_data = {
                name: ingredient.name,
                supplier: ingredient.supplier || 'Não informado',
                stock_unit: ingredient.stock_unit || 'un',
                base_portion_unit: ingredient.base_portion_unit || ingredient.stock_unit || 'un',
                price: ingredient.price || 0 // Preço de referência
            };

            // Exibir informações do insumo
            const infoDiv = itemElement.querySelector('.compra-item-info');
            const supplierSpan = itemElement.querySelector('.compra-item-supplier');
            const unitSpan = itemElement.querySelector('.compra-item-unit');
            const refPriceSpan = itemElement.querySelector('.compra-item-ref-price');

            if (infoDiv) {
                infoDiv.style.display = 'block';
            }

            if (supplierSpan) {
                supplierSpan.textContent = item.ingredient_data.supplier;
            }

            if (unitSpan) {
                const unit = this.normalizeUnit(item.ingredient_data.stock_unit);
                unitSpan.textContent = unit.toUpperCase();
            }

            if (refPriceSpan && item.ingredient_data.price > 0) {
                refPriceSpan.textContent = `R$ ${this.formatCurrency(item.ingredient_data.price)} / ${this.normalizeUnit(item.ingredient_data.stock_unit).toUpperCase()}`;
                refPriceSpan.closest('.compra-info-item').style.display = 'block';
            } else if (refPriceSpan) {
                refPriceSpan.closest('.compra-info-item').style.display = 'none';
            }

            // Preencher fornecedor principal automaticamente se estiver vazio
            const supplierInput = document.getElementById('compra-supplier-name');
            if (supplierInput && !supplierInput.value.trim() && item.ingredient_data.supplier && item.ingredient_data.supplier !== 'Não informado' && item.ingredient_data.supplier.trim() !== '') {
                supplierInput.value = item.ingredient_data.supplier;
                // Atualizar label
                const label = supplierInput.closest('.div-input')?.querySelector('label');
                if (label) label.classList.add('active');
            }
        } catch (error) {
            // ALTERAÇÃO: Ignorar erros de abort (cancelamento de requisição)
            if (error.name === 'AbortError') {
                return;
            }
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar informações do insumo', {
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Calcula preço total baseado na quantidade informada
     * @param {string} itemId - ID do item
     */
    calculatePriceFromQuantity(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item || !item.ingredient_data || item.isCalculating) return;

        // Prevenir loops
        item.isCalculating = true;

        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!itemElement) {
            item.isCalculating = false;
            return;
        }

        const quantityInput = itemElement.querySelector('.compra-item-quantity');
        const priceInput = itemElement.querySelector('.compra-item-price');

        if (!quantityInput || !priceInput) {
            item.isCalculating = false;
            return;
        }

        const quantity = parseFloat(quantityInput.value);
        
        if (isNaN(quantity) || quantity <= 0) {
            item.isCalculating = false;
            return;
        }

        item.quantity = quantity;

        // Se tem preço de referência, calcular preço total
        if (item.ingredient_data.price > 0) {
            // Usar stock_unit como unidade padrão (já está na unidade correta)
            const stockUnit = this.normalizeUnit(item.ingredient_data.stock_unit);
            
            // Preço de referência já está por unidade de estoque, então multiplicar diretamente
            const calculatedPrice = quantity * item.ingredient_data.price;

            // Atualizar campo de preço
            priceInput.value = calculatedPrice.toFixed(2);
            item.total_price = calculatedPrice;
            
            // Atualizar label se necessário
            const label = priceInput.closest('.div-input')?.querySelector('label');
            if (label && calculatedPrice > 0) {
                label.classList.add('active');
            }
        }

        item.isCalculating = false;
        this.updateGrandTotal();
    }

    /**
     * Calcula quantidade baseada no preço total informado
     * @param {string} itemId - ID do item
     */
    calculateQuantityFromPrice(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item || !item.ingredient_data || item.isCalculating) return;

        // Prevenir loops
        item.isCalculating = true;

        const itemElement = document.querySelector(`[data-item-id="${itemId}"]`);
        if (!itemElement) {
            item.isCalculating = false;
            return;
        }

        const quantityInput = itemElement.querySelector('.compra-item-quantity');
        const priceInput = itemElement.querySelector('.compra-item-price');

        if (!quantityInput || !priceInput) {
            item.isCalculating = false;
            return;
        }

        const totalPrice = parseFloat(priceInput.value);

        if (isNaN(totalPrice) || totalPrice <= 0) {
            item.isCalculating = false;
            return;
        }

        item.total_price = totalPrice;

        // Se tem preço de referência, calcular quantidade
        if (item.ingredient_data.price > 0) {
            // Preço de referência já está por unidade de estoque, então dividir diretamente
            const calculatedQuantity = totalPrice / item.ingredient_data.price;

            // Atualizar campo de quantidade
            quantityInput.value = calculatedQuantity.toFixed(3);
            item.quantity = calculatedQuantity;
            
            // Atualizar label se necessário
            const label = quantityInput.closest('.div-input')?.querySelector('label');
            if (label && calculatedQuantity > 0) {
                label.classList.add('active');
            }
        }

        item.isCalculating = false;
        this.updateGrandTotal();
    }

    /**
     * Atualiza total de um item específico
     * @param {string} itemId - ID do item
     */
    updateItemTotal(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (!item) return;

        // Já está sendo atualizado pelos métodos calculatePriceFromQuantity e calculateQuantityFromPrice
        // Este método mantém compatibilidade mas não faz cálculo
    }

    /**
     * Atualiza total geral da compra
     */
    updateGrandTotal() {
        // ALTERAÇÃO: Usar reduce para melhor performance
        const total = this.items.reduce((sum, item) => {
            if (item.total_price) {
                return sum + item.total_price;
            }
            // ALTERAÇÃO: Otimizar busca de elementos DOM (cachear referências)
            const itemElement = document.querySelector(`[data-item-id="${item.id}"]`);
            if (itemElement) {
                const priceInput = itemElement.querySelector('.compra-item-price');
                if (priceInput) {
                    const price = parseFloat(priceInput.value) || 0;
                    return sum + price;
                }
            }
            return sum;
        }, 0);

        const totalElement = document.getElementById('compra-total-value');
        if (totalElement) {
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
     * Valida formulário antes de submeter
     * @returns {boolean} True se válido
     */
    validateForm() {
        // Validar campos obrigatórios
        const invoiceNumber = document.getElementById('compra-invoice-number')?.value.trim();
        const supplierName = document.getElementById('compra-supplier-name')?.value.trim();

        if (!invoiceNumber) {
            showToast('Número da nota fiscal é obrigatório', { type: 'error', title: 'Erro' });
            document.getElementById('compra-invoice-number')?.focus();
            return false;
        }

        // Fornecedor pode ser obtido dos insumos se não informado
        // Mas ainda precisa estar presente (ou preenchido manualmente ou vindo do insumo)
        // A validação final será feita no handleSubmit

        // Validar itens
        if (this.items.length === 0) {
            showToast('Adicione pelo menos um item à nota fiscal', { type: 'error', title: 'Erro' });
            return false;
        }

        // Validar cada item
        for (const item of this.items) {
            const itemElement = document.querySelector(`[data-item-id="${item.id}"]`);
            if (!itemElement) continue;

            const ingredientSelect = itemElement.querySelector('.compra-item-ingredient');
            const quantityInput = itemElement.querySelector('.compra-item-quantity');
            const priceInput = itemElement.querySelector('.compra-item-price');

            const ingredientId = ingredientSelect ? parseInt(ingredientSelect.value) : null;
            let quantity = quantityInput ? parseFloat(quantityInput.value) : null;
            let totalPrice = priceInput ? parseFloat(priceInput.value) : null;

            if (!ingredientId) {
                showToast(`Selecione um insumo para o Item ${this.items.indexOf(item) + 1}`, { type: 'error', title: 'Erro' });
                ingredientSelect?.focus();
                return false;
            }

            // Validar que pelo menos um dos campos foi preenchido
            if ((!quantity || quantity <= 0) && (!totalPrice || totalPrice <= 0)) {
                showToast(`Informe a quantidade OU o valor total para o Item ${this.items.indexOf(item) + 1}`, { type: 'error', title: 'Erro' });
                quantityInput?.focus();
                return false;
            }

            // Se tem quantidade mas não tem preço, calcular preço
            if ((quantity && quantity > 0) && (!totalPrice || totalPrice <= 0)) {
                if (item.ingredient_data && item.ingredient_data.price > 0) {
                    // Preço de referência já está por unidade de estoque
                    totalPrice = quantity * item.ingredient_data.price;
                    if (priceInput) {
                        priceInput.value = totalPrice.toFixed(2);
                        // Atualizar label
                        const label = priceInput.closest('.div-input')?.querySelector('label');
                        if (label) label.classList.add('active');
                    }
                    item.total_price = totalPrice;
                } else {
                    showToast(`Preço de referência não encontrado para o insumo do Item ${this.items.indexOf(item) + 1}. Informe o valor total.`, { type: 'error', title: 'Erro' });
                    priceInput?.focus();
                    return false;
                }
            }

            // Se tem preço mas não tem quantidade, calcular quantidade
            if ((totalPrice && totalPrice > 0) && (!quantity || quantity <= 0)) {
                if (item.ingredient_data && item.ingredient_data.price > 0) {
                    // Preço de referência já está por unidade de estoque
                    quantity = totalPrice / item.ingredient_data.price;
                    if (quantityInput) {
                        quantityInput.value = quantity.toFixed(3);
                        // Atualizar label
                        const label = quantityInput.closest('.div-input')?.querySelector('label');
                        if (label) label.classList.add('active');
                    }
                    item.quantity = quantity;
                } else {
                    showToast(`Preço de referência não encontrado para o insumo do Item ${this.items.indexOf(item) + 1}. Informe a quantidade.`, { type: 'error', title: 'Erro' });
                    quantityInput?.focus();
                    return false;
                }
            }

            // Atualizar item no array
            item.ingredient_id = ingredientId;
            item.quantity = quantity;
            item.total_price = totalPrice;
            // Calcular unit_price para o backend (preço total / quantidade)
            item.unit_price = quantity > 0 ? totalPrice / quantity : 0;
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
        let supplierName = document.getElementById('compra-supplier-name').value.trim();
        const purchaseDate = document.getElementById('compra-purchase-date').value;
        const paymentMethod = document.getElementById('compra-payment-method').value || null;
        const paymentStatus = document.getElementById('compra-payment-status').value;
        const notes = document.getElementById('compra-notes').value.trim() || null;

        // Se fornecedor não foi preenchido, tentar usar fornecedor dos insumos
        if (!supplierName) {
            // Verificar se todos os insumos têm o mesmo fornecedor
            const suppliers = this.items
                .filter(item => item.ingredient_data && item.ingredient_data.supplier && item.ingredient_data.supplier !== 'Não informado' && item.ingredient_data.supplier.trim() !== '')
                .map(item => item.ingredient_data.supplier);
            
            if (suppliers.length > 0) {
                // Usar fornecedor do primeiro insumo ou verificar se todos são iguais
                const uniqueSuppliers = [...new Set(suppliers)];
                if (uniqueSuppliers.length === 1) {
                    supplierName = uniqueSuppliers[0];
                } else if (uniqueSuppliers.length > 0) {
                    // Se há múltiplos fornecedores, usar o mais comum ou o primeiro
                    supplierName = uniqueSuppliers[0]; // Usar primeiro fornecedor encontrado
                }
                
                // Atualizar campo se necessário
                if (supplierName && supplierName !== 'Não informado' && supplierName.trim() !== '') {
                    const supplierInput = document.getElementById('compra-supplier-name');
                    if (supplierInput) {
                        supplierInput.value = supplierName;
                        // Atualizar label
                        const label = supplierInput.closest('.div-input')?.querySelector('label');
                        if (label) label.classList.add('active');
                    }
                }
            }
        }

        // Validação final do fornecedor
        if (!supplierName || supplierName.trim() === '' || supplierName === 'Não informado') {
            showToast('Fornecedor é obrigatório. Preencha manualmente ou selecione um insumo com fornecedor cadastrado.', { type: 'error', title: 'Erro' });
            document.getElementById('compra-supplier-name')?.focus();
            return;
        }

        // Calcular total usando preço total dos itens
        let totalAmount = 0;
        const validItems = [];
        
        this.items.forEach(item => {
            const quantity = item.quantity || 0;
            const totalPrice = item.total_price || 0;
            const unitPrice = item.unit_price || 0; // Já calculado na validação
            
            totalAmount += totalPrice;
            
            validItems.push({
                ingredient_id: item.ingredient_id,
                quantity: quantity,
                unit_price: unitPrice // Preço unitário para o backend
            });
        });

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
     */
    resetForm() {
        this.items = [];
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
    }

    /**
     * Remove todos os event listeners registrados
     * ALTERAÇÃO: Método para cleanup adequado de event listeners
     */
    cleanupEventListeners() {
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
     * ALTERAÇÃO: Método para cleanup completo
     */
    destroy() {
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
