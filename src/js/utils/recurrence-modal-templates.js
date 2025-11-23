/**
 * Templates para modais de recorrência
 * Centraliza o HTML dos modais para melhor manutenção
 */

import { escapeHTML } from './html-sanitizer.js';

/**
 * Template para modal de criação de nova regra de recorrência
 * @returns {string} HTML do modal
 */
export function getNewRuleModalTemplate() {
    return `
        <div class="div-overlay"></div>
        <div class="modal-content">
            <div class="header-modal">
                <h2>Nova Regra de Recorrência</h2>
                <i class="fa-solid fa-xmark fechar-modal" data-close-modal="modal-recorrencia-nova" aria-label="Fechar modal"></i>
            </div>
            <div class="conteudo-modal">
                <form id="form-new-recorrencia" class="form-modal">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-new-name" 
                                   required placeholder="Ex: Aluguel, Salário, etc.">
                            <label for="rec-new-name">Nome *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <textarea id="rec-new-description" rows="3" 
                                      placeholder="Descrição da regra"></textarea>
                            <label for="rec-new-description">Descrição</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select id="rec-new-type" required>
                                <option value="">Selecione...</option>
                                <option value="EXPENSE">Despesa</option>
                                <option value="TAX">Imposto</option>
                            </select>
                            <label for="rec-new-type">Tipo *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="number" id="rec-new-value" 
                                   step="0.01" min="0.01" required placeholder="0.00">
                            <label for="rec-new-value">Valor *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-new-category" 
                                   required placeholder="Ex: Alimentação, Salário, etc.">
                            <label for="rec-new-category">Categoria *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-new-subcategory" 
                                   placeholder="Ex: Aluguel, Salário, etc.">
                            <label for="rec-new-subcategory">Subcategoria</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select id="rec-new-recurrence-type" required>
                                <option value="">Selecione...</option>
                                <option value="MONTHLY">Mensal</option>
                                <option value="WEEKLY">Semanal</option>
                                <option value="YEARLY">Anual</option>
                            </select>
                            <label for="rec-new-recurrence-type">Tipo de Recorrência *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="number" id="rec-new-recurrence-day" 
                                   min="1" max="31" required 
                                   placeholder="Dia do mês (1-31), dia da semana (1-7) ou dia do ano (1-365)">
                            <label for="rec-new-recurrence-day">Dia da Recorrência *</label>
                            <small class="form-text" id="rec-new-day-help">Selecione o tipo de recorrência primeiro</small>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-new-sender-receiver" 
                                   placeholder="Ex: Empresa XYZ, João Silva, etc.">
                            <label for="rec-new-sender-receiver">Remetente/Destinatário</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <textarea id="rec-new-notes" rows="3" 
                                      placeholder="Observações adicionais"></textarea>
                            <label for="rec-new-notes">Observações</label>
                        </div>
                    </div>
                </form>
            </div>
            <div class="footer-modal">
                <button type="button" class="btn-cancelar" data-close-modal="modal-recorrencia-nova">Cancelar</button>
                <button type="button" class="btn-salvar" id="btn-save-new-recorrencia">Criar Regra</button>
            </div>
        </div>
    `;
}

/**
 * Template para modal de edição de regra de recorrência
 * @param {Object} rule - Dados da regra
 * @returns {string} HTML do modal
 */
export function getEditRuleModalTemplate(rule) {
    const ruleId = rule.id || rule.rule_id;
    const ruleName = escapeHTML(rule.name || '');
    const description = escapeHTML(rule.description || '');
    const value = parseFloat(rule.value || rule.amount || 0);
    const type = rule.type || 'EXPENSE';
    const category = escapeHTML(rule.category || '');
    const subcategory = escapeHTML(rule.subcategory || '');
    const recurrenceType = rule.recurrence_type || rule.recurrenceType || 'MONTHLY';
    const recurrenceDay = rule.recurrence_day || rule.recurrenceDay || 1;
    const senderReceiver = escapeHTML(rule.sender_receiver || '');
    const notes = escapeHTML(rule.notes || '');

    return `
        <div class="div-overlay"></div>
        <div class="modal-content">
            <div class="header-modal">
                <h2>Editar Regra de Recorrência</h2>
                <i class="fa-solid fa-xmark fechar-modal" data-close-modal="modal-recorrencia-editar" aria-label="Fechar modal"></i>
            </div>
            <div class="conteudo-modal">
                <form id="form-edit-recorrencia" class="form-modal">
                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-name" 
                                   value="${ruleName}" required placeholder="Ex: Aluguel, Salário, etc.">
                            <label for="rec-name" class="${ruleName ? 'active' : ''}">Nome *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <textarea id="rec-description" rows="3" 
                                      placeholder="Descrição da regra">${description}</textarea>
                            <label for="rec-description" class="${description ? 'active' : ''}">Descrição</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select id="rec-type" required>
                                <option value="EXPENSE" ${type === 'EXPENSE' ? 'selected' : ''}>Despesa</option>
                                <option value="TAX" ${type === 'TAX' ? 'selected' : ''}>Imposto</option>
                            </select>
                            <label for="rec-type" class="active">Tipo *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="number" id="rec-value" step="0.01" min="0" 
                                   value="${value}" required placeholder="0.00">
                            <label for="rec-value" class="${value ? 'active' : ''}">Valor *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-category" 
                                   value="${category}" placeholder="Ex: Alimentação, Salário, etc.">
                            <label for="rec-category" class="${category ? 'active' : ''}">Categoria</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-subcategory" 
                                   value="${subcategory}" 
                                   placeholder="Ex: Aluguel, Salário, etc.">
                            <label for="rec-subcategory" class="${subcategory ? 'active' : ''}">Subcategoria</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <select id="rec-recurrence-type" required>
                                <option value="MONTHLY" ${recurrenceType === 'MONTHLY' ? 'selected' : ''}>Mensal</option>
                                <option value="WEEKLY" ${recurrenceType === 'WEEKLY' ? 'selected' : ''}>Semanal</option>
                                <option value="YEARLY" ${recurrenceType === 'YEARLY' ? 'selected' : ''}>Anual</option>
                            </select>
                            <label for="rec-recurrence-type" class="active">Tipo de Recorrência *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="number" id="rec-recurrence-day" 
                                   min="1" max="31" value="${recurrenceDay}" required 
                                   placeholder="Dia do mês (1-31) ou dia da semana (1-7)">
                            <label for="rec-recurrence-day" class="${recurrenceDay ? 'active' : ''}">Dia da Recorrência *</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <input type="text" id="rec-sender-receiver" 
                                   value="${senderReceiver}" 
                                   placeholder="Ex: Empresa XYZ, João Silva, etc.">
                            <label for="rec-sender-receiver" class="${senderReceiver ? 'active' : ''}">Remetente/Destinatário</label>
                        </div>
                    </div>

                    <div class="form-field-wrapper">
                        <div class="div-input">
                            <textarea id="rec-notes" rows="3" 
                                      placeholder="Observações adicionais">${notes}</textarea>
                            <label for="rec-notes" class="${notes ? 'active' : ''}">Observações</label>
                        </div>
                    </div>
                </form>
            </div>
            <div class="footer-modal">
                <button type="button" class="btn-cancelar" data-close-modal="modal-recorrencia-editar">Cancelar</button>
                <button type="button" class="btn-salvar" id="btn-save-recorrencia">Atualizar</button>
            </div>
        </div>
    `;
}

