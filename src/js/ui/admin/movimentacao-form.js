/**
 * Formulário de Movimentação Financeira
 * Gerencia criação e edição de movimentações
 */

import { createFinancialMovement, getFinancialMovementById, updateFinancialMovement, getFinancialMovements } from '../../api/financial-movements.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { formatDateForAPI, formatDateForDisplay, parseDateFromAPI } from '../../utils/date-formatter.js';
import { cacheManager } from '../../utils/cache-manager.js';
import { abrirModal, fecharModal } from '../modais.js';
import { gerenciarInputsEspecificos } from '../../utils.js';
import { validateRequired, validateNumber, validateLength, applyFieldValidation, clearFieldValidation } from '../../utils/validators.js';

export class MovimentacaoForm {
    constructor(modalId) {
        this.modal = document.getElementById(modalId);
        this.form = null;
        this.isEditMode = false;
        this.currentMovementId = null;
        this.currentData = null;
        this.onSuccess = null;
    }

    /**
     * Inicializa o formulário
     */
    async init() {
        if (!this.modal) {
            // ALTERAÇÃO: Removido console.error - erro será tratado silenciosamente
            return;
        }

        this.setupEventListeners();
    }

    /**
     * Abre modal para nova movimentação
     * @param {Function} onSuccess - Callback chamado após sucesso
     */
    async openNew(onSuccess = null) {
        this.isEditMode = false;
        this.currentMovementId = null;
        this.currentData = null;
        this.onSuccess = onSuccess;
        await this.render();
        this.showModal();
    }

