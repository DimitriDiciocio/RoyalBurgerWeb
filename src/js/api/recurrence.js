/**
 * API de Regras de Recorrência
 */

import { apiRequest, API_BASE_URL } from './api.js';

const RECURRENCE_API_BASE = `${API_BASE_URL}/api/recurrence`;

/**
 * Lista regras de recorrência
 * @param {boolean} activeOnly - Apenas regras ativas
 * @returns {Promise<Array>}
 */
export async function getRecurrenceRules(activeOnly = true) {
    const params = new URLSearchParams({ active_only: activeOnly.toString() });
    return apiRequest(`${RECURRENCE_API_BASE}/rules?${params.toString()}`, { method: 'GET' });
}

/**
 * Cria uma nova regra de recorrência
 * @param {Object} ruleData - Dados da regra
 * @returns {Promise<Object>}
 */
export async function createRecurrenceRule(ruleData) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules`, {
        method: 'POST',
        body: ruleData
    });
}

/**
 * Atualiza uma regra de recorrência
 * @param {number} ruleId - ID da regra
 * @param {Object} ruleData - Dados atualizados
 * @returns {Promise<Object>}
 */
export async function updateRecurrenceRule(ruleId, ruleData) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules/${ruleId}`, {
        method: 'PATCH',
        body: ruleData
    });
}

/**
 * Deleta uma regra de recorrência
 * @param {number} ruleId - ID da regra
 * @returns {Promise<Object>}
 */
export async function deleteRecurrenceRule(ruleId) {
    return apiRequest(`${RECURRENCE_API_BASE}/rules/${ruleId}`, { method: 'DELETE' });
}

/**
 * Gera movimentações recorrentes para um período
 * @param {number|null} year - Ano (opcional)
 * @param {number|null} month - Mês (opcional)
 * @param {number|null} week - Semana (opcional)
 * @returns {Promise<Object>}
 */
export async function generateRecurringMovements(year = null, month = null, week = null) {
    const data = {};
    if (year) data.year = year;
    if (month) data.month = month;
    if (week) data.week = week;
    
    return apiRequest(`${RECURRENCE_API_BASE}/generate`, {
        method: 'POST',
        body: data
    });
}

