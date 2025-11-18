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

export class RecorrenciasManager {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.rules = [];
        this.isInitialized = false;
        this.isLoading = false;
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
            console.error('Erro ao gerar movimentações:', error);
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
    openNewRuleModal() {
        // TODO: Implementar modal de nova regra
        showToast('Funcionalidade em desenvolvimento', { 
            type: 'info',
            title: 'Em desenvolvimento'
        });
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
            this.showEditRuleModal(rule);
        } catch (error) {
            console.error('Erro ao carregar regra:', error);
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
    showEditRuleModal(rule) {
        // Criar ou obter modal
        let modal = document.getElementById('modal-recorrencia-editar');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-recorrencia-editar';
            modal.className = 'modal';
            document.body.appendChild(modal);
        }

        const ruleId = rule.id || rule.rule_id;
        const ruleName = escapeHTML(rule.name || '');
        const description = escapeHTML(rule.description || '');
        const value = parseFloat(rule.value || rule.amount || 0);
        const type = rule.type || 'EXPENSE';
        const category = escapeHTML(rule.category || '');
        const recurrenceType = rule.recurrence_type || rule.recurrenceType || 'MONTHLY';
        const recurrenceDay = rule.recurrence_day || rule.recurrenceDay || 1;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="header-modal">
                    <h2>Editar Regra de Recorrência</h2>
                    <i class="fa-solid fa-xmark fechar-modal" onclick="document.getElementById('modal-recorrencia-editar').style.display='none'" aria-label="Fechar modal"></i>
                </div>
                <div class="conteudo-modal">
                    <form id="form-edit-recorrencia" class="form-modal">
                        <div class="form-group">
                            <label for="rec-name">Nome *</label>
                            <input type="text" id="rec-name" class="form-input" 
                                   value="${ruleName}" required placeholder="Ex: Aluguel, Salário, etc.">
                        </div>

                        <div class="form-group">
                            <label for="rec-description">Descrição</label>
                            <textarea id="rec-description" class="form-input" rows="3" 
                                      placeholder="Descrição da regra">${description}</textarea>
                        </div>

                        <div class="form-group">
                            <label for="rec-type">Tipo *</label>
                            <select id="rec-type" class="form-input" required>
                                <option value="REVENUE" ${type === 'REVENUE' ? 'selected' : ''}>Receita</option>
                                <option value="EXPENSE" ${type === 'EXPENSE' ? 'selected' : ''}>Despesa</option>
                                <option value="CMV" ${type === 'CMV' ? 'selected' : ''}>CMV</option>
                                <option value="TAX" ${type === 'TAX' ? 'selected' : ''}>Imposto</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="rec-value">Valor *</label>
                            <input type="number" id="rec-value" class="form-input" step="0.01" min="0" 
                                   value="${value}" required placeholder="0.00">
                        </div>

                        <div class="form-group">
                            <label for="rec-category">Categoria</label>
                            <input type="text" id="rec-category" class="form-input" 
                                   value="${category}" placeholder="Ex: Alimentação, Salário, etc.">
                        </div>

                        <div class="form-group">
                            <label for="rec-recurrence-type">Tipo de Recorrência *</label>
                            <select id="rec-recurrence-type" class="form-input" required>
                                <option value="MONTHLY" ${recurrenceType === 'MONTHLY' ? 'selected' : ''}>Mensal</option>
                                <option value="WEEKLY" ${recurrenceType === 'WEEKLY' ? 'selected' : ''}>Semanal</option>
                                <option value="YEARLY" ${recurrenceType === 'YEARLY' ? 'selected' : ''}>Anual</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="rec-recurrence-day">Dia da Recorrência *</label>
                            <input type="number" id="rec-recurrence-day" class="form-input" 
                                   min="1" max="31" value="${recurrenceDay}" required 
                                   placeholder="Dia do mês (1-31) ou dia da semana (1-7)">
                        </div>
                    </form>
                </div>
                <div class="footer-modal">
                    <button type="button" class="btn-cancelar" onclick="document.getElementById('modal-recorrencia-editar').style.display='none'">Cancelar</button>
                    <button type="button" class="btn-salvar" id="btn-save-recorrencia">Atualizar</button>
                </div>
            </div>
        `;

        modal.style.display = 'block';

        // Configurar event listener do botão salvar
        const btnSave = document.getElementById('btn-save-recorrencia');
        if (btnSave) {
            btnSave.addEventListener('click', async () => {
                await this.handleUpdateRule(ruleId, modal);
            });
        }

        // Fechar ao clicar fora
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
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
            recurrence_type: document.getElementById('rec-recurrence-type').value,
            recurrence_day: parseInt(document.getElementById('rec-recurrence-day').value, 10)
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
            modal.style.display = 'none';
            await this.loadRules();
        } catch (error) {
            // ALTERAÇÃO: Removido console.error - erro já é exibido ao usuário via toast
            showToast('Erro ao atualizar regra', { 
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