    /**
     * Abre modal para editar movimentação
     * @param {number} movementId - ID da movimentação
     * @param {Function} onSuccess - Callback chamado após sucesso
     */
    async openEdit(movementId, onSuccess = null) {
        this.isEditMode = true;
        this.currentMovementId = movementId;
        this.onSuccess = onSuccess;
        
        try {
            this.currentData = await getFinancialMovementById(movementId);
            await this.render();
            this.showModal();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar movimentação', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Renderiza o formulário
     */
    async render() {
        const data = this.currentData || {};
        const movementDate = data.movement_date || data.date || '';
        const parsedDate = movementDate ? parseDateFromAPI(movementDate) : new Date();
        const dateValue = parsedDate ? parsedDate.toISOString().split('T')[0] : '';

        // ALTERAÇÃO: Carregar categorias financeiras corretas
        const categories = await this.loadFinancialCategories();
        const currentType = data.type || '';

        if (this.modal) {
            // ALTERAÇÃO: Garantir que modal tenha classe .modal e atributos necessários
            if (!this.modal.classList.contains('modal')) {
                this.modal.classList.add('modal');
            }
            if (!this.modal.hasAttribute('data-reset-on-close')) {
                this.modal.setAttribute('data-reset-on-close', 'true');
            }
            // ALTERAÇÃO: Garantir que modal tenha ID definido
            if (!this.modal.id) {
                this.modal.id = 'modal-movimentacao';
            }

            this.modal.innerHTML = `
                <div class="div-overlay"></div>
                <div class="modal-content-ingrediente" style="max-width: 600px;">
                    <div class="header-modal">
                        <h2>${this.isEditMode ? 'Editar' : 'Nova'} Movimentação</h2>
                        <i class="fa-solid fa-xmark fechar-modal" data-close-modal="modal-movimentacao" aria-label="Fechar modal"></i>
                    </div>
                    <div class="conteudo-modal">
                        <form id="form-movimentacao">
                            <!-- ALTERAÇÃO: Criada div wrapper para cada campo, movendo small para fora de div-input -->
                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <select id="mov-type" required>
                                        <option value="">Selecione...</option>
                                        <option value="REVENUE" ${data.type === 'REVENUE' ? 'selected' : ''}>Receita</option>
                                        <option value="EXPENSE" ${data.type === 'EXPENSE' ? 'selected' : ''}>Despesa</option>
                                        <option value="CMV" ${data.type === 'CMV' ? 'selected' : ''}>CMV (Custo das Mercadorias Vendidas)</option>
                                        <option value="TAX" ${data.type === 'TAX' ? 'selected' : ''}>Imposto</option>
                                    </select>
                                    <label for="mov-type" class="${data.type ? 'active' : ''}">Tipo *</label>
                                </div>
                                <small class="form-text">Receita: vendas e faturamento | Despesa: custos gerais (ex: aluguel, salários) | CMV: custos diretos dos produtos vendidos (ingredientes usados) | Imposto: taxas e tributos pagos</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <input type="text" id="mov-value" 
                                           value="${this.formatCurrencyInput(data.value || data.amount || '')}" 
                                           placeholder="0,00" required>
                                    <label for="mov-value" class="${(data.value || data.amount) ? 'active' : ''}">Valor *</label>
                                </div>
                                <small class="form-text">Digite o valor em reais (exemplo: 150,50)</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <input type="date" id="mov-date" 
                                           value="${dateValue}" required>
                                    <label for="mov-date" class="${dateValue ? 'active' : ''}">Data *</label>
                                </div>
                                <small class="form-text">Selecione a data em que a movimentação ocorreu</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <textarea id="mov-description" rows="3" 
                                              maxlength="500"
                                              required>${escapeHTML(data.description || data.description_text || '')}</textarea>
                                    <label for="mov-description" class="${(data.description || data.description_text) ? 'active' : ''}">Descrição *</label>
                                </div>
                                <small class="form-text">Descreva a movimentação (exemplo: "Compra de ingredientes" ou "Venda de produtos") - máximo 500 caracteres</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <select id="mov-category">
                                        <option value="">Selecione...</option>
                                        ${categories && categories.length > 0 ? categories.map(cat => {
                                            const categoryName = escapeHTML(cat.name || cat);
                                            const isSelected = data.category === categoryName ? 'selected' : '';
                                            const typeCompatible = cat.typeCompatible || '';
                                            // Filtrar categorias baseado no tipo atual, mas mostrar todas se tipo não selecionado
                                            const isCompatible = !currentType || !typeCompatible || typeCompatible.split(',').includes(currentType);
                                            return `<option value="${categoryName}" ${isSelected} data-type-compatible="${typeCompatible}" ${!isCompatible ? 'style="display:none;"' : ''}>${categoryName}</option>`;
                                        }).join('') : ''}
                                    </select>
                                    <label for="mov-category" class="${data.category ? 'active' : ''}">Categoria</label>
                                </div>
                                <small class="form-text">Selecione a categoria para organizar a movimentação (opcional). As opções são filtradas conforme o tipo selecionado.</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <select id="mov-payment-method">
                                        <option value="">Selecione...</option>
                                        <!-- ALTERAÇÃO: Valores atualizados para usar 'credit' e 'debit' ao invés de 'Credit Card' e 'Debit Card' -->
                                        <option value="money" ${data.payment_method === 'money' || data.payment_method === 'Cash' ? 'selected' : ''}>Dinheiro</option>
                                        <option value="credit" ${data.payment_method === 'credit' || data.payment_method === 'Credit Card' ? 'selected' : ''}>Cartão de Crédito</option>
                                        <option value="debit" ${data.payment_method === 'debit' || data.payment_method === 'Debit Card' ? 'selected' : ''}>Cartão de Débito</option>
                                        <option value="pix" ${data.payment_method === 'pix' || data.payment_method === 'PIX' ? 'selected' : ''}>PIX</option>
                                    </select>
                                    <label for="mov-payment-method" class="${data.payment_method ? 'active' : ''}">Método de Pagamento</label>
                                </div>
                                <small class="form-text">Selecione como foi realizado o pagamento (opcional)</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <select id="mov-payment-status">
                                        <option value="Pending" ${(!data.payment_status || data.payment_status === 'Pending') ? 'selected' : ''}>Pendente</option>
                                        <option value="Paid" ${data.payment_status === 'Paid' ? 'selected' : ''}>Pago</option>
                                    </select>
                                    <label for="mov-payment-status" class="active">Status de Pagamento</label>
                                </div>
                                <small class="form-text">Indique se o pagamento já foi realizado ou está pendente</small>
                            </div>

                            <div class="form-field-wrapper">
                                <div class="div-input">
                                    <input type="text" id="mov-sender-receiver" 
                                           value="${escapeHTML(data.sender_receiver || data.sender || data.receiver || '')}"
                                           maxlength="100"
                                           pattern="[A-Za-zÀ-ÿ\\s\\.\\-']+"
                                           title="Apenas letras, espaços e caracteres especiais permitidos">
                                    <label for="mov-sender-receiver" class="${(data.sender_receiver || data.sender || data.receiver) ? 'active' : ''}">Remetente/Destinatário</label>
                                </div>
                                <small class="form-text">Nome de quem enviou ou recebeu o pagamento (opcional) - máximo 100 caracteres</small>
                            </div>
                        </form>
                    </div>
                    <div class="footer-modal">
                        <button type="button" class="btn-cancelar" data-close-modal="modal-movimentacao">Cancelar</button>
                        <button type="button" class="btn-salvar" id="btn-save-movimentacao">
                            ${this.isEditMode ? 'Atualizar' : 'Salvar'}
                        </button>
                    </div>
                </div>
            `;

            // Configurar event listener do formulário
            this.setupFormListeners();
            
            // Reconfigurar event listeners do modal após render
            this.setupModalEventListeners();
            
            // ALTERAÇÃO: Usar função centralizada de utils.js para gerenciar estados dos inputs
            const inputs = this.modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
            gerenciarInputsEspecificos(inputs);
            
            // ALTERAÇÃO: Adicionar listener para tipo de movimentação para filtrar categorias
            this.setupCategoryFilter();
            
            // ALTERAÇÃO: Configurar máscaras e validações
            this.setupMasksAndValidations();
        }
    }

    /**
     * ALTERAÇÃO: Configura filtro de categorias baseado no tipo selecionado
     */
    setupCategoryFilter() {
        const typeSelect = document.getElementById('mov-type');
        const categorySelect = document.getElementById('mov-category');
        
        if (!typeSelect || !categorySelect) return;
        
        // Função para atualizar categorias visíveis
        const updateCategoryOptions = () => {
            const selectedType = typeSelect.value;
            const currentCategory = categorySelect.value;
            
            // Obter todas as opções
            const options = categorySelect.querySelectorAll('option');
            let hasVisibleCompatibleOption = false;
            
            options.forEach(option => {
                if (option.value === '') {
                    // Opção "Selecione..." sempre visível
                    option.style.display = '';
                    return;
                }
                
                const typeCompatible = option.getAttribute('data-type-compatible') || '';
                
                // Se não há tipo selecionado, mostrar todas
                if (!selectedType) {
                    option.style.display = '';
                    if (option.value === currentCategory) {
                        hasVisibleCompatibleOption = true;
                    }
                } else {
                    // Verificar se a categoria é compatível com o tipo selecionado
                    const isCompatible = !typeCompatible || typeCompatible.split(',').includes(selectedType);
                    
                    if (isCompatible) {
                        option.style.display = '';
                        if (option.value === currentCategory) {
                            hasVisibleCompatibleOption = true;
                        }
                    } else {
                        // Ocultar categorias incompatíveis
                        option.style.display = 'none';
                    }
                }
            });
            
            // Se a categoria atual não é compatível com o novo tipo, limpar seleção
            if (selectedType && currentCategory) {
                const currentOption = categorySelect.querySelector(`option[value="${currentCategory}"]`);
                if (currentOption && currentOption.style.display === 'none') {
                    categorySelect.value = '';
                    // Atualizar label
                    const label = categorySelect.parentElement.querySelector('label');
                    if (label) {
                        label.classList.remove('active');
                    }
                }
            }
            
            // Se não há opção compatível visível e havia uma selecionada, limpar
            if (!hasVisibleCompatibleOption && currentCategory) {
                categorySelect.value = '';
                const label = categorySelect.parentElement.querySelector('label');
                if (label) {
                    label.classList.remove('active');
                }
            }
        };
        
        // Atualizar ao mudar tipo
        typeSelect.addEventListener('change', updateCategoryOptions);
        
        // ALTERAÇÃO: Remover classe error quando categoria compatível for selecionada
        categorySelect.addEventListener('change', () => {
            const selectedType = typeSelect.value;
            const selectedCategory = categorySelect.value;
            
            if (selectedCategory && selectedType) {
                const selectedOption = categorySelect.querySelector(`option[value="${selectedCategory}"]`);
                if (selectedOption) {
                    const typeCompatible = selectedOption.getAttribute('data-type-compatible') || '';
                    const isCompatible = !typeCompatible || typeCompatible.split(',').includes(selectedType);
                    
                    if (isCompatible) {
                        categorySelect.classList.remove('error');
                    }
                }
            }
        });
        
        // Atualizar na inicialização
        updateCategoryOptions();
    }

    // ALTERAÇÃO: Método initializeFloatingLabels() removido - agora usa gerenciarInputsEspecificos() de utils.js

    /**
     * Configura event listeners do formulário
     */
    setupFormListeners() {
        const form = document.getElementById('form-movimentacao');
        const btnSave = document.getElementById('btn-save-movimentacao');

        if (btnSave) {
            btnSave.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleSubmit();
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleSubmit();
            });
        }
    }

