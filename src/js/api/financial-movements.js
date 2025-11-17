/**
 * API de Movimentações Financeiras
 * Gerencia todas as requisições relacionadas ao fluxo de caixa
 */

import { apiRequest, API_BASE_URL } from './api.js';
import { formatDateForISO } from '../utils/date-formatter.js';

const FINANCIAL_API_BASE = `${API_BASE_URL}/api/financial-movements`;

/**
 * Lista movimentações financeiras com filtros
 * @param {Object} filters - Filtros de busca
 * @returns {Promise<Array>}
 */
export async function getFinancialMovements(filters = {}) {
    const params = new URLSearchParams();
    
    // Apenas adicionar parâmetros se não forem null/undefined
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.type) params.append('type', filters.type);
    if (filters.category) params.append('category', filters.category);
    if (filters.payment_status) params.append('payment_status', filters.payment_status);
    if (filters.related_entity_type) params.append('related_entity_type', filters.related_entity_type);
    if (filters.related_entity_id) params.append('related_entity_id', filters.related_entity_id);
    if (filters.reconciled !== undefined && filters.reconciled !== null) {
        params.append('reconciled', filters.reconciled);
    }
    
    const url = `${FINANCIAL_API_BASE}/movements${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, { method: 'GET' });
}

/**
 * Cria uma nova movimentação financeira
 * @param {Object} movementData - Dados da movimentação
 * @returns {Promise<Object>}
 */
export async function createFinancialMovement(movementData) {
    return apiRequest(`${FINANCIAL_API_BASE}/movements`, {
        method: 'POST',
        body: movementData
    });
}

/**
 * Obtém uma movimentação financeira por ID
 * @param {number} movementId - ID da movimentação
 * @returns {Promise<Object>}
 */
export async function getFinancialMovementById(movementId) {
    return apiRequest(`${FINANCIAL_API_BASE}/movements/${movementId}`, { method: 'GET' });
}

/**
 * Atualiza uma movimentação financeira
 * @param {number} movementId - ID da movimentação
 * @param {Object} movementData - Dados atualizados
 * @returns {Promise<Object>}
 */
export async function updateFinancialMovement(movementId, movementData) {
    return apiRequest(`${FINANCIAL_API_BASE}/movements/${movementId}`, {
        method: 'PATCH',
        body: movementData
    });
}

/**
 * Atualiza status de pagamento de uma movimentação
 * @param {number} movementId - ID da movimentação
 * @param {string} paymentStatus - 'Pending' ou 'Paid'
 * @param {string} movementDate - Data do movimento (opcional)
 * @returns {Promise<Object>}
 */
export async function updatePaymentStatus(movementId, paymentStatus, movementDate = null) {
    const data = { payment_status: paymentStatus };
    if (movementDate) data.movement_date = movementDate;
    
    return apiRequest(`${FINANCIAL_API_BASE}/movements/${movementId}/payment-status`, {
        method: 'PATCH',
        body: data
    });
}

/**
 * Obtém resumo do fluxo de caixa
 * @param {string} period - 'this_month', 'last_month', 'last_30_days', 'custom'
 * @param {boolean} includePending - Incluir pendências
 * @returns {Promise<Object>}
 */
export async function getCashFlowSummary(period = 'this_month', includePending = false) {
    const params = new URLSearchParams({
        period,
        include_pending: includePending.toString()
    });
    
    return apiRequest(`${FINANCIAL_API_BASE}/summary?${params.toString()}`, { method: 'GET' });
}

/**
 * Lista contas a pagar (movimentações pendentes)
 * @param {Object} filters - Filtros opcionais
 * @returns {Promise<Array>}
 */
export async function getPendingPayments(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    
    const url = `${FINANCIAL_API_BASE}/pending${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, { method: 'GET' });
}

/**
 * Marca movimentação como reconciliada
 * @param {number} movementId - ID da movimentação
 * @param {boolean} reconciled - true para reconciliada
 * @returns {Promise<Object>}
 */
export async function reconcileMovement(movementId, reconciled = true) {
    return apiRequest(
        `${FINANCIAL_API_BASE}/movements/${movementId}/reconcile`,
        {
            method: 'PATCH',
            body: { reconciled }
        }
    );
}

/**
 * Atualiza informações de gateway de pagamento
 * @param {number} movementId - ID da movimentação
 * @param {Object} gatewayData - Dados do gateway
 * @returns {Promise<Object>}
 */
export async function updateGatewayInfo(movementId, gatewayData) {
    return apiRequest(
        `${FINANCIAL_API_BASE}/movements/${movementId}/gateway-info`,
        {
            method: 'PATCH',
            body: gatewayData
        }
    );
}

/**
 * Obtém relatório de conciliação bancária
 * @param {Object} filters - Filtros de data e gateway
 * @returns {Promise<Object>}
 */
export async function getReconciliationReport(filters = {}) {
    const params = new URLSearchParams();
    
    // ALTERAÇÃO: Validar e adicionar apenas parâmetros válidos (não null, não undefined, não string vazia)
    // ALTERAÇÃO: Converter datas para formato ISO (AAAA-MM-DD) que o backend espera
    if (filters.start_date && filters.start_date !== 'null' && filters.start_date !== '') {
        const isoDate = formatDateForISO(filters.start_date);
        if (isoDate) {
            params.append('start_date', isoDate);
        }
    }
    if (filters.end_date && filters.end_date !== 'null' && filters.end_date !== '') {
        const isoDate = formatDateForISO(filters.end_date);
        if (isoDate) {
            params.append('end_date', isoDate);
        }
    }
    // ALTERAÇÃO: Não adicionar parâmetro reconciled se for null, undefined ou string 'null'
    if (filters.reconciled !== undefined && 
        filters.reconciled !== null && 
        filters.reconciled !== 'null' &&
        filters.reconciled !== '') {
        // Converter para boolean string se necessário
        const reconciledValue = filters.reconciled === true || filters.reconciled === 'true' ? 'true' : 'false';
        params.append('reconciled', reconciledValue);
    }
    if (filters.payment_gateway_id && 
        filters.payment_gateway_id !== 'null' && 
        filters.payment_gateway_id !== '' &&
        !isNaN(filters.payment_gateway_id)) {
        params.append('payment_gateway_id', filters.payment_gateway_id);
    }
    
    const url = `${FINANCIAL_API_BASE}/reconciliation-report${params.toString() ? '?' + params.toString() : ''}`;
    return apiRequest(url, { method: 'GET' });
}

