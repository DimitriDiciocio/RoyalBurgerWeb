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
import { escapeHTML } from '../../utils/html-sanitizer.js';
import { cacheManager } from '../../utils/cache-manager.js';

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
            const ruleId = rule.id || rule.rule_id;
            const ruleName = escapeHTML(rule.name || 'Regra sem nome');
            const description = escapeHTML(rule.description || '');
            const ruleType = (rule.type || 'EXPENSE').toLowerCase();
            const value = parseFloat(rule.value || rule.amount || 0);
            const recurrenceType = rule.recurrence_type || rule.recurrenceType || 'MONTHLY';
            const recurrenceDay = rule.recurrence_day || rule.recurrenceDay || 1;
            const category = escapeHTML(rule.category || 'Sem categoria');
            const typeLabel = this.translateType(rule.type || 'EXPENSE');

            return `
                <div class="recorrencia-card" data-rule-id="${ruleId}">
                    <div class="recorrencia-card-header">
                        <div>
                            <h4>${ruleName}</h4>
                            ${description ? `<p class="recorrencia-description">${description}</p>` : ''}
                        </div>
                        <span class="financial-badge type-${ruleType}">
                            ${escapeHTML(typeLabel)}
                        </span>
                    </div>
                    <div class="recorrencia-card-body">
                        <div class="recorrencia-info">
                            <div class="info-item">
                                <span class="label">Valor:</span>
                                <span class="value">R$ ${this.formatCurrency(value)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Recorrência:</span>
                                <span class="value">${this.formatRecurrenceType(recurrenceType, recurrenceDay)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Categoria:</span>
                                <span class="value">${category}</span>
                            </div>
                        </div>
                    </div>
                    <div class="recorrencia-card-footer">
                        <button class="financial-btn financial-btn-secondary" 
                                data-action="edit" 
                                data-rule-id="${ruleId}"
                                aria-label="Editar regra ${ruleName}">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i>
                            <span>Editar</span>
                        </button>
                        <button class="financial-btn financial-btn-danger" 
                                data-action="delete" 
                                data-rule-id="${ruleId}"
                                aria-label="Desativar regra ${ruleName}">
                            <i class="fa-solid fa-trash" aria-hidden="true"></i>
                            <span>Desativar</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
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
            
            // Recarregar regras para atualizar status
            await this.loadRules();
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
                const ruleId = parseInt(button.dataset.ruleId);

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
        try {
            const rule = this.rules.find(r => (r.id || r.rule_id) === ruleId);
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
            await this.loadRules();
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
        const form = document.getElementById('form-new-recorrencia');
        if (!form || !form.checkValidity()) {
            form?.reportValidity();
            return;
        }

        const formData = {
            name: document.getElementById('rec-new-name').value.trim(),
            description: document.getElementById('rec-new-description').value.trim() || null,
            type: document.getElementById('rec-new-type').value,
            value: parseFloat(document.getElementById('rec-new-value').value),
            category: document.getElementById('rec-new-category').value.trim(),
            subcategory: document.getElementById('rec-new-subcategory').value.trim() || null,
            recurrence_type: document.getElementById('rec-new-recurrence-type').value,
            recurrence_day: parseInt(document.getElementById('rec-new-recurrence-day').value, 10),
            sender_receiver: document.getElementById('rec-new-sender-receiver').value.trim() || null,
            notes: document.getElementById('rec-new-notes').value.trim() || null
        };

        // Validar campos obrigatórios
        if (!formData.name || !formData.type || !formData.category || !formData.value || 
            !formData.recurrence_type || !formData.recurrence_day) {
            showToast('Preencha todos os campos obrigatórios', { 
                type: 'error',
                title: 'Validação'
            });
            return;
        }

        // Validar valor
        if (formData.value <= 0) {
            showToast('O valor deve ser maior que zero', { 
                type: 'error',
                title: 'Validação'
            });
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
            await this.loadRules();
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
        const confirmed = await showConfirm({
            title: 'Desativar Regra',
            message: 'Deseja realmente desativar esta regra de recorrência?',
            confirmText: 'Desativar',
            cancelText: 'Cancelar',
            type: 'warning'
        });

        if (!confirmed) return;

        try {
            await deleteRecurrenceRule(ruleId);
            showToast('Regra desativada com sucesso', { 
                type: 'success',
                title: 'Sucesso'
            });
            await this.loadRules();
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
}