    /**
     * Processa o envio do formulário
     */
    async handleSubmit() {
        const form = document.getElementById('form-movimentacao');
        if (!form) return;

        // ALTERAÇÃO: Validar todos os campos antes de submeter
        if (!this.validateAllFields()) {
            return;
        }

        const typeValue = document.getElementById('mov-type').value;
        const categoryValue = document.getElementById('mov-category').value.trim() || null;
        
        // ALTERAÇÃO: Validar compatibilidade entre tipo e categoria
        if (typeValue && categoryValue) {
            const categorySelect = document.getElementById('mov-category');
            const selectedOption = categorySelect.querySelector(`option[value="${categoryValue}"]`);
            
            if (selectedOption) {
                const typeCompatible = selectedOption.getAttribute('data-type-compatible') || '';
                
                // Verificar se categoria é compatível com tipo selecionado
                if (typeCompatible && !typeCompatible.split(',').includes(typeValue)) {
                    showToast('A categoria selecionada não é compatível com o tipo de movimentação escolhido. Por favor, selecione uma categoria compatível.', {
                        type: 'error',
                        title: 'Categoria Incompatível'
                    });
                    
                    // Destacar campos problemáticos
                    categorySelect.focus();
                    categorySelect.classList.add('error');
                    return;
                }
            }
        }

        // ALTERAÇÃO: Converter valor monetário formatado para número
        const valueInput = document.getElementById('mov-value');
        const valueText = valueInput.value.replace(/[^\d,]/g, '').replace(',', '.');
        const numericValue = parseFloat(valueText) || 0;

        const formData = {
            type: typeValue,
            value: numericValue,
            movement_date: formatDateForAPI(document.getElementById('mov-date').value),
            description: document.getElementById('mov-description').value.trim(),
            category: categoryValue,
            payment_method: document.getElementById('mov-payment-method').value || null,
            payment_status: document.getElementById('mov-payment-status').value,
            sender_receiver: document.getElementById('mov-sender-receiver').value.trim() || null
        };

        // Remover campos null
        Object.keys(formData).forEach(key => {
            if (formData[key] === null || formData[key] === '') {
                delete formData[key];
            }
        });

        try {
            if (this.isEditMode) {
                await updateFinancialMovement(this.currentMovementId, formData);
                showToast('Movimentação atualizada com sucesso', { 
                    type: 'success',
                    title: 'Sucesso'
                });
            } else {
                await createFinancialMovement(formData);
                showToast('Movimentação criada com sucesso', { 
                    type: 'success',
                    title: 'Sucesso'
                });
            }

            this.hideModal();
            
            // Chamar callback de sucesso se fornecido
            if (this.onSuccess) {
                this.onSuccess();
            }
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao salvar movimentação', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * ALTERAÇÃO: Exibe o modal usando o sistema de modais (previne piscar)
     */
    showModal() {
        if (!this.modal) return;
        
        // ALTERAÇÃO: Verificar se modal já está aberta/visível para evitar piscar
        const computedStyle = window.getComputedStyle(this.modal);
        const isVisible = computedStyle.display !== 'none' && 
                         computedStyle.opacity !== '0' && 
                         computedStyle.visibility !== 'hidden';
        
        if (isVisible) {
            // Modal já está aberta, apenas focar nela
            const firstInput = this.modal.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
            return;
        }
        
        // ALTERAÇÃO: Usar sistema de modais para abertura fluida
        abrirModal(this.modal.id);
        
        // Focar no primeiro campo após animação
        setTimeout(() => {
            const firstInput = this.modal.querySelector('input, select, textarea');
            if (firstInput) firstInput.focus();
        }, 250);
    }

    /**
     * Fecha o modal usando o sistema de modais
     */
    hideModal() {
        if (this.modal) {
            // ALTERAÇÃO: Usar sistema de modais para fechamento fluido
            fecharModal(this.modal.id);
            // Limpar dados após fechar
            setTimeout(() => {
                this.currentData = null;
                this.onSuccess = null;
            }, 200);
        }
    }

    /**
     * ALTERAÇÃO: Carrega categorias financeiras corretas
     * Busca categorias únicas das movimentações existentes e adiciona categorias padrão
     * @returns {Promise<Array>} Lista de categorias financeiras com informações de compatibilidade
     */
    async loadFinancialCategories() {
        try {
            // Tentar obter do cache primeiro
            const cacheKey = 'financial_movement_categories';
            let categories = cacheManager.get(cacheKey);
            
            if (!categories) {
                // Categorias padrão do sistema com indicação de tipo compatível
                const defaultCategories = [
                    { name: 'Vendas', typeCompatible: 'REVENUE' },
                    { name: 'Custos Variáveis', typeCompatible: 'EXPENSE,CMV' },
                    { name: 'Custos Fixos', typeCompatible: 'EXPENSE' },
                    { name: 'Tributos', typeCompatible: 'TAX' },
                    { name: 'Compras de Estoque', typeCompatible: 'EXPENSE' }
                ];

                // Buscar categorias únicas das movimentações existentes
                try {
                    const response = await getFinancialMovements({});
                    
                    let movements = [];
                    if (Array.isArray(response)) {
                        movements = response;
                    } else if (response && response.items) {
                        movements = response.items || [];
                    }
                    
                    // Extrair categorias únicas
                    const existingCategories = [...new Set(movements
                        .map(m => m.category)
                        .filter(cat => cat && cat.trim() !== '')
                    )];
                    
                    // Combinar categorias padrão com existentes
                    const categoryMap = new Map();
                    
                    // Adicionar categorias padrão primeiro
                    defaultCategories.forEach(cat => {
                        categoryMap.set(cat.name, {
                            name: cat.name,
                            typeCompatible: cat.typeCompatible
                        });
                    });
                    
                    // Adicionar categorias existentes que não estão nas padrão
                    existingCategories.forEach(catName => {
                        if (!categoryMap.has(catName)) {
                            // Tentar inferir tipo compatível baseado em movimentações existentes
                            const movementsWithCategory = movements.filter(m => m.category === catName);
                            const types = [...new Set(movementsWithCategory.map(m => m.type))];
                            
                            categoryMap.set(catName, {
                                name: catName,
                                typeCompatible: types.join(',') // Todos os tipos que já usaram esta categoria
                            });
                        }
                    });
                    
                    categories = Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
                    
                    // Armazenar no cache por 5 minutos
                    cacheManager.set(cacheKey, categories, 5 * 60 * 1000);
                } catch (apiError) {
                    // Em caso de erro, usar apenas categorias padrão
                    categories = defaultCategories.map(cat => ({
                        name: cat.name,
                        typeCompatible: cat.typeCompatible
                    }));
                }
            }
            
            return categories || [];
        } catch (error) {
            // ALTERAÇÃO: Removido console.warn - retornar categorias padrão em caso de erro
            // Retornar categorias padrão em caso de erro
            return [
                { name: 'Vendas', typeCompatible: 'REVENUE' },
                { name: 'Custos Variáveis', typeCompatible: 'EXPENSE,CMV' },
                { name: 'Custos Fixos', typeCompatible: 'EXPENSE' },
                { name: 'Tributos', typeCompatible: 'TAX' },
                { name: 'Compras de Estoque', typeCompatible: 'EXPENSE' }
            ];
        }
    }

    /**
     * Configura event listeners iniciais
     */
    setupEventListeners() {
        // Event listeners básicos configurados aqui
        // Event listeners específicos do modal são configurados após render
    }

    /**
     * Configura event listeners do modal após render
     * ALTERAÇÃO: Garantir que botões de fechar funcionem usando sistema de modais.js
     */
    setupModalEventListeners() {
        if (!this.modal) return;

        // ALTERAÇÃO: Garantir que botões de fechar chamem fecharModal explicitamente
        // Isso garante funcionamento mesmo se delegação de eventos não capturar
        const btnCancelar = this.modal.querySelector('.btn-cancelar');
        const btnFechar = this.modal.querySelector('.fechar-modal');
        
        if (btnCancelar) {
            // Remover listener anterior se existir para evitar duplicação
            const newBtnCancelar = btnCancelar.cloneNode(true);
            btnCancelar.parentNode.replaceChild(newBtnCancelar, btnCancelar);
            
            newBtnCancelar.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fecharModal('modal-movimentacao');
                // Limpar dados
                setTimeout(() => {
                    this.currentData = null;
                    this.onSuccess = null;
                }, 200);
            });
        }

        if (btnFechar) {
            // Remover listener anterior se existir para evitar duplicação
            const newBtnFechar = btnFechar.cloneNode(true);
            btnFechar.parentNode.replaceChild(newBtnFechar, btnFechar);
            
            newBtnFechar.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                fecharModal('modal-movimentacao');
                // Limpar dados
                setTimeout(() => {
                    this.currentData = null;
                    this.onSuccess = null;
                }, 200);
            });
        }

        // ALTERAÇÃO: Limpar dados quando modal for fechada
        // Observar mudanças no display da modal
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const display = this.modal.style.display;
                    if (display === 'none' || (!display && this.modal.style.opacity === '0')) {
                        // Modal foi fechada - limpar dados
                        setTimeout(() => {
                            this.currentData = null;
                            this.onSuccess = null;
                        }, 100);
                    }
                }
            });
        });

        observer.observe(this.modal, {
            attributes: true,
            attributeFilter: ['style']
        });
    }

    /**
     * ALTERAÇÃO: Configura máscaras e validações para os campos do formulário
     */
    setupMasksAndValidations() {
        // Máscara monetária para campo de valor
        const valueInput = document.getElementById('mov-value');
        if (valueInput) {
            valueInput.addEventListener('input', (e) => {
                this.applyCurrencyMask(e.target);
                this.validateValue(e.target);
            });
            valueInput.addEventListener('blur', (e) => {
                this.validateValue(e.target);
            });
            valueInput.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
        }

        // ALTERAÇÃO: Validação de data (permite datas futuras)
        const dateInput = document.getElementById('mov-date');
        if (dateInput) {
            dateInput.addEventListener('change', (e) => {
                this.validateDate(e.target);
            });
            dateInput.addEventListener('blur', (e) => {
                this.validateDate(e.target);
            });
        }

        // Validação de descrição
        const descriptionInput = document.getElementById('mov-description');
        if (descriptionInput) {
            descriptionInput.addEventListener('input', (e) => {
                this.validateDescription(e.target);
            });
            descriptionInput.addEventListener('blur', (e) => {
                this.validateDescription(e.target);
            });
        }

        // Validação de tipo (obrigatório)
        const typeSelect = document.getElementById('mov-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', (e) => {
                this.validateType(e.target);
            });
            typeSelect.addEventListener('blur', (e) => {
                this.validateType(e.target);
            });
        }

        // Validação de remetente/destinatário (formato de nome)
        const senderReceiverInput = document.getElementById('mov-sender-receiver');
        if (senderReceiverInput) {
            senderReceiverInput.addEventListener('input', (e) => {
                this.applyNameMask(e.target);
                this.validateSenderReceiver(e.target);
            });
            senderReceiverInput.addEventListener('blur', (e) => {
                this.validateSenderReceiver(e.target);
            });
        }
    }

    /**
     * ALTERAÇÃO: Aplica máscara monetária brasileira (R$ 0,00)
     * @param {HTMLInputElement} input - Campo de input
     */
    applyCurrencyMask(input) {
        let value = input.value.replace(/\D/g, '');
        
        if (value === '') {
            input.value = '';
            return;
        }

        // Converter para formato monetário brasileiro
        value = (parseInt(value) / 100).toFixed(2);
        value = value.replace('.', ',');
        value = value.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

        input.value = value;
    }

    /**
     * ALTERAÇÃO: Formata valor monetário para exibição no input
     * @param {number|string} value - Valor a formatar
     * @returns {string} Valor formatado
     */
    formatCurrencyInput(value) {
        if (!value || value === '') return '';
        const numValue = parseFloat(value) || 0;
        return numValue.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    /**
     * ALTERAÇÃO: Aplica máscara de nome (apenas letras, espaços e alguns caracteres especiais)
     * @param {HTMLInputElement} input - Campo de input
     */
    applyNameMask(input) {
        let value = input.value;
        // Permitir apenas letras (incluindo acentos), espaços, pontos, hífens e apóstrofos
        value = value.replace(/[^A-Za-zÀ-ÿ\s\.\-\']/g, '');
        input.value = value;
    }

    /**
     * ALTERAÇÃO: Valida campo de valor
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateValue(input) {
        const value = input.value.replace(/[^\d,]/g, '').replace(',', '.');
        const numValue = parseFloat(value) || 0;
        
        return applyFieldValidation(input, (val) => {
            if (!val || val.trim() === '') {
                return { valid: false, message: 'Valor é obrigatório' };
            }
            if (numValue <= 0) {
                return { valid: false, message: 'Valor deve ser maior que zero' };
            }
            if (numValue > 999999999.99) {
                return { valid: false, message: 'Valor muito alto (máximo: R$ 999.999.999,99)' };
            }
            return { valid: true, message: '' };
        });
    }

    /**
     * ALTERAÇÃO: Valida campo de data (permite datas futuras)
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateDate(input) {
        return applyFieldValidation(input, (val) => {
            if (!val || val.trim() === '') {
                return { valid: false, message: 'Data é obrigatória' };
            }
            
            const selectedDate = new Date(val);
            
            // Verificar se a data é válida
            if (isNaN(selectedDate.getTime())) {
                return { valid: false, message: 'Data inválida' };
            }
            
            // ALTERAÇÃO: Removida validação de data futura - permite cadastrar movimentações futuras
            // ALTERAÇÃO: Removida validação de data muito antiga para não restringir demais
            
            return { valid: true, message: '' };
        });
    }

    /**
     * ALTERAÇÃO: Valida campo de descrição
     * @param {HTMLTextAreaElement} input - Campo de textarea
     * @returns {boolean} True se válido
     */
    validateDescription(input) {
        return applyFieldValidation(input, (val) => {
            const trimmed = val.trim();
            if (!trimmed) {
                return { valid: false, message: 'Descrição é obrigatória' };
            }
            if (trimmed.length < 3) {
                return { valid: false, message: 'Descrição deve ter pelo menos 3 caracteres' };
            }
            if (trimmed.length > 500) {
                return { valid: false, message: 'Descrição deve ter no máximo 500 caracteres' };
            }
            return { valid: true, message: '' };
        });
    }

    /**
     * ALTERAÇÃO: Valida campo de tipo
     * @param {HTMLSelectElement} input - Campo de select
     * @returns {boolean} True se válido
     */
    validateType(input) {
        return applyFieldValidation(input, (val) => {
            if (!val || val.trim() === '') {
                return { valid: false, message: 'Tipo é obrigatório' };
            }
            return { valid: true, message: '' };
        });
    }

    /**
     * ALTERAÇÃO: Valida campo de remetente/destinatário
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateSenderReceiver(input) {
        const value = input.value.trim();
        
        // Campo é opcional, então se estiver vazio, é válido
        if (!value) {
            clearFieldValidation(input);
            return true;
        }

        return applyFieldValidation(input, (val) => {
            const trimmed = val.trim();
            if (trimmed.length < 2) {
                return { valid: false, message: 'Nome deve ter pelo menos 2 caracteres' };
            }
            if (trimmed.length > 100) {
                return { valid: false, message: 'Nome deve ter no máximo 100 caracteres' };
            }
            // Verificar se contém apenas caracteres permitidos
            if (!/^[A-Za-zÀ-ÿ\s\.\-\']+$/.test(trimmed)) {
                return { valid: false, message: 'Nome contém caracteres inválidos' };
            }
            return { valid: true, message: '' };
        });
    }

    /**
     * ALTERAÇÃO: Valida todos os campos do formulário
     * @returns {boolean} True se todos os campos são válidos
     */
    validateAllFields() {
        const typeSelect = document.getElementById('mov-type');
        const valueInput = document.getElementById('mov-value');
        const dateInput = document.getElementById('mov-date');
        const descriptionInput = document.getElementById('mov-description');
        const senderReceiverInput = document.getElementById('mov-sender-receiver');

        let isValid = true;

        // Validar cada campo
        if (typeSelect && !this.validateType(typeSelect)) {
            isValid = false;
        }
        if (valueInput && !this.validateValue(valueInput)) {
            isValid = false;
        }
        if (dateInput && !this.validateDate(dateInput)) {
            isValid = false;
        }
        if (descriptionInput && !this.validateDescription(descriptionInput)) {
            isValid = false;
        }
        if (senderReceiverInput && senderReceiverInput.value.trim() && !this.validateSenderReceiver(senderReceiverInput)) {
            isValid = false;
        }

        // Se houver erros, focar no primeiro campo inválido
        if (!isValid) {
            const firstError = this.modal.querySelector('.error');
            if (firstError) {
                firstError.focus();
                firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            showToast('Por favor, corrija os erros no formulário antes de continuar', {
                type: 'error',
                title: 'Erro de Validação'
            });
        }

        return isValid;
    }
}
