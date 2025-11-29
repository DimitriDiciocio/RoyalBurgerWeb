/**
 * Gerenciador de Regras de Recorrência
 * Gerencia despesas e impostos recorrentes
 */

import { 
    getRecurrenceRules, 
    createRecurrenceRule, 
    updateRecurrenceRule, 
    deleteRecurrenceRule,
    generateRecurringMovements 
} from '../../api/recurrence.js';
import { showToast, showConfirm } from '../alerts.js';
import { escapeHTML, escapeAttribute } from '../../utils/html-sanitizer.js';
import { cacheManager } from '../../utils/cache-manager.js';
import { validateRequired, validateLength, applyFieldValidation, clearFieldValidation } from '../../utils/validators.js';

import { abrirModal, fecharModal } from '../modais.js';
import { getNewRuleModalTemplate, getEditRuleModalTemplate } from '../../utils/recurrence-modal-templates.js';

export class RecorrenciasManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.rules = [];
        this.isInitialized = false;
        this.isLoading = false;
        // ALTERAÇÃO: Armazenar referências aos event listeners para cleanup
        this.modalEventListeners = {
            newRule: [],
            editRule: []
        };
        // ALTERAÇÃO: Armazenar referências aos listeners de validação
        this.validationListeners = {
            newRule: null,
            editRule: null
        };
    }

    /**
     * Inicializa o gerenciador de recorrências
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
        await this.loadRules();
        this.setupEventListeners();
    }

    /**
     * Renderiza a estrutura HTML
     */
    render() {
        this.container.innerHTML = `
            <div class="recorrencias-container">
                <div class="recorrencias-header">
                    <h3>Regras de Recorrência</h3>
                    <div class="recorrencias-actions">
                        <button class="financial-btn financial-btn-success" id="btn-gerar-movimentacoes" aria-label="Gerar movimentações do mês">
                            <i class="fa-solid fa-sync" aria-hidden="true"></i>
                            <span>Gerar Movimentações do Mês</span>
                        </button>
                        <button class="financial-btn financial-btn-primary" id="btn-nova-regra" aria-label="Nova regra de recorrência">
                            <i class="fa-solid fa-plus" aria-hidden="true"></i>
                            <span>Nova Regra</span>
                        </button>
                    </div>
                </div>

                <!-- Lista de Regras -->
                <div class="recorrencias-list" id="recorrencias-list">
                    <!-- Será preenchido dinamicamente -->
                </div>
            </div>
        `;
    }

    /**
     * Carrega regras de recorrência da API
     */
    async loadRules() {
        // ALTERAÇÃO: Evitar múltiplas requisições simultâneas
        if (this.isLoading) {
            return;
        }

        this.isLoading = true;
        try {
            // Tentar obter do cache primeiro
            const cacheKey = 'recurrence_rules_active';
            let response = cacheManager.get(cacheKey);
            
            if (!response) {
                // Se não estiver no cache, buscar da API
                response = await getRecurrenceRules(true); // Apenas ativas
                // Armazenar no cache por 5 minutos
                cacheManager.set(cacheKey, response, 5 * 60 * 1000);
            }
            
            // Tratar resposta como array ou objeto com items
            if (Array.isArray(response)) {
                this.rules = response;
            } else if (response && response.items) {
                this.rules = response.items || [];
            } else {
                this.rules = [];
            }

            this.renderRulesList();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar regras de recorrência', { 
                type: 'error',
                title: 'Erro'
            });
            this.rules = [];
            this.renderRulesList();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * ALTERAÇÃO: Valida ID de regra para prevenir XSS e injeção
     * @param {any} id - ID a ser validado
     * @returns {number|null} ID validado ou null se inválido
     */
    validateRuleId(id) {
        if (!id) return null;
        
        // Validar se é string ou número
        const idStr = String(id).trim();
        if (!/^\d+$/.test(idStr)) return null; // Apenas números
        
        const parsed = parseInt(idStr, 10);
        return Number.isInteger(parsed) && parsed > 0 && parsed <= 2147483647
            ? parsed
            : null;
    }

    /**
     * Renderiza a lista de regras
     */
    renderRulesList() {
        const listContainer = document.getElementById('recorrencias-list');
        if (!listContainer) return;
        
        if (this.rules.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fa-solid fa-repeat" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;" aria-hidden="true"></i>
                    <p style="font-size: 16px;">Nenhuma regra de recorrência cadastrada</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.rules.map(rule => {
            // ALTERAÇÃO: Validar ruleId antes de usar em innerHTML
            const rawRuleId = rule.id || rule.rule_id;
            const ruleId = this.validateRuleId(rawRuleId);
            if (!ruleId) {
                // ALTERAÇÃO: Pular regras com ID inválido para prevenir XSS
                return '';
            }
            const ruleName = escapeHTML(rule.name || 'Regra sem nome');
            const description = escapeHTML(rule.description || '');
            const ruleType = (rule.type || 'EXPENSE').toLowerCase();
            const value = parseFloat(rule.value || rule.amount || 0);
            const recurrenceType = rule.recurrence_type || rule.recurrenceType || 'MONTHLY';
            const recurrenceDay = rule.recurrence_day || rule.recurrenceDay || 1;
            const category = escapeHTML(rule.category || 'Sem categoria');
            const typeLabel = this.translateType(rule.type || 'EXPENSE');

            // ALTERAÇÃO: Estrutura padronizada seguindo o padrão do compra-card
            const ruleTypeUpper = (rule.type || 'EXPENSE').toUpperCase();
            
            return `
                <div class="recorrencia-card" data-rule-id="${escapeAttribute(String(ruleId))}" data-rule-type="${escapeAttribute(ruleTypeUpper)}">
                    <div class="recorrencia-card-header">
                        <div class="recorrencia-header-info">
                            <h4>
                                <i class="fa-solid fa-repeat" aria-hidden="true"></i>
                                ${ruleName}
                            </h4>
                            ${description ? `<p class="recorrencia-description">
                                <i class="fa-solid fa-align-left" aria-hidden="true"></i>
                                ${description}
                            </p>` : ''}
                        </div>
                        <div class="recorrencia-header-actions">
                            <span class="financial-badge type-${ruleType}">
                                ${escapeHTML(typeLabel)}
                            </span>
                        </div>
                    </div>
                    <div class="recorrencia-card-body">
                        <div class="recorrencia-info">
                            <div class="info-item total">
                                <span class="label">
                                    <i class="fa-solid fa-dollar-sign" aria-hidden="true"></i>
                                    Valor:
                                </span>
                                <span class="value">R$ ${this.formatCurrency(value)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">
                                    <i class="fa-solid fa-calendar-repeat" aria-hidden="true"></i>
                                    Recorrência:
                                </span>
                                <span class="value">${this.formatRecurrenceType(recurrenceType, recurrenceDay)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">
                                    <i class="fa-solid fa-tag" aria-hidden="true"></i>
                                    Categoria:
                                </span>
                                <span class="value">${category}</span>
                            </div>
                        </div>
                    </div>
                    <div class="recorrencia-card-footer">
                        <button class="financial-btn financial-btn-secondary" 
                                data-action="edit" 
                                data-rule-id="${escapeAttribute(String(ruleId))}"
                                aria-label="${escapeAttribute(`Editar regra ${ruleName}`)}">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i>
                            <span>Editar</span>
                        </button>
                        <button class="financial-btn financial-btn-danger" 
                                data-action="delete" 
                                data-rule-id="${escapeAttribute(String(ruleId))}"
                                aria-label="${escapeAttribute(`Desativar regra ${ruleName}`)}">
                            <i class="fa-solid fa-trash" aria-hidden="true"></i>
                            <span>Desativar</span>
                        </button>
                    </div>
                </div>
            `;
        }).filter(html => html !== '').join(''); // ALTERAÇÃO: Filtrar HTML vazio de regras inválidas
    }

    /**
     * Formata tipo de recorrência
     * @param {string} type - Tipo de recorrência
     * @param {number} day - Dia da recorrência
     * @returns {string} Texto formatado
     */
    formatRecurrenceType(type, day) {
        const types = {
            'MONTHLY': 'Mensal',
            'WEEKLY': 'Semanal',
            'YEARLY': 'Anual'
        };
        
        const dayLabels = {
            'MONTHLY': `Dia ${day}`,
            'WEEKLY': this.getDayOfWeek(day),
            'YEARLY': `Dia ${day} do ano`
        };

        const typeLabel = types[type] || type;
        const dayLabel = dayLabels[type] || `Dia ${day}`;

        return `${typeLabel} - ${dayLabel}`;
    }

    /**
     * Obtém nome do dia da semana
     * @param {number} day - Número do dia (1-7)
     * @returns {string} Nome do dia
     */
    getDayOfWeek(day) {
        const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        return days[day - 1] || `Dia ${day}`;
    }

    /**
     * Configura validação dinâmica do dia de recorrência
     * @param {string} typeSelectId - ID do select de tipo de recorrência
     * @param {string} dayInputId - ID do input de dia
     * @param {string} helpTextId - ID do elemento de ajuda
     * @param {string} modalType - Tipo do modal ('newRule' ou 'editRule') para cleanup
     */
    setupRecurrenceDayValidation(typeSelectId, dayInputId, helpTextId, modalType = null) {
        const typeSelect = document.getElementById(typeSelectId);
        const dayInput = document.getElementById(dayInputId);
        const helpText = document.getElementById(helpTextId);

        if (!typeSelect || !dayInput) return;

        // ALTERAÇÃO: Remover listener anterior se existir (cleanup)
        if (modalType && this.validationListeners[modalType]) {
            const { element, event, handler } = this.validationListeners[modalType];
            if (element && typeof handler === 'function') {
                element.removeEventListener(event, handler);
            }
        }

        const updateDayValidation = () => {
            const recurrenceType = typeSelect.value;
            let min = 1;
            let max = 31;
            let helpMessage = '';

            switch (recurrenceType) {
                case 'MONTHLY':
                    min = 1;
                    max = 31;
                    helpMessage = 'Dia do mês (1-31)';
                    break;
                case 'WEEKLY':
                    min = 1;
                    max = 7;
                    helpMessage = 'Dia da semana (1=Segunda, 7=Domingo)';
                    break;
                case 'YEARLY':
                    min = 1;
                    max = 365;
                    helpMessage = 'Dia do ano (1-365)';
                    break;
                default:
                    helpMessage = 'Selecione o tipo de recorrência primeiro';
            }

            dayInput.min = min;
            dayInput.max = max;
            dayInput.placeholder = helpMessage;
            
            if (helpText) {
                helpText.textContent = helpMessage;
            }

            // Validar valor atual se já tiver sido preenchido
            const currentValue = parseInt(dayInput.value, 10);
            if (currentValue && (currentValue < min || currentValue > max)) {
                dayInput.value = '';
            }
        };

        // Aplicar validação inicial
        updateDayValidation();

        // Adicionar listener para mudanças no tipo
        typeSelect.addEventListener('change', updateDayValidation);
        
        // ALTERAÇÃO: Armazenar referência para cleanup
        if (modalType) {
            this.validationListeners[modalType] = {
                element: typeSelect,
                event: 'change',
                handler: updateDayValidation
            };
        }
    }

    /**
     * Gera movimentações recorrentes do mês atual
     */
    async generateMovements() {
        try {
            const now = new Date();
            const result = await generateRecurringMovements(now.getFullYear(), now.getMonth() + 1);
            
            const generatedCount = result.generated_count || result.count || 0;
            
            showToast(
                `${generatedCount} movimentações geradas com sucesso`,
                { 
                    type: 'success',
                    title: 'Sucesso'
                }
            );
            
            // ALTERAÇÃO: Invalidar cache antes de recarregar
            cacheManager.delete('recurrence_rules_active');
            // ALTERAÇÃO: Recarregar regras diretamente para garantir que os cards sejam atualizados
            await this.loadRules();
            // ALTERAÇÃO: Atualizar todos os managers financeiros após gerar movimentações (forçar atualização)
            const { refreshAllFinancialManagers } = await import('../../utils/financial-entity-utils.js');
            await refreshAllFinancialManagers({
                updateMovements: true,
                updateDashboard: true,
                updatePendingPayments: true,
                updatePurchases: false,
                updateRecurrences: true,
                forceUpdate: true
            });
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao gerar movimentações', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Configura event listeners
     */
    setupEventListeners() {
        // Botão de gerar movimentações
        const btnGerar = document.getElementById('btn-gerar-movimentacoes');
        if (btnGerar) {
            btnGerar.addEventListener('click', () => {
                this.generateMovements();
            });
        }

        // Botão de nova regra
        const btnNovaRegra = document.getElementById('btn-nova-regra');
        if (btnNovaRegra) {
            btnNovaRegra.addEventListener('click', () => {
                this.openNewRuleModal();
            });
        }

        // Event delegation para ações dos cards
        const listContainer = document.getElementById('recorrencias-list');
        if (listContainer) {
            listContainer.addEventListener('click', async (e) => {
                const button = e.target.closest('[data-action]');
                if (!button) return;

                const action = button.dataset.action;
                // ALTERAÇÃO: Validar ruleId antes de usar
                const rawRuleId = button.dataset.ruleId;
                const ruleId = this.validateRuleId(rawRuleId);

                if (action === 'edit' && ruleId) {
                    e.preventDefault();
                    await this.editRule(ruleId);
                } else if (action === 'delete' && ruleId) {
                    e.preventDefault();
                    await this.deleteRule(ruleId);
                }
            });
        }
    }

    /**
     * Abre modal de nova regra
     */
    async openNewRuleModal() {
        await this.showNewRuleModal();
    }

    /**
     * Exibe modal de criação de nova regra
     */
    async showNewRuleModal() {
        // ALTERAÇÃO: Cleanup de event listeners anteriores para evitar vazamento de memória
        this.cleanupModalListeners('newRule');

        // Criar ou obter modal
        let modal = document.getElementById('modal-recorrencia-nova');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-recorrencia-nova';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        // ALTERAÇÃO: Usar template externo
        modal.innerHTML = getNewRuleModalTemplate();

        // ALTERAÇÃO: Usar sistema de modais.js
        abrirModal('modal-recorrencia-nova');

        // ALTERAÇÃO: Configurar validação dinâmica com tipo para cleanup
        this.setupRecurrenceDayValidation('rec-new-recurrence-type', 'rec-new-recurrence-day', 'rec-new-day-help', 'newRule');

        // ALTERAÇÃO: Gerenciar inputs padronizados usando utils.js
        const inputs = modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        if (inputs.length > 0) {
            const { gerenciarInputsEspecificos } = await import('../../utils.js');
            gerenciarInputsEspecificos(inputs);
        }

        // ALTERAÇÃO: Configurar máscaras e validações
        this.setupMasksAndValidationsNewRule(modal);

        // ALTERAÇÃO: Armazenar referência ao event listener para cleanup
        const btnSave = document.getElementById('btn-save-new-recorrencia');
        if (btnSave) {
            const saveHandler = async () => {
                await this.handleCreateRule(modal);
            };
            btnSave.addEventListener('click', saveHandler);
            this.modalEventListeners.newRule.push({ element: btnSave, event: 'click', handler: saveHandler });
        }
    }

    /**
     * Remove event listeners de um modal específico
     * @param {string} modalType - Tipo do modal ('newRule' ou 'editRule')
     */
    cleanupModalListeners(modalType) {
        // Cleanup de event listeners de botões
        const listeners = this.modalEventListeners[modalType] || [];
        listeners.forEach(({ element, event, handler }) => {
            if (element && typeof handler === 'function') {
                element.removeEventListener(event, handler);
            }
        });
        // Limpar array de listeners
        this.modalEventListeners[modalType] = [];

        // ALTERAÇÃO: Cleanup de listeners de validação
        if (this.validationListeners[modalType]) {
            const { element, event, handler } = this.validationListeners[modalType];
            if (element && typeof handler === 'function') {
                element.removeEventListener(event, handler);
            }
            this.validationListeners[modalType] = null;
        }
    }

    /**
     * Limpa todos os event listeners e recursos
     * Útil quando a instância não será mais usada
     */
    destroy() {
        // Cleanup de todos os modais
        this.cleanupModalListeners('newRule');
        this.cleanupModalListeners('editRule');
        
        // Fechar modais se estiverem abertos
        const newModal = document.getElementById('modal-recorrencia-nova');
        if (newModal) {
            fecharModal('modal-recorrencia-nova');
        }
        
        const editModal = document.getElementById('modal-recorrencia-editar');
        if (editModal) {
            fecharModal('modal-recorrencia-editar');
        }
    }

    /**
     * Edita uma regra
     * @param {number} ruleId - ID da regra
     */
    async editRule(ruleId) {
        // ALTERAÇÃO: Validar ruleId antes de processar
        const validatedRuleId = this.validateRuleId(ruleId);
        if (!validatedRuleId) {
            showToast('ID de regra inválido', { 
                type: 'error',
                title: 'Erro'
            });
            return;
        }
        
        try {
            const rule = this.rules.find(r => {
                const rId = this.validateRuleId(r.id || r.rule_id);
                return rId === validatedRuleId;
            });
            if (!rule) {
                showToast('Regra não encontrada', { 
                    type: 'error',
                    title: 'Erro'
                });
                return;
            }
            await this.showEditRuleModal(rule);
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao carregar regra', { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Exibe modal de edição de regra
     * @param {Object} rule - Dados da regra
     */
    async showEditRuleModal(rule) {
        // ALTERAÇÃO: Cleanup de event listeners anteriores para evitar vazamento de memória
        this.cleanupModalListeners('editRule');

        // Criar ou obter modal
        let modal = document.getElementById('modal-recorrencia-editar');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-recorrencia-editar';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const ruleId = rule.id || rule.rule_id;

        // ALTERAÇÃO: Usar template externo
        modal.innerHTML = getEditRuleModalTemplate(rule);

        // ALTERAÇÃO: Usar sistema de modais.js
        abrirModal('modal-recorrencia-editar');

        // ALTERAÇÃO: Configurar validação dinâmica com tipo para cleanup
        this.setupRecurrenceDayValidation('rec-recurrence-type', 'rec-recurrence-day', null, 'editRule');

        // ALTERAÇÃO: Gerenciar inputs padronizados usando utils.js
        const inputs = modal.querySelectorAll('.div-input input, .div-input select, .div-input textarea');
        if (inputs.length > 0) {
            const { gerenciarInputsEspecificos } = await import('../../utils.js');
            gerenciarInputsEspecificos(inputs);
        }

        // ALTERAÇÃO: Armazenar referência ao event listener para cleanup
        const btnSave = document.getElementById('btn-save-recorrencia');
        if (btnSave) {
            const saveHandler = async () => {
                await this.handleUpdateRule(ruleId, modal);
            };
            btnSave.addEventListener('click', saveHandler);
            this.modalEventListeners.editRule.push({ element: btnSave, event: 'click', handler: saveHandler });
        }
    }

    /**
     * Processa atualização da regra
     * @param {number} ruleId - ID da regra
     * @param {HTMLElement} modal - Elemento do modal
     */
    async handleUpdateRule(ruleId, modal) {
        const form = document.getElementById('form-edit-recorrencia');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = {
            name: document.getElementById('rec-name').value.trim(),
            description: document.getElementById('rec-description').value.trim() || null,
            type: document.getElementById('rec-type').value,
            value: parseFloat(document.getElementById('rec-value').value),
            category: document.getElementById('rec-category').value.trim() || null,
            subcategory: document.getElementById('rec-subcategory')?.value.trim() || null,
            recurrence_type: document.getElementById('rec-recurrence-type').value,
            recurrence_day: parseInt(document.getElementById('rec-recurrence-day').value, 10),
            sender_receiver: document.getElementById('rec-sender-receiver')?.value.trim() || null,
            notes: document.getElementById('rec-notes')?.value.trim() || null
        };

        // Remover campos null
        Object.keys(formData).forEach(key => {
            if (formData[key] === null || formData[key] === '') {
                delete formData[key];
            }
        });

        try {
            await updateRecurrenceRule(ruleId, formData);
            showToast('Regra atualizada com sucesso', { 
                type: 'success',
                title: 'Sucesso'
            });
            // ALTERAÇÃO: Usar sistema de modais.js
            fecharModal('modal-recorrencia-editar');
            // ALTERAÇÃO: Cleanup após fechar modal
            this.cleanupModalListeners('editRule');
            // ALTERAÇÃO: Invalidar cache antes de recarregar
            cacheManager.delete('recurrence_rules_active');
            // ALTERAÇÃO: Recarregar regras diretamente para garantir que os cards sejam atualizados
            await this.loadRules();
            // ALTERAÇÃO: Atualizar todos os managers financeiros (forçar atualização)
            const { refreshAllFinancialManagers } = await import('../../utils/financial-entity-utils.js');
            await refreshAllFinancialManagers({
                updateMovements: false,
                updateDashboard: false,
                updatePendingPayments: false,
                updatePurchases: false,
                updateRecurrences: true,
                forceUpdate: true
            });
        } catch (error) {
            // ALTERAÇÃO: Melhorar tratamento de erros na API
            let errorMessage = 'Erro ao atualizar regra';
            
            if (error.message) {
                errorMessage = error.message;
            } else if (error.error) {
                errorMessage = error.error;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            showToast(errorMessage, { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Processa criação de nova regra
     * @param {HTMLElement} modal - Elemento do modal
     */
    async handleCreateRule(modal) {
        // ALTERAÇÃO: Validar todos os campos antes de processar
        const nameInput = document.getElementById('rec-new-name');
        const typeSelect = document.getElementById('rec-new-type');
        const valueInput = document.getElementById('rec-new-value');
        const categoryInput = document.getElementById('rec-new-category');
        const recurrenceTypeSelect = document.getElementById('rec-new-recurrence-type');
        const recurrenceDayInput = document.getElementById('rec-new-recurrence-day');
        const descriptionInput = document.getElementById('rec-new-description');

        let isValid = true;

        // Validar cada campo obrigatório
        if (!this.validateName(nameInput)) isValid = false;
        if (!this.validateType(typeSelect)) isValid = false;
        if (!this.validateValue(valueInput)) isValid = false;
        if (!this.validateCategory(categoryInput)) isValid = false;
        if (!this.validateRecurrenceType(recurrenceTypeSelect)) isValid = false;
        if (!this.validateRecurrenceDay(recurrenceDayInput)) isValid = false;
        if (descriptionInput && !this.validateDescription(descriptionInput)) isValid = false;

        if (!isValid) {
            showToast('Corrija os erros no formulário antes de salvar', { 
                type: 'error',
                title: 'Validação'
            });
            // Focar no primeiro campo com erro
            const firstError = modal.querySelector('.error');
            if (firstError) {
                firstError.focus();
            }
            return;
        }

        // ALTERAÇÃO: Converter valor monetário formatado (com vírgula) para número
        let value = 0;
        if (valueInput && valueInput.value) {
            // Remover pontos de milhar e substituir vírgula por ponto
            const valueStr = valueInput.value.replace(/\./g, '').replace(',', '.');
            value = parseFloat(valueStr) || 0;
        }

        const formData = {
            name: nameInput.value.trim(),
            description: descriptionInput?.value.trim() || null,
            type: typeSelect.value,
            value: value,
            category: categoryInput.value.trim(),
            subcategory: document.getElementById('rec-new-subcategory')?.value.trim() || null,
            recurrence_type: recurrenceTypeSelect.value,
            recurrence_day: parseInt(recurrenceDayInput.value, 10),
            sender_receiver: document.getElementById('rec-new-sender-receiver')?.value.trim() || null,
            notes: document.getElementById('rec-new-notes')?.value.trim() || null
        };

        // Validar valor novamente (garantir que é maior que zero)
        if (formData.value <= 0) {
            this.validateValue(valueInput);
            showToast('O valor deve ser maior que zero', { 
                type: 'error',
                title: 'Validação'
            });
            valueInput.focus();
            return;
        }

        // Remover campos null
        Object.keys(formData).forEach(key => {
            if (formData[key] === null || formData[key] === '') {
                delete formData[key];
            }
        });

        try {
            await createRecurrenceRule(formData);
            showToast('Regra criada com sucesso', { 
                type: 'success',
                title: 'Sucesso'
            });
            // ALTERAÇÃO: Usar sistema de modais.js
            fecharModal('modal-recorrencia-nova');
            // ALTERAÇÃO: Cleanup após fechar modal
            this.cleanupModalListeners('newRule');
            // ALTERAÇÃO: Invalidar cache antes de recarregar
            const { cacheManager } = await import('../../utils/cache-manager.js');
            cacheManager.delete('recurrence_rules_active');
            // ALTERAÇÃO: Recarregar regras diretamente para garantir que os cards sejam exibidos
            await this.loadRules();
            // ALTERAÇÃO: Atualizar todos os managers financeiros (forçar atualização)
            const { refreshAllFinancialManagers } = await import('../../utils/financial-entity-utils.js');
            await refreshAllFinancialManagers({
                updateMovements: false,
                updateDashboard: false,
                updatePendingPayments: false,
                updatePurchases: false,
                updateRecurrences: true,
                forceUpdate: true
            });
        } catch (error) {
            // ALTERAÇÃO: Melhorar tratamento de erros na API
            let errorMessage = 'Erro ao criar regra';
            
            if (error.message) {
                errorMessage = error.message;
            } else if (error.error) {
                errorMessage = error.error;
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            showToast(errorMessage, { 
                type: 'error',
                title: 'Erro'
            });
        }
    }

    /**
     * Desativa uma regra
     * @param {number} ruleId - ID da regra
     */
    async deleteRule(ruleId) {
        // ALTERAÇÃO: Validar ruleId antes de processar
        const validatedRuleId = this.validateRuleId(ruleId);
        if (!validatedRuleId) {
            showToast('ID de regra inválido', { 
                type: 'error',
                title: 'Erro'
            });
            return;
        }
        
        const confirmed = await showConfirm({
            title: 'Desativar Regra',
            message: 'Deseja realmente desativar esta regra de recorrência?',
            confirmText: 'Desativar',
            cancelText: 'Cancelar',
            type: 'warning'
        });

        if (!confirmed) return;

        try {
            await deleteRecurrenceRule(validatedRuleId);
            showToast('Regra desativada com sucesso', { 
                type: 'success',
                title: 'Sucesso'
            });
            // ALTERAÇÃO: Invalidar cache antes de recarregar
            cacheManager.delete('recurrence_rules_active');
            // ALTERAÇÃO: Recarregar regras diretamente para garantir que os cards sejam atualizados
            await this.loadRules();
            // ALTERAÇÃO: Atualizar todos os managers financeiros (forçar atualização)
            const { refreshAllFinancialManagers } = await import('../../utils/financial-entity-utils.js');
            await refreshAllFinancialManagers({
                updateMovements: false,
                updateDashboard: false,
                updatePendingPayments: false,
                updatePurchases: false,
                updateRecurrences: true,
                forceUpdate: true
            });
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao desativar regra', { 
                type: 'error',
                title: 'Erro'
            });
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
     * ALTERAÇÃO: Configura máscaras e validações para modal de nova regra
     * @param {HTMLElement} modal - Elemento do modal
     */
    setupMasksAndValidationsNewRule(modal) {
        // Máscara monetária para campo de valor
        const valueInput = document.getElementById('rec-new-value');
        if (valueInput) {
            // Converter input number para text para aplicar máscara
            valueInput.type = 'text';
            valueInput.setAttribute('inputmode', 'decimal');
            
            const valueHandler = (e) => {
                this.applyCurrencyMask(e.target);
                this.validateValue(e.target);
            };
            
            valueInput.addEventListener('input', valueHandler);
            valueInput.addEventListener('blur', (e) => {
                this.validateValue(e.target);
            });
            valueInput.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: valueInput, event: 'input', handler: valueHandler });
        }

        // Validação de nome (obrigatório)
        const nameInput = document.getElementById('rec-new-name');
        if (nameInput) {
            const nameHandler = (e) => {
                this.applyNameMask(e.target);
                this.validateName(e.target);
            };
            
            nameInput.addEventListener('input', nameHandler);
            nameInput.addEventListener('blur', (e) => {
                this.validateName(e.target);
            });
            nameInput.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: nameInput, event: 'input', handler: nameHandler });
        }

        // Validação de categoria (obrigatório)
        const categoryInput = document.getElementById('rec-new-category');
        if (categoryInput) {
            const categoryHandler = (e) => {
                this.applyNameMask(e.target);
                this.validateCategory(e.target);
            };
            
            categoryInput.addEventListener('input', categoryHandler);
            categoryInput.addEventListener('blur', (e) => {
                this.validateCategory(e.target);
            });
            categoryInput.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: categoryInput, event: 'input', handler: categoryHandler });
        }

        // Máscara de nome para subcategoria (opcional)
        const subcategoryInput = document.getElementById('rec-new-subcategory');
        if (subcategoryInput) {
            const subcategoryHandler = (e) => {
                this.applyNameMask(e.target);
            };
            
            subcategoryInput.addEventListener('input', subcategoryHandler);
            this.modalEventListeners.newRule.push({ element: subcategoryInput, event: 'input', handler: subcategoryHandler });
        }

        // Máscara de nome para remetente/destinatário (opcional)
        const senderReceiverInput = document.getElementById('rec-new-sender-receiver');
        if (senderReceiverInput) {
            const senderReceiverHandler = (e) => {
                this.applyNameMask(e.target);
            };
            
            senderReceiverInput.addEventListener('input', senderReceiverHandler);
            this.modalEventListeners.newRule.push({ element: senderReceiverInput, event: 'input', handler: senderReceiverHandler });
        }

        // Validação de tipo (obrigatório)
        const typeSelect = document.getElementById('rec-new-type');
        if (typeSelect) {
            const typeHandler = (e) => {
                this.validateType(e.target);
            };
            
            typeSelect.addEventListener('change', typeHandler);
            typeSelect.addEventListener('blur', typeHandler);
            typeSelect.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: typeSelect, event: 'change', handler: typeHandler });
        }

        // Validação de tipo de recorrência (obrigatório)
        const recurrenceTypeSelect = document.getElementById('rec-new-recurrence-type');
        if (recurrenceTypeSelect) {
            const recurrenceTypeHandler = (e) => {
                this.validateRecurrenceType(e.target);
            };
            
            recurrenceTypeSelect.addEventListener('change', recurrenceTypeHandler);
            recurrenceTypeSelect.addEventListener('blur', recurrenceTypeHandler);
            recurrenceTypeSelect.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: recurrenceTypeSelect, event: 'change', handler: recurrenceTypeHandler });
        }

        // Validação de dia de recorrência (obrigatório)
        const recurrenceDayInput = document.getElementById('rec-new-recurrence-day');
        if (recurrenceDayInput) {
            const recurrenceDayHandler = (e) => {
                this.validateRecurrenceDay(e.target);
            };
            
            recurrenceDayInput.addEventListener('input', recurrenceDayHandler);
            recurrenceDayInput.addEventListener('blur', recurrenceDayHandler);
            recurrenceDayInput.addEventListener('focus', (e) => {
                clearFieldValidation(e.target);
            });
            
            this.modalEventListeners.newRule.push({ element: recurrenceDayInput, event: 'input', handler: recurrenceDayHandler });
        }

        // Validação de descrição (opcional, mas com limite de caracteres)
        const descriptionInput = document.getElementById('rec-new-description');
        if (descriptionInput) {
            const descriptionHandler = (e) => {
                this.validateDescription(e.target);
            };
            
            descriptionInput.addEventListener('input', descriptionHandler);
            descriptionInput.addEventListener('blur', descriptionHandler);
            
            this.modalEventListeners.newRule.push({ element: descriptionInput, event: 'input', handler: descriptionHandler });
        }
    }

    /**
     * ALTERAÇÃO: Aplica máscara monetária brasileira (R$ 0,00)
     * @param {HTMLInputElement} input - Campo de input
     */
    applyCurrencyMask(input) {
        let value = input.value;
        
        // Remover tudo exceto números e vírgula
        value = value.replace(/[^\d,]/g, '');
        
        // Garantir apenas uma vírgula
        const parts = value.split(',');
        if (parts.length > 2) {
            value = parts[0] + ',' + parts.slice(1).join('');
        }
        
        // Limitar a 2 casas decimais após a vírgula
        if (parts.length === 2 && parts[1].length > 2) {
            value = parts[0] + ',' + parts[1].substring(0, 2);
        }
        
        if (value === '' || value === ',') {
            input.value = '';
            return;
        }
        
        // Separar parte inteira e decimal
        let [integerPart, decimalPart = ''] = value.split(',');
        
        // Remover zeros à esquerda da parte inteira
        integerPart = integerPart.replace(/^0+/, '') || '0';
        
        // Formatar parte inteira com pontos de milhar
        integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        
        // Combinar partes
        input.value = decimalPart ? `${integerPart},${decimalPart}` : integerPart;
    }

    /**
     * ALTERAÇÃO: Aplica máscara de nome (letras, números e caracteres especiais permitidos)
     * @param {HTMLInputElement} input - Campo de input
     */
    applyNameMask(input) {
        let value = input.value;
        // Permitir letras (incluindo acentos), números, espaços, pontos, hífens, apóstrofos, vírgulas, & e parênteses
        value = value.replace(/[^A-Za-zÀ-ÿ0-9\s\.\-\',&()]/g, '');
        input.value = value;
    }

    /**
     * ALTERAÇÃO: Valida campo de valor monetário
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateValue(input) {
        const value = input.value.replace(/\./g, '').replace(',', '.');
        const numValue = parseFloat(value);
        
        if (!value || value.trim() === '') {
            return applyFieldValidation(input, () => ({ valid: false, message: 'Valor é obrigatório' }));
        }
        
        if (isNaN(numValue) || numValue <= 0) {
            return applyFieldValidation(input, () => ({ valid: false, message: 'Valor deve ser maior que zero' }));
        }
        
        return applyFieldValidation(input, () => ({ valid: true, message: '' }));
    }

    /**
     * ALTERAÇÃO: Valida campo de nome
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateName(input) {
        return applyFieldValidation(
            input,
            (value) => validateRequired(value, 'Nome'),
            true
        );
    }

    /**
     * ALTERAÇÃO: Valida campo de categoria
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateCategory(input) {
        return applyFieldValidation(
            input,
            (value) => validateRequired(value, 'Categoria'),
            true
        );
    }

    /**
     * ALTERAÇÃO: Valida campo de tipo
     * @param {HTMLSelectElement} input - Campo de select
     * @returns {boolean} True se válido
     */
    validateType(input) {
        return applyFieldValidation(
            input,
            (value) => validateRequired(value, 'Tipo'),
            true
        );
    }

    /**
     * ALTERAÇÃO: Valida campo de tipo de recorrência
     * @param {HTMLSelectElement} input - Campo de select
     * @returns {boolean} True se válido
     */
    validateRecurrenceType(input) {
        return applyFieldValidation(
            input,
            (value) => validateRequired(value, 'Tipo de Recorrência'),
            true
        );
    }

    /**
     * ALTERAÇÃO: Valida campo de dia de recorrência
     * @param {HTMLInputElement} input - Campo de input
     * @returns {boolean} True se válido
     */
    validateRecurrenceDay(input) {
        const recurrenceTypeSelect = document.getElementById('rec-new-recurrence-type');
        const recurrenceType = recurrenceTypeSelect?.value;
        
        if (!recurrenceType) {
            return applyFieldValidation(
                input,
                () => ({ valid: false, message: 'Selecione o tipo de recorrência primeiro' }),
                true
            );
        }
        
        const dayValue = parseInt(input.value, 10);
        let min = 1;
        let max = 31;
        
        switch (recurrenceType) {
            case 'MONTHLY':
                min = 1;
                max = 31;
                break;
            case 'WEEKLY':
                min = 1;
                max = 7;
                break;
            case 'YEARLY':
                min = 1;
                max = 365;
                break;
        }
        
        if (!input.value || input.value.trim() === '') {
            return applyFieldValidation(
                input,
                () => ({ valid: false, message: 'Dia da recorrência é obrigatório' }),
                true
            );
        }
        
        if (isNaN(dayValue) || dayValue < min || dayValue > max) {
            return applyFieldValidation(
                input,
                () => ({ valid: false, message: `Dia deve estar entre ${min} e ${max}` }),
                true
            );
        }
        
        return applyFieldValidation(input, () => ({ valid: true, message: '' }), true);
    }

    /**
     * ALTERAÇÃO: Valida campo de descrição
     * @param {HTMLTextAreaElement} input - Campo de textarea
     * @returns {boolean} True se válido
     */
    validateDescription(input) {
        return applyFieldValidation(
            input,
            (value) => validateLength(value || '', { maxLength: 500, fieldName: 'Descrição' }),
            true
        );
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
}

