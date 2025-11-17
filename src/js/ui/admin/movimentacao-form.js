/**
 * Formulário de Movimentação Financeira
 * Gerencia criação e edição de movimentações
 */

import { createFinancialMovement, getFinancialMovementById, updateFinancialMovement } from '../../api/financial-movements.js';
import { getCategories } from '../../api/categories.js';
import { showToast } from '../alerts.js';
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { formatDateForAPI, formatDateForDisplay, parseDateFromAPI } from '../../utils/date-formatter.js';
import { cacheManager } from '../../utils/cache-manager.js';

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
            console.error('Modal de movimentação não encontrado');
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
            console.error('Erro ao carregar movimentação:', error);
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

        // Carregar categorias do cache ou API
        const categories = await this.loadCategories();

        if (this.modal) {
            this.modal.innerHTML = `
                <div class="div-overlay"></div>
                <div class="modal-content-ingrediente" style="max-width: 600px;">
                    <div class="header-modal">
                        <h2>${this.isEditMode ? 'Editar' : 'Nova'} Movimentação</h2>
                        <i class="fa-solid fa-xmark fechar-modal" data-close-modal="${this.modal.id}" aria-label="Fechar modal"></i>
                    </div>
                    <div class="conteudo-modal">
                        <form id="form-movimentacao">
                            <div class="div-input">
                                <select id="mov-type" required>
                                    <option value="">Selecione...</option>
                                    <option value="REVENUE" ${data.type === 'REVENUE' ? 'selected' : ''}>Receita</option>
                                    <option value="EXPENSE" ${data.type === 'EXPENSE' ? 'selected' : ''}>Despesa</option>
                                    <option value="CMV" ${data.type === 'CMV' ? 'selected' : ''}>CMV</option>
                                    <option value="TAX" ${data.type === 'TAX' ? 'selected' : ''}>Imposto</option>
                                </select>
                                <label for="mov-type" class="${data.type ? 'active' : ''}">Tipo *</label>
                            </div>

                            <div class="div-input">
                                <input type="number" id="mov-value" step="0.01" min="0" 
                                       value="${data.value || data.amount || ''}" required placeholder=" ">
                                <label for="mov-value" class="${(data.value || data.amount) ? 'active' : ''}">Valor *</label>
                            </div>

                            <div class="div-input">
                                <input type="date" id="mov-date" 
                                       value="${dateValue}" required>
                                <label for="mov-date" class="${dateValue ? 'active' : ''}">Data *</label>
                            </div>

                            <div class="div-input">
                                <textarea id="mov-description" rows="3" 
                                          required placeholder=" ">${escapeHTML(data.description || data.description_text || '')}</textarea>
                                <label for="mov-description" class="${(data.description || data.description_text) ? 'active' : ''}">Descrição *</label>
                            </div>

                            <div class="div-input">
                                <input type="text" id="mov-category" 
                                       list="mov-category-list"
                                       value="${escapeHTML(data.category || '')}" placeholder=" ">
                                <datalist id="mov-category-list">
                                    ${categories && categories.length > 0 ? categories.map(cat => `<option value="${escapeHTML(cat.name || cat)}">`).join('') : ''}
                                </datalist>
                                <label for="mov-category" class="${data.category ? 'active' : ''}">Categoria</label>
                            </div>

                            <div class="div-input">
                                <input type="text" id="mov-subcategory" 
                                       value="${escapeHTML(data.subcategory || '')}" placeholder=" ">
                                <label for="mov-subcategory" class="${data.subcategory ? 'active' : ''}">Subcategoria</label>
                            </div>

                            <div class="div-input">
                                <select id="mov-payment-method">
                                    <option value="">Selecione...</option>
                                    <option value="Cash" ${data.payment_method === 'Cash' ? 'selected' : ''}>Dinheiro</option>
                                    <option value="Credit Card" ${data.payment_method === 'Credit Card' ? 'selected' : ''}>Cartão de Crédito</option>
                                    <option value="Debit Card" ${data.payment_method === 'Debit Card' ? 'selected' : ''}>Cartão de Débito</option>
                                    <option value="PIX" ${data.payment_method === 'PIX' ? 'selected' : ''}>PIX</option>
                                    <option value="Bank Transfer" ${data.payment_method === 'Bank Transfer' ? 'selected' : ''}>Transferência Bancária</option>
                                </select>
                                <label for="mov-payment-method" class="${data.payment_method ? 'active' : ''}">Método de Pagamento</label>
                            </div>

                            <div class="div-input">
                                <select id="mov-payment-status">
                                    <option value="Pending" ${(!data.payment_status || data.payment_status === 'Pending') ? 'selected' : ''}>Pendente</option>
                                    <option value="Paid" ${data.payment_status === 'Paid' ? 'selected' : ''}>Pago</option>
                                </select>
                                <label for="mov-payment-status" class="active">Status de Pagamento</label>
                            </div>

                            <div class="div-input">
                                <input type="text" id="mov-sender-receiver" 
                                       value="${escapeHTML(data.sender_receiver || data.sender || data.receiver || '')}" 
                                       placeholder=" ">
                                <label for="mov-sender-receiver" class="${(data.sender_receiver || data.sender || data.receiver) ? 'active' : ''}">Remetente/Destinatário</label>
                            </div>
                        </form>
                    </div>
                    <div class="footer-modal">
                        <button type="button" class="btn-cancelar" data-close-modal="${this.modal.id}">Cancelar</button>
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
            
            // Inicializar labels flutuantes
            this.initializeFloatingLabels();
        }
    }

    /**
     * Inicializa os labels flutuantes dos campos
     */
    initializeFloatingLabels() {
        const inputs = this.modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        
        inputs.forEach(input => {
            const label = this.modal.querySelector(`label[for="${input.id}"]`);
            if (!label) return;

            // Verificar se o campo tem valor
            const hasValue = input.value && input.value !== '' && input.value !== ' ';
            const isSelectWithValue = input.tagName === 'SELECT' && input.value !== '';
            
            if (hasValue || isSelectWithValue) {
                label.classList.add('active');
            }

            // Adicionar listeners para atualizar label
            input.addEventListener('focus', () => {
                label.classList.add('focused', 'active');
            });

            input.addEventListener('blur', () => {
                label.classList.remove('focused');
                const hasValue = input.value && input.value !== '' && input.value !== ' ';
                const isSelectWithValue = input.tagName === 'SELECT' && input.value !== '';
                if (!hasValue && !isSelectWithValue) {
                    label.classList.remove('active');
                }
            });

            input.addEventListener('input', () => {
                const hasValue = input.value && input.value !== '' && input.value !== ' ';
                if (hasValue) {
                    label.classList.add('active');
                } else {
                    label.classList.remove('active');
                }
            });

            input.addEventListener('change', () => {
                const hasValue = input.value && input.value !== '' && input.value !== ' ';
                const isSelectWithValue = input.tagName === 'SELECT' && input.value !== '';
                if (hasValue || isSelectWithValue) {
                    label.classList.add('active');
                } else {
                    label.classList.remove('active');
                }
            });
        });
    }

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
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = {
            type: document.getElementById('mov-type').value,
            value: parseFloat(document.getElementById('mov-value').value),
            movement_date: formatDateForAPI(document.getElementById('mov-date').value),
            description: document.getElementById('mov-description').value.trim(),
            category: document.getElementById('mov-category').value.trim() || null,
            subcategory: document.getElementById('mov-subcategory').value.trim() || null,
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
            console.error('Erro ao salvar movimentação:', error);
            showToast('Erro ao salvar movimentação', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Exibe o modal
     */
    showModal() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            // Focar no primeiro campo
            setTimeout(() => {
                const firstInput = this.modal.querySelector('input, select, textarea');
                if (firstInput) firstInput.focus();
            }, 100);
        }
    }

    /**
     * Fecha o modal
     */
    hideModal() {
        if (this.modal) {
            this.modal.style.display = 'none';
            this.currentData = null;
            this.onSuccess = null;
        }
    }

    /**
     * Carrega categorias do cache ou API
     * @returns {Promise<Array>} Lista de categorias
     */
    async loadCategories() {
        try {
            // Tentar obter do cache primeiro
            const cacheKey = 'financial_categories';
            let categories = cacheManager.get(cacheKey);
            
            if (!categories) {
                // Se não estiver no cache, buscar da API
                const response = await getCategories({ page_size: 100 });
                
                // Normalizar resposta
                if (Array.isArray(response)) {
                    categories = response;
                } else if (response && response.items) {
                    categories = response.items || [];
                } else if (response && response.data) {
                    categories = response.data || [];
                } else {
                    categories = [];
                }
                
                // Armazenar no cache por 5 minutos
                cacheManager.set(cacheKey, categories, 5 * 60 * 1000);
            }
            
            return categories || [];
        } catch (error) {
            console.warn('Erro ao carregar categorias:', error);
            return [];
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
     */
    setupModalEventListeners() {
        if (!this.modal) return;

        // Event delegation para fechar modal
        this.modal.addEventListener('click', (e) => {
            // Fechar ao clicar no overlay ou botões de fechar
            if (e.target.classList.contains('div-overlay') ||
                e.target.classList.contains('fechar-modal') || 
                e.target.closest('.fechar-modal') ||
                (e.target.classList.contains('btn-cancelar') && !e.target.closest('form'))) {
                this.hideModal();
            }
        });

        // Prevenir fechamento ao clicar dentro do conteúdo
        const modalContent = this.modal.querySelector('.modal-content-ingrediente');
        if (modalContent) {
            modalContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
    }
}
